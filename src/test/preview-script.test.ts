// scripts/preview.mjs run for real, beside the real harness.mjs, in a throwaway repository whose
// wrangler binary only records how it was started. dev-env.test.ts reads the script's source; this
// shows what it does: which arguments and variables reach wrangler, and which exit code comes back.
import { spawn, spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The handler is installed before the record is written, so a signal sent once the record exists
// always meets it.
const FAKE_WRANGLER = `import { writeFileSync } from 'node:fs';
const record = process.env.PREVIEW_RECORD;
const mode = process.env.PREVIEW_FAKE ?? '0';
if (mode === 'wait') {
	process.on('SIGTERM', () => {
		writeFileSync(record + '.sigterm', '');
		process.exit(0);
	});
	setInterval(() => {}, 1000);
}
const seen = ['CLOUDFLARE_INCLUDE_PROCESS_ENV', 'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV', 'WRANGLER_SEND_METRICS'];
writeFileSync(record, JSON.stringify({
	args: process.argv.slice(2),
	cwd: process.cwd(),
	pid: process.pid,
	env: Object.fromEntries(seen.map((name) => [name, process.env[name]]))
}));
if (mode === 'kill') process.kill(process.pid, 'SIGKILL');
else if (mode !== 'wait') process.exit(Number(mode));
`;

interface Record {
	args: string[];
	cwd: string;
	pid: number;
	env: { [name: string]: string | undefined };
}

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		// A fake left running by a failed signal test would hold nothing, but it is ended anyway.
		const pid = readRecord(root)?.pid;
		if (pid !== undefined) {
			try {
				process.kill(pid, 'SIGKILL');
			} catch {
				// Already gone.
			}
		}
		rmSync(root, { recursive: true, force: true });
	}
});

// The real path: Node resolves the script's own location through links, and the script changes into
// the folder above it, so every path the fake reports is under this one.
function repository({ built }: { built: boolean }): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'pagefifty-preview-')));
	roots.push(root);
	const files: [string, string][] = [
		['package.json', '{ "type": "module" }'],
		['env/no-keys.env', ''],
		['node_modules/wrangler/bin/wrangler.js', FAKE_WRANGLER]
	];
	if (built) files.push(['.svelte-kit/cloudflare/_worker.js', 'export default {};']);
	for (const [name, content] of files) {
		mkdirSync(join(root, name, '..'), { recursive: true });
		writeFileSync(join(root, name), content);
	}
	mkdirSync(join(root, 'scripts'));
	for (const name of ['preview.mjs', 'harness.mjs']) {
		copyFileSync(join('scripts', name), join(root, 'scripts', name));
	}
	return root;
}

const recordPath = (root: string) => join(root, 'record.json');

function readRecord(root: string): Record | undefined {
	const path = recordPath(root);
	return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record) : undefined;
}

// The shell asks for every variable and for the dotenv files; the script must override both.
function envFor(root: string, fake: string): NodeJS.ProcessEnv {
	return {
		...process.env,
		PREVIEW_RECORD: recordPath(root),
		PREVIEW_FAKE: fake,
		CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
		CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true'
	};
}

function runPreview(root: string, fake: string) {
	return spawnSync(process.execPath, [join(root, 'scripts', 'preview.mjs')], {
		env: envFor(root, fake),
		encoding: 'utf8',
		timeout: 20_000
	});
}

async function until(done: () => boolean): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (!done()) {
		if (Date.now() > deadline) throw new Error('waited 10 s for the fake wrangler to start');
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

describe('npm run preview', () => {
	it('refuses to start without a build and names the command that makes one', () => {
		const root = repository({ built: false });
		const result = runPreview(root, '0');
		expect([result.status, result.stderr]).toEqual([
			1,
			expect.stringContaining('run npm run build first')
		]);
		expect(readRecord(root)).toBeUndefined();
	});

	it('starts wrangler dev on 127.0.0.1:4173 with only the empty env file, whatever the shell asks', () => {
		const root = repository({ built: true });
		const result = runPreview(root, '0');
		expect(result.status).toBe(0);
		expect(readRecord(root)).toEqual({
			args: [
				'dev',
				'--ip',
				'127.0.0.1',
				'--port',
				'4173',
				'--env-file',
				join(root, 'env', 'no-keys.env')
			],
			cwd: root,
			pid: expect.any(Number),
			env: {
				CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
				CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
				WRANGLER_SEND_METRICS: 'false'
			}
		});
	});

	it("passes on wrangler's exit code", () => {
		expect(runPreview(repository({ built: true }), '7').status).toBe(7);
	});

	it('exits 1 when wrangler ends without an exit code of its own', () => {
		const root = repository({ built: true });
		expect(runPreview(root, 'kill').status).toBe(1);
		expect(readRecord(root)).toBeDefined();
	});

	// Windows has no SIGTERM to send: process.kill there ends the process outright.
	it.skipIf(process.platform === 'win32')(
		'passes a SIGTERM sent to it alone on to wrangler and exits when wrangler does',
		async () => {
			const root = repository({ built: true });
			const child = spawn(process.execPath, [join(root, 'scripts', 'preview.mjs')], {
				env: envFor(root, 'wait'),
				stdio: 'ignore'
			});
			const exited = new Promise<[number | null, string | null]>((resolve) => {
				child.on('exit', (code, signal) => resolve([code, signal]));
			});
			await until(() => readRecord(root) !== undefined);
			child.kill('SIGTERM');
			expect(await exited).toEqual([0, null]);
			expect(existsSync(`${recordPath(root)}.sigterm`)).toBe(true);
		}
	);
});

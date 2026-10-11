// scripts/check-provider-keys.mjs run as verify:ship runs it, on throwaway folders in the temp folder.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join('scripts', 'check-provider-keys.mjs');
const CANARY = 'pf-canary-test-5e1d';

const run = (...args: string[]) =>
	spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

const folders: string[] = [];

function folder(files: Record<string, string | Buffer> = {}): string {
	const dir = mkdtempSync(join(tmpdir(), 'pagefifty-provider-keys-'));
	folders.push(dir);
	for (const [name, content] of Object.entries(files)) {
		mkdirSync(join(dir, name, '..'), { recursive: true });
		writeFileSync(join(dir, name), content);
	}
	return dir;
}

afterEach(() => {
	for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the provider key check on built output', () => {
	it('passes a clean folder and says how much it scanned', () => {
		const clean = folder({ 'app/start.js': 'export const x = 1;', 'app/font.woff2': 'abc' });
		const result = run(clean, folder({ 'index.html': '<p>hi</p>' }));
		expect([result.status, result.stdout.trim()]).toEqual([
			0,
			'provider-keys: scanned 3 files in 2 folders, no key name or canary value'
		]);
	});

	it('fails on a key name in a .js file, naming the file and the name', () => {
		const dir = folder({ 'app/leak.js': 'const k = env.NEBIUS_API_KEY;' });
		const result = run(dir);
		expect(result.status).toBe(1);
		expect(result.stdout).toMatch(/provider-keys: .*app\/leak\.js: NEBIUS_API_KEY/);
	});

	it('fails on the other key name too', () => {
		const result = run(folder({ 'worker.js': 'TAVILY_API_KEY' }));
		expect([result.status, result.stdout]).toEqual([1, expect.stringMatching(/TAVILY_API_KEY/)]);
	});

	it('fails on a canary value among binary bytes without printing it', () => {
		const bytes = Buffer.concat([
			Buffer.from([0, 255, 1, 254]),
			Buffer.from(CANARY),
			Buffer.from([0, 7])
		]);
		const result = run(folder({ 'assets/blob.bin': bytes }), '--canary', CANARY);
		expect(result.status).toBe(1);
		expect(result.stdout).toMatch(/assets\/blob\.bin: a canary value/);
		expect(result.stdout + result.stderr).not.toContain(CANARY);
	});

	it('refuses an empty folder, since nothing scanned is never clean', () => {
		expect(run(folder()).status).toBe(2);
	});

	it('refuses a missing folder', () => {
		expect(run(join(folder({ 'a.js': '' }), 'missing')).status).toBe(2);
	});

	it('refuses --canary without a value, and no folder at all', () => {
		expect(run(folder({ 'a.js': '' }), '--canary').status).toBe(2);
		expect(run(folder({ 'a.js': '' }), '--canary', '').status).toBe(2);
		expect(run().status).toBe(2);
	});
});

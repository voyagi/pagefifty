// scripts/check-provider-keys.mjs run as verify:ship runs it, on throwaway folders in the temp folder.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

	// The scan keeps its own list of key names. Every variable the env template declares, less the
	// go-live switch, is a provider key, so a key added there and not to the list fails here instead
	// of shipping unscanned.
	it('fails on every key the env template declares', () => {
		const keys = readFileSync('.env.example', 'utf8')
			.split(/\r?\n/)
			.map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
			.filter((name): name is string => name !== undefined && name !== 'PAGEFIFTY_LIVE');
		expect(keys.length).toBeGreaterThanOrEqual(2);
		for (const key of keys) {
			const result = run(folder({ 'worker.js': `env.${key}` }));
			expect([key, result.status, result.stdout]).toEqual([
				key,
				1,
				expect.stringContaining(`worker.js: ${key}`)
			]);
		}
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

	it('refuses a file given in place of a folder', () => {
		const result = run(join(folder({ 'a.js': '' }), 'a.js'));
		expect([result.status, result.stderr]).toEqual([2, expect.stringMatching(/is not a folder/)]);
	});

	it('finds a key name in the last bytes of a file with no newline after it', () => {
		const bytes = Buffer.concat([Buffer.alloc(70_000, 0x61), Buffer.from('NEBIUS_API_KEY')]);
		const result = run(folder({ 'tail.bin': bytes }));
		expect([result.status, result.stdout]).toEqual([1, expect.stringMatching(/tail\.bin: NEBIUS/)]);
	});

	// A folder reached through a link is not a file: reading it fails, and a failure is never clean.
	it('refuses a linked folder inside a scanned folder rather than passing over it', () => {
		const dir = folder({ 'app/a.js': '', 'elsewhere/b.js': 'TAVILY_API_KEY' });
		symlinkSync(join(dir, 'elsewhere'), join(dir, 'app', 'linked'), 'junction');
		const result = run(join(dir, 'app'));
		expect([result.status, result.stderr]).toEqual([
			2,
			expect.stringMatching(/app\/linked could not be read/)
		]);
	});

	it('refuses --canary without a value, and no folder at all', () => {
		expect(run(folder({ 'a.js': '' }), '--canary').status).toBe(2);
		expect(run(folder({ 'a.js': '' }), '--canary', '').status).toBe(2);
		expect(run().status).toBe(2);
	});
});

// The adapter's _worker.js imports the server build from a sibling folder, the shape that let the
// first folder list pass over every server module.
const BUILD = {
	'cloudflare/_worker.js':
		'import { Server } from "./../output/server/index.js";\nimport { manifest } from "./../cloudflare-tmp/manifest.js";\nimport { env } from "cloudflare:workers";\n',
	'cloudflare/app.css': 'p{}',
	'output/server/index.js': 'export class Server {}',
	'cloudflare-tmp/manifest.js': 'export const manifest = {};'
};

describe('the --entry coverage rule', () => {
	it('refuses a folder list that leaves a relative import of the entry unscanned', () => {
		const root = folder(BUILD);
		const result = run(join(root, 'cloudflare'), '--entry', join(root, 'cloudflare', '_worker.js'));
		expect(result.status).toBe(2);
		expect(result.stderr).toMatch(
			/imports \.\/\.\.\/output\/server\/index\.js, outside the scanned folders/
		);
	});

	it('passes once every relative import resolves inside a scanned folder, runtime modules passed over', () => {
		const root = folder(BUILD);
		const result = run(
			join(root, 'output'),
			join(root, 'cloudflare'),
			join(root, 'cloudflare-tmp'),
			'--entry',
			join(root, 'cloudflare', '_worker.js')
		);
		expect([result.status, result.stdout.trim()]).toEqual([
			0,
			'provider-keys: scanned 4 files in 3 folders, no key name or canary value'
		]);
	});

	// TypeScript's lighter import scanner returned nothing for the namespace re-export and lost the
	// import after a regular expression holding a backtick, reading the backtick as a template start.
	it('reads dynamic imports, side-effect imports, re-exports and require calls', () => {
		for (const line of [
			"const m = await import('../far/x.js');",
			"import '../far/x.js';",
			"export * from '../far/x.js';",
			"export * as ns from '../far/x.js';",
			"const re = /`/g;\nconst m = await import('../far/x.js');",
			"const x = require('../far/x.js');"
		]) {
			const root = folder({ 'build/entry.js': line, 'far/x.js': '' });
			const result = run(join(root, 'build'), '--entry', join(root, 'build', 'entry.js'));
			expect([line, result.status]).toEqual([line, 2]);
		}
	});

	// The server build carries JSDoc types like import('../../../utils/page_nodes.js'); a scan that
	// read them as imports refused every real build.
	it('ignores import paths named only in a JSDoc type, a comment or a string', () => {
		const entry =
			"/** @param {import('../../far/t.js').T} t */\n// import x from '../far/x.js'\nconst s = \"import y from '../far/y.js'\";\nexport const f = (t) => [t, s];\n";
		const root = folder({ 'build/entry.js': entry, 'far/x.js': '' });
		const result = run(join(root, 'build'), '--entry', join(root, 'build', 'entry.js'));
		expect([result.status, result.stderr]).toEqual([0, '']);
	});

	it('follows imports past the entry, so a file two hops down that leaves the folders is refused', () => {
		const root = folder({
			...BUILD,
			'output/server/index.js': 'export { x } from "./chunks/a.js";',
			'output/server/chunks/a.js': 'import "../../../extra/b.js";',
			'extra/b.js': ''
		});
		const result = run(
			join(root, 'output'),
			join(root, 'cloudflare'),
			join(root, 'cloudflare-tmp'),
			'--entry',
			join(root, 'cloudflare', '_worker.js')
		);
		expect(result.status).toBe(2);
		expect(result.stderr).toMatch(/chunks\/a\.js imports \.\.\/\.\.\/\.\.\/extra\/b\.js, outside/);
	});

	it('ends on an import cycle and still refuses an import that leaves the folders', () => {
		const cycle = {
			'build/entry.js': "import './a.js';",
			'build/a.js': "import './b.js';",
			'build/b.js': "import './a.js';\nimport './entry.js';"
		};
		const clean = folder(cycle);
		expect(run(join(clean, 'build'), '--entry', join(clean, 'build', 'entry.js')).status).toBe(0);
		const leaving = folder({ ...cycle, 'build/b.js': "import './a.js';\nimport '../far/x.js';" });
		const result = run(join(leaving, 'build'), '--entry', join(leaving, 'build', 'entry.js'));
		expect([result.status, result.stderr]).toEqual([2, expect.stringMatching(/b\.js imports/)]);
	});

	it('refuses an entry outside every scanned folder, a missing entry and --entry without a value', () => {
		const root = folder({ 'build/a.js': '', 'other/entry.js': '' });
		expect(run(join(root, 'build'), '--entry', join(root, 'other', 'entry.js')).status).toBe(2);
		expect(run(join(root, 'build'), '--entry', join(root, 'build', 'gone.js')).status).toBe(2);
		expect(run(join(root, 'build'), '--entry').status).toBe(2);
	});

	it('runs with the same folders and entry in verify:ship and in CI', () => {
		const command =
			'node scripts/check-provider-keys.mjs .svelte-kit/output .svelte-kit/cloudflare .svelte-kit/cloudflare-tmp --entry .svelte-kit/cloudflare/_worker.js';
		const shipStep = readFileSync('verify-ship.mjs', 'utf8')
			.split('\n')
			.filter((line) => line.includes("name: 'provider-keys'"));
		const ciSteps = readFileSync(join('.github', 'workflows', 'gates.yml'), 'utf8')
			.split('\n')
			.filter((line) => line.includes('check-provider-keys.mjs'))
			.map((line) => line.trim());
		expect(shipStep).toHaveLength(1);
		expect(shipStep[0]).toContain(`cmd: '${command}'`);
		expect(ciSteps).toEqual([`- run: ${command}`]);
	});

	// wrangler bundles every package the build imports by name into the Worker, so those folders, and
	// the packages they list as dependencies, are deployed code too.
	const entryRun = (root: string) =>
		run(
			join(root, 'output'),
			join(root, 'cloudflare'),
			join(root, 'cloudflare-tmp'),
			'--entry',
			join(root, 'cloudflare', '_worker.js')
		);
	const PACKAGES = {
		'node_modules/pkg-a/package.json': '{ "name": "pkg-a", "dependencies": { "pkg-b": "1.0.0" } }',
		'node_modules/pkg-a/index.js': "import 'pkg-b';\nexport const a = 1;",
		'node_modules/pkg-b/package.json': '{ "name": "pkg-b" }',
		'node_modules/pkg-b/index.js': 'export const b = 2;'
	};
	const importing = (line: string) => ({
		...BUILD,
		'output/server/index.js': `${line}\nexport class Server {}`
	});

	it('scans each package the build imports by name and the packages it depends on', () => {
		const root = folder({ ...importing("import { a } from 'pkg-a';"), ...PACKAGES });
		const result = entryRun(root);
		expect([result.status, result.stdout.trim()]).toEqual([
			0,
			'provider-keys: scanned 8 files in 3 folders and 2 packages, no key name or canary value'
		]);
	});

	it('finds a key name in a package one dependency down from the build', () => {
		const root = folder({
			...importing("import { a } from 'pkg-a';"),
			...PACKAGES,
			'node_modules/pkg-b/index.js': 'export const b = env.NEBIUS_API_KEY;'
		});
		const result = entryRun(root);
		expect([result.status, result.stdout]).toEqual([
			1,
			expect.stringMatching(/node_modules\/pkg-b\/index\.js: NEBIUS_API_KEY/)
		]);
	});

	it.each(['peerDependencies', 'optionalDependencies'])(
		'finds a key name in a package the imported one lists under %s',
		(field) => {
			const root = folder({
				...importing("import { a } from 'pkg-a';"),
				...PACKAGES,
				'node_modules/pkg-a/package.json': JSON.stringify({
					name: 'pkg-a',
					[field]: { 'pkg-b': '1.0.0' }
				}),
				'node_modules/pkg-b/index.js': 'export const b = env.TAVILY_API_KEY;'
			});
			const result = entryRun(root);
			expect([result.status, result.stdout]).toEqual([
				1,
				expect.stringMatching(/node_modules\/pkg-b\/index\.js: TAVILY_API_KEY/)
			]);
		}
	);

	it('passes over a listed package that is not installed, which could not be bundled', () => {
		const root = folder({
			...importing("import { a } from 'pkg-a';"),
			...PACKAGES,
			'node_modules/pkg-a/package.json':
				'{ "name": "pkg-a", "dependencies": { "pkg-b": "1.0.0" }, "optionalDependencies": { "pagefifty-not-installed": "1.0.0" } }'
		});
		const result = entryRun(root);
		expect([result.status, result.stdout.trim()]).toEqual([
			0,
			'provider-keys: scanned 8 files in 3 folders and 2 packages, no key name or canary value'
		]);
	});

	// A package's code can import an installed package that none of its fields lists, and esbuild
	// bundles it all the same.
	const UNLISTED = {
		'node_modules/pkg-c/package.json': '{ "name": "pkg-c" }',
		'node_modules/pkg-c/index.js': 'export const c = 3;'
	};

	it.each([
		['index.js', "import 'pkg-b';\nimport { c } from 'pkg-c';\nexport const a = c;"],
		['lib/load.cjs', "module.exports = require('pkg-c');"],
		['lib/load.mjs', "export const c = await import('pkg-c');"],
		['lib/view.jsx', "import { c } from 'pkg-c';\nexport const View = () => <p>{c}</p>;"]
	])('finds a key name in a package that %s of an imported one imports unlisted', (file, code) => {
		const root = folder({
			...importing("import { a } from 'pkg-a';"),
			...PACKAGES,
			...UNLISTED,
			[`node_modules/pkg-a/${file}`]: code,
			'node_modules/pkg-c/index.js': 'export const c = env.NEBIUS_API_KEY;'
		});
		const result = entryRun(root);
		expect([result.status, result.stdout]).toEqual([
			1,
			expect.stringMatching(/node_modules\/pkg-c\/index\.js: NEBIUS_API_KEY/)
		]);
	});

	it('counts a package found only through an import, and passes over one that is not installed', () => {
		const root = folder({
			...importing("import { a } from 'pkg-a';"),
			...PACKAGES,
			...UNLISTED,
			'node_modules/pkg-a/index.js':
				"import 'pkg-b';\nimport 'pkg-c';\ntry { require('pagefifty-not-installed'); } catch {}\nexport const a = 1;"
		});
		const result = entryRun(root);
		expect([result.status, result.stdout.trim()]).toEqual([
			0,
			'provider-keys: scanned 10 files in 3 folders and 3 packages, no key name or canary value'
		]);
	});

	// esbuild tries .tsx, .ts, .jsx, .js, .css and .json after a path with no extension, the same list
	// for a folder's index file, and takes .mjs and .cjs only when named. A chunk the walk passed over
	// could import a package that would then go unscanned. The .ts chunk holds a type assertion, which
	// a parse as JavaScript reads as the start of a JSX element, losing the require after it.
	const REQUIRE_K = "require('pkg-k');";
	it.each([
		['a path with no extension', "import './chunk';", 'output/server/chunk.js', REQUIRE_K],
		[
			'a folder with an index file',
			"import './chunks';",
			'output/server/chunks/index.js',
			REQUIRE_K
		],
		['a named .cjs file', "require('./chunk.cjs');", 'output/server/chunk.cjs', REQUIRE_K],
		['a .jsx file with no extension', "import './view';", 'output/server/view.jsx', REQUIRE_K],
		[
			'a .ts file with no extension',
			"import './chunk';",
			'output/server/chunk.ts',
			`const value: unknown = 1;\nconst n = <number>value;\n${REQUIRE_K}\nexport { n };`
		],
		['a .tsx file with no extension', "import './view';", 'output/server/view.tsx', REQUIRE_K]
	])('follows %s to the packages it imports', (_label, line, file, code) => {
		const root = folder({
			...importing(line),
			[file]: code,
			'node_modules/pkg-k/package.json': '{ "name": "pkg-k" }',
			'node_modules/pkg-k/index.js': 'TAVILY_API_KEY'
		});
		const result = entryRun(root);
		expect([result.status, result.stdout]).toEqual([
			1,
			expect.stringMatching(/node_modules\/pkg-k\/index\.js: TAVILY_API_KEY/)
		]);
	});

	it('finds a scoped package by a subpath import and its dependency in a nested node_modules', () => {
		const root = folder({
			...importing("import { s } from '@scope/pkg/sub/x.js';"),
			'node_modules/@scope/pkg/package.json': '{ "dependencies": { "nested": "1.0.0" } }',
			'node_modules/@scope/pkg/sub/x.js': 'export const s = 1;',
			'node_modules/@scope/pkg/node_modules/nested/package.json': '{}',
			'node_modules/@scope/pkg/node_modules/nested/index.js': 'TAVILY_API_KEY'
		});
		const result = entryRun(root);
		expect([result.status, result.stdout]).toEqual([
			1,
			expect.stringMatching(/@scope\/pkg\/node_modules\/nested\/index\.js: TAVILY_API_KEY/)
		]);
	});

	it('refuses an import by name that is neither a builtin nor an installed package', () => {
		const result = entryRun(folder(importing("import 'pagefifty-no-such-package';")));
		expect([result.status, result.stderr]).toEqual([
			2,
			expect.stringMatching(
				/imports pagefifty-no-such-package, which is neither a builtin nor an installed package/
			)
		]);
	});

	it('refuses a package whose package.json does not parse, naming the file', () => {
		const root = folder({
			...importing("import { a } from 'pkg-a';"),
			...PACKAGES,
			'node_modules/pkg-a/package.json': '{ "dependencies": '
		});
		const result = entryRun(root);
		expect([result.status, result.stderr]).toEqual([
			2,
			expect.stringMatching(/node_modules\/pkg-a\/package\.json could not be read/)
		]);
	});

	it('passes over builtins in either spelling and the cloudflare: modules', () => {
		const lines = "import 'node:async_hooks';\nimport 'async_hooks';\nimport 'cloudflare:sockets';";
		const result = entryRun(folder(importing(lines)));
		expect([result.status, result.stdout.trim()]).toEqual([
			0,
			'provider-keys: scanned 4 files in 3 folders, no key name or canary value'
		]);
	});

	it('still finds a key name in a file the entry imports', () => {
		const root = folder({ ...BUILD, 'output/server/index.js': 'env.TAVILY_API_KEY' });
		const result = run(
			join(root, 'output'),
			join(root, 'cloudflare'),
			join(root, 'cloudflare-tmp'),
			'--entry',
			join(root, 'cloudflare', '_worker.js')
		);
		expect([result.status, result.stdout]).toEqual([
			1,
			expect.stringMatching(/output\/server\/index\.js: TAVILY_API_KEY/)
		]);
	});
});

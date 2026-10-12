// The import rules are proven on planted trees rather than on src, because src does not yet hold
// a profile module, a parser importer, a raw network import, a site import of the capture command,
// a site import of a test or a site import of a file outside src for them to catch. The trees live under
// .stryker-tmp (ignored, inside the repo) so fast-xml-parser resolves from the repo's
// node_modules exactly as it would from src.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = process.cwd();
const DEPCRUISE = path.join(REPO, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs');
const CONFIG = path.join(REPO, '.dependency-cruiser.cjs');

const PROFILE = 'export const PROFILE_VERSION = 1;\n';
const READER =
	"import { XMLParser } from 'fast-xml-parser';\nexport const reader = new XMLParser();\n";
// A test and a test setup file may open sockets and servers; app code may not.
const TEST_SERVER =
	"import { createServer } from 'node:http';\nexport const serve = () => createServer();\n";
const SETUP_SOCKET = "import net from 'node:net';\nexport const socket = net.Socket;\n";
// The command, its own tests and the test helpers may import the command; the site may not.
const CAPTURE_SIDE: Record<string, string> = {
	'src/lib/capture/run.ts': "export const run = () => 'capture';\n",
	'src/lib/capture/helper.ts': "import { run } from './run';\nexport const helper = () => run();\n",
	'src/lib/capture-user.test.ts':
		"import { run } from './capture/run';\nexport const used = run;\n",
	'src/test/capture-stub.ts':
		"import { run } from '../lib/capture/run';\nexport const stub = run;\n"
};
// A test may read private env and site code may read public env; site code may not read private env.
const PRIVATE_ENV_SIDE: Record<string, string> = {
	'src/lib/env-user.test.ts':
		"import { env } from '$env/dynamic/private';\nexport const used = env;\n",
	'src/lib/public-env.ts':
		"import { env } from '$env/dynamic/public';\nimport { PUBLIC_X } from '$env/static/public';\nexport const pub = [env, PUBLIC_X];\n"
};
// Site code reaching the command through the helper the capture rule exempts, and a route importing
// a test file: neither import is a direct one into src/lib/capture.
const TEST_IMPORTS_PLANTED: Record<string, string> = {
	'src/lib/via-test-helper.ts':
		"import { stub } from '../test/capture-stub';\nexport const viaHelper = () => stub();\n",
	'src/routes/test-planted/+page.ts':
		"import { used } from '../../lib/capture-user.test';\nexport const load = () => ({ used: typeof used });\n",
	'src/lib/via-spec.ts':
		"import { used } from './capture-user.spec';\nexport const viaSpec = used;\n",
	'src/lib/via-test-js.ts':
		"import { sock } from './net-user.test.js';\nexport const viaTestJs = sock;\n"
};
const TEST_IMPORTS_CLEAN: Record<string, string> = {
	'src/lib/via-test-helper.ts': "export const viaHelper = () => 'none';\n",
	'src/routes/test-planted/+page.ts': 'export const load = () => ({});\n',
	'src/lib/via-spec.ts': "export const viaSpec = 'none';\n",
	'src/lib/via-test-js.ts': "export const viaTestJs = 'none';\n"
};
// ESLint's test names are *.{test,spec}.{ts,js}, so a spec file and a JavaScript test get the same
// exemptions as a .test.ts file: the command, private env, a test helper and a raw socket.
const OTHER_TEST_NAMES: Record<string, string> = {
	'src/lib/capture-user.spec.ts':
		"import { run } from './capture/run';\nimport { env } from '$env/dynamic/private';\nimport { stub } from '../test/capture-stub';\nexport const used = [run, env, stub];\n",
	'src/lib/net-user.test.js': "import net from 'node:net';\nexport const sock = net.Socket;\n"
};
// Files outside src/ that import the command and a raw socket. The rules above judge the importing
// module, so a hop through one of these is never theirs to judge. A test may reach them.
const OUTSIDE_SRC_SIDE: Record<string, string> = {
	'tools/relay.ts': "import { run } from '../src/lib/capture/run';\nexport const relay = run;\n",
	'tools/net-relay.ts': "import net from 'node:net';\nexport const sock = net.Socket;\n",
	'src/lib/tools-user.test.ts':
		"import { relay } from '../../tools/relay';\nexport const used = relay;\n"
};
const OUTSIDE_SRC_PLANTED: Record<string, string> = {
	'src/lib/via-tools.ts':
		"import { relay } from '../../tools/relay';\nexport const viaTools = relay;\n",
	'src/routes/outside-planted/+page.server.ts':
		"import { sock } from '../../../tools/net-relay';\nexport const load = () => ({ s: typeof sock });\n"
};
const OUTSIDE_SRC_CLEAN: Record<string, string> = {
	'src/lib/via-tools.ts': "export const viaTools = 'none';\n",
	'src/routes/outside-planted/+page.server.ts': 'export const load = () => ({});\n'
};

const PLANTED: Record<string, string> = {
	'src/lib/profile/schema.ts': PROFILE,
	'src/lib/ingest/read-notice.ts': READER,
	'src/routes/planted/+page.server.ts':
		"import { PROFILE_VERSION } from '../../lib/profile/schema';\nexport const load = () => ({ version: PROFILE_VERSION });\n",
	'src/lib/helper.ts':
		"import { PROFILE_VERSION } from './profile/schema';\nexport const version = () => PROFILE_VERSION;\n",
	'src/lib/server/relay.ts':
		"import { version } from '../helper';\nexport const relay = () => version();\n",
	'src/lib/tender.server.ts':
		"import { PROFILE_VERSION } from './profile/schema';\nexport const tender = () => PROFILE_VERSION;\n",
	'src/lib/other.ts':
		"import { XMLParser } from 'fast-xml-parser';\nexport const parser = new XMLParser();\n",
	'src/lib/raw-network.ts':
		"import { connect } from 'cloudflare:sockets';\nimport { request } from 'node:https';\nimport { lookup } from 'node:dns/promises';\nexport const open = [connect, request, lookup];\n",
	'src/lib/raw-network.test.ts': TEST_SERVER,
	'src/test/setup-socket.ts': SETUP_SOCKET,
	...CAPTURE_SIDE,
	'src/routes/capture-planted/+page.server.ts':
		"import { run } from '../../lib/capture/run';\nexport const load = () => ({ run: run() });\n",
	'src/lib/capture-planted.ts':
		"import { run } from './capture/run';\nexport const planted = () => run();\n",
	...PRIVATE_ENV_SIDE,
	'src/routes/env-planted/+page.server.ts':
		"import { PLANTED_SECRET } from '$env/static/private';\nexport const load = () => ({ k: PLANTED_SECRET.length });\n",
	'src/lib/env-planted.ts':
		"import { env } from '$env/dynamic/private';\nexport const key = () => env.PLANTED_SECRET;\n",
	...TEST_IMPORTS_PLANTED,
	...OTHER_TEST_NAMES,
	...OUTSIDE_SRC_SIDE,
	...OUTSIDE_SRC_PLANTED
};

const CLEAN: Record<string, string> = {
	'src/lib/profile/schema.ts': PROFILE,
	'src/lib/ingest/read-notice.ts': READER,
	'src/routes/planted/+page.server.ts': 'export const load = () => ({ version: 1 });\n',
	'src/lib/helper.ts': 'export const version = () => 1;\n',
	'src/lib/server/relay.ts':
		"import { version } from '../helper';\nexport const relay = () => version();\n",
	'src/lib/tender.server.ts': 'export const tender = () => 1;\n',
	'src/lib/other.ts':
		"import { reader } from './ingest/read-notice';\nexport const parser = reader;\n",
	'src/lib/raw-network.ts': 'export const open = (url: string) => fetch(url);\n',
	'src/lib/raw-network.test.ts': TEST_SERVER,
	'src/test/setup-socket.ts': SETUP_SOCKET,
	...CAPTURE_SIDE,
	'src/routes/capture-planted/+page.server.ts': "export const load = () => ({ run: 'served' });\n",
	'src/lib/capture-planted.ts': "export const planted = () => 'served';\n",
	...PRIVATE_ENV_SIDE,
	'src/routes/env-planted/+page.server.ts': 'export const load = () => ({ k: 0 });\n',
	'src/lib/env-planted.ts': 'export const key = () => undefined;\n',
	...TEST_IMPORTS_CLEAN,
	...OTHER_TEST_NAMES,
	...OUTSIDE_SRC_SIDE,
	...OUTSIDE_SRC_CLEAN
};

interface Cruise {
	modules: { source: string; dependencies: { resolved: string }[] }[];
	summary: { totalCruised: number; violations: { from: string; rule: { name: string } }[] };
}

function writeTree(root: string, files: Record<string, string>): void {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), text);
	}
}

function cruise(root: string): Cruise {
	const run = spawnSync(
		process.execPath,
		[DEPCRUISE, 'src', '--config', CONFIG, '--output-type', 'json'],
		{ cwd: root, encoding: 'utf8' }
	);
	if (!run.stdout) throw new Error(`depcruise printed nothing (exit ${run.status}): ${run.stderr}`);
	return JSON.parse(run.stdout) as Cruise;
}

function violators(result: Cruise, rule: string): string[] {
	return result.summary.violations
		.filter((violation) => violation.rule.name === rule)
		.map((violation) => violation.from)
		.sort();
}

describe('dependency-cruiser rules on planted import trees', () => {
	const base = path.join(REPO, '.stryker-tmp');
	let planted: Cruise;
	let clean: Cruise;
	let temp: string;

	beforeAll(() => {
		mkdirSync(base, { recursive: true });
		temp = mkdtempSync(path.join(base, 'depcruise-'));
		writeTree(path.join(temp, 'planted'), PLANTED);
		writeTree(path.join(temp, 'clean'), CLEAN);
		planted = cruise(path.join(temp, 'planted'));
		clean = cruise(path.join(temp, 'clean'));
	}, 60_000);

	afterAll(() => {
		rmSync(temp, { recursive: true, force: true });
	});

	it('cruises every planted file and resolves the parser into node_modules', () => {
		for (const result of [planted, clean]) {
			expect(result.summary.totalCruised).toBeGreaterThanOrEqual(6);
			const reader = result.modules.find(
				(module) => module.source === 'src/lib/ingest/read-notice.ts'
			);
			expect(reader?.dependencies.map((dependency) => dependency.resolved)).toEqual([
				expect.stringMatching(/node_modules\/fast-xml-parser\//)
			]);
		}
	});

	// SvelteKit treats a .server file anywhere as server-only, not only those under lib/server.
	it('reports no-server-reaches-profile for a direct import, one hop removed and a .server module', () => {
		expect(violators(planted, 'no-server-reaches-profile')).toEqual([
			'src/lib/server/relay.ts',
			'src/lib/tender.server.ts',
			'src/routes/planted/+page.server.ts'
		]);
	});

	it('reports single-parser-entry for a second parser importer only', () => {
		expect(violators(planted, 'single-parser-entry')).toEqual(['src/lib/other.ts']);
	});

	// One entry per import, so the Workers socket, the Node module and its subpath are all caught.
	it('reports fetch-only-network for app code only, never a test or a setup file', () => {
		expect(violators(planted, 'fetch-only-network')).toEqual([
			'src/lib/raw-network.ts',
			'src/lib/raw-network.ts',
			'src/lib/raw-network.ts'
		]);
	});

	it('reports no-site-reaches-capture for a route and a library module, never a test, a test helper or the command itself', () => {
		expect(violators(planted, 'no-site-reaches-capture')).toEqual([
			'src/lib/capture-planted.ts',
			'src/routes/capture-planted/+page.server.ts'
		]);
	});

	// Vite's loadEnv, called with an empty prefix, returns every shell variable as well as the env
	// files, so pointing env.dir at env/ keeps the root env file out but not an exported key.
	it('reports no-private-env for a static and a dynamic private import, never a test or public env', () => {
		expect(violators(planted, 'no-private-env')).toEqual([
			'src/lib/env-planted.ts',
			'src/routes/env-planted/+page.server.ts'
		]);
	});

	// The fences above exempt tests and helpers, so a site import of either is its own violation;
	// the capture rule alone passes over the helper route, as its first test shows.
	it('reports no-site-imports-tests for a site import of a helper and of each test name, never a test or a helper', () => {
		expect(violators(planted, 'no-site-imports-tests')).toEqual([
			'src/lib/via-spec.ts',
			'src/lib/via-test-helper.ts',
			'src/lib/via-test-js.ts',
			'src/routes/test-planted/+page.ts'
		]);
	});

	// Each hop below reaches the command or a raw socket, and no rule above fires on it, since the
	// file making the forbidden import sits outside src/.
	it('reports no-site-imports-outside-src for site code reaching a file outside src, never a test', () => {
		expect(violators(planted, 'no-site-imports-outside-src')).toEqual([
			'src/lib/via-tools.ts',
			'src/routes/outside-planted/+page.server.ts'
		]);
		expect(violators(planted, 'no-site-reaches-capture')).not.toContain('src/lib/via-tools.ts');
		expect(violators(planted, 'fetch-only-network')).not.toContain(
			'src/routes/outside-planted/+page.server.ts'
		);
	});

	it('reports no rule on the clean control tree', () => {
		expect(violators(clean, 'no-server-reaches-profile')).toEqual([]);
		expect(violators(clean, 'single-parser-entry')).toEqual([]);
		expect(violators(clean, 'fetch-only-network')).toEqual([]);
		expect(violators(clean, 'no-site-reaches-capture')).toEqual([]);
		expect(violators(clean, 'no-private-env')).toEqual([]);
		expect(violators(clean, 'no-site-imports-tests')).toEqual([]);
		expect(violators(clean, 'no-site-imports-outside-src')).toEqual([]);
	});
});

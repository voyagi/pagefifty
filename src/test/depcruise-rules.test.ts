// The import rules are proven on planted trees rather than on src, because src does not yet hold
// a profile module, a parser importer or a raw network import for them to catch. The trees live under
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
	'src/test/setup-socket.ts': SETUP_SOCKET
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
	'src/test/setup-socket.ts': SETUP_SOCKET
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

	it('reports no rule on the clean control tree', () => {
		expect(violators(clean, 'no-server-reaches-profile')).toEqual([]);
		expect(violators(clean, 'single-parser-entry')).toEqual([]);
		expect(violators(clean, 'fetch-only-network')).toEqual([]);
	});
});

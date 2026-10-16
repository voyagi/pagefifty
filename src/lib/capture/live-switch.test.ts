import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	commandEnv,
	createBlockedNode,
	FETCH_BLOCKED,
	type BlockedNode
} from '../../test/capture-spawn.ts';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import type { MeteredResponse } from './metered.ts';
import { runCapture, type MeteredStep } from './run.ts';
import { TED_SEARCH_URL } from './ted-search.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const PID = 5151;
const MODES_OFF = 'capture: modes ted=live tokenFactory=snapshot tavily=snapshot';
const MODES_LIVE = 'capture: modes ted=live tokenFactory=live tavily=live';

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

interface SwitchRun {
	argv?: readonly string[];
	env?: Record<string, string | undefined>;
	meteredSteps?: readonly MeteredStep[];
	// Called as each request reaches the stub TED, before it answers.
	onRequest?: () => void;
}

// Each run gets its own temp root, so nothing lands under the repository's examples/ or cache.
async function switchRun({ argv = [], env = {}, meteredSteps, onRequest }: SwitchRun) {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-live-switch-'));
	roots.push(root);
	mkdirSync(join(root, 'examples'));
	const clock = createFakeClock(START);
	const ted = createScriptedTed({ clock, notices: ['600457-2026'] });
	const lines: string[] = [];
	const code = await runCapture({
		root,
		transport: (request) => {
			onRequest?.();
			return ted(request);
		},
		clock,
		argv,
		env,
		head: 'fedcba9876543210fedcba9876543210fedcba98',
		pid: PID,
		isAlive: (pid) => pid === PID,
		log: (line) => lines.push(line),
		meteredSteps
	});
	const cache = join(root, '.capture-cache');
	return { code, ted, lines, root, cache, folder: join(root, 'examples', '2026-10-11') };
}

const readRecord = (folder: string) => JSON.parse(readFileSync(join(folder, 'run.json'), 'utf8'));

describe('a --live run without the switch', () => {
	it.each([
		['unset', undefined, 'unset'],
		['"0"', '0', '"0"'],
		['"true"', 'true', '"true"'],
		['" 1"', ' 1', '" 1"']
	])(
		'refuses --live with PAGEFIFTY_LIVE %s before any request, naming the value',
		async (_name, value, named) => {
			const run = await switchRun({
				argv: ['--live', '--cap', '5'],
				env: value === undefined ? {} : { PAGEFIFTY_LIVE: value }
			});
			expect(run.code).toBe(2);
			expect(run.ted.calls()).toEqual([]);
			expect(run.lines[0]).toBe(MODES_OFF);
			expect(run.lines).toHaveLength(2);
			expect(run.lines[1]).toMatch(/^capture: /);
			expect(run.lines[1]).toContain(`PAGEFIFTY_LIVE is ${named}`);
			expect(run.lines[1]).toContain('set PAGEFIFTY_LIVE=1 in the shell for this one command');
			// Refused with the argument checks: no lock taken, no run record, no folder.
			expect(existsSync(run.cache)).toBe(false);
			expect(existsSync(run.folder)).toBe(false);
		}
	);
});

describe('the modes of a run', () => {
	it('logs the modes first and writes them to run.json right after head', async () => {
		const run = await switchRun({});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.lines[0]).toBe(MODES_OFF);
		const record = readRecord(run.folder);
		const keys = Object.keys(record);
		expect(keys[keys.indexOf('head') + 1]).toBe('modes');
		expect(record.modes).toEqual({ ted: 'live', tokenFactory: 'snapshot', tavily: 'snapshot' });
	});

	it('keeps a plain run snapshot when PAGEFIFTY_LIVE is 1 but --live is not given', async () => {
		const run = await switchRun({ env: { PAGEFIFTY_LIVE: '1' } });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.lines[0]).toBe(MODES_OFF);
		expect(readRecord(run.folder).modes.tokenFactory).toBe('snapshot');
	});

	it('resolves the metered upstreams live with --live, --cap and PAGEFIFTY_LIVE exactly 1', async () => {
		const run = await switchRun({ argv: ['--live', '--cap', '2'], env: { PAGEFIFTY_LIVE: '1' } });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.lines[0]).toBe(MODES_LIVE);
		expect(readRecord(run.folder).modes).toEqual({
			ted: 'live',
			tokenFactory: 'live',
			tavily: 'live'
		});
	});
});

// The test caller phase 2's model read and Tavily search stand in for: it asks the gate for a
// number of metered calls and records every one its provider was really asked to make.
function testCaller(calls: number) {
	const provider: string[] = [];
	const seen: { records: string[]; results: unknown[] } = { records: [], results: [] };
	const send = async (key: string): Promise<MeteredResponse<string>> => {
		provider.push(key);
		return { id: `response-${provider.length}`, usage: { tokens: 1 }, value: 'read' };
	};
	const step: MeteredStep = async ({ gate, records }) => {
		seen.records = records.map((record) => record.noticeNumber);
		for (let call = 1; call <= calls; call += 1) {
			seen.results.push(await gate.attempt('tokenFactory', `read criteria ${call}`, send));
		}
	};
	return { step, provider, seen };
}

const WOULD = (call: number) => `capture: (dry-run) WOULD call tokenFactory read criteria ${call}`;

describe('metered calls in a dry run', () => {
	it('logs one WOULD line per metered call, calls no provider and records 0 attempts', async () => {
		const caller = testCaller(4);
		const run = await switchRun({ argv: ['--cap', '4'], meteredSteps: [caller.step] });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.lines[0]).toBe(MODES_OFF);
		expect(run.lines.filter((line) => line.includes('WOULD'))).toEqual([1, 2, 3, 4].map(WOULD));
		expect(caller.provider).toEqual([]);
		expect(caller.seen.records).toEqual(['600457-2026']);
		const record = readRecord(run.folder);
		const keys = Object.keys(record);
		expect(keys[keys.indexOf('notices') + 1]).toBe('metered');
		expect(record.metered).toEqual({
			cap: 4,
			attempts: 0,
			perProvider: { tokenFactory: 0, tavily: 0 },
			refusals: [],
			responses: []
		});
	});

	it('records a null cap when the run was given none', async () => {
		const run = await switchRun({ meteredSteps: [testCaller(1).step] });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(readRecord(run.folder).metered).toMatchObject({ cap: null, attempts: 0 });
	});

	it("names the run's modes in the README", async () => {
		const run = await switchRun({});
		const readme = readFileSync(join(run.folder, 'README.md'), 'utf8');
		expect(readme).toContain(
			'Modes of this run: TED live, Token Factory snapshot, Tavily snapshot.'
		);
	});

	it('prints no WOULD line when the command supplies no metered step', async () => {
		const run = await switchRun({ argv: ['--cap', '4'] });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.lines.filter((line) => line.includes('WOULD'))).toEqual([]);
	});
});

describe('the modes of a live run', () => {
	it('stay as resolved at start when PAGEFIFTY_LIVE changes mid-run', async () => {
		const env: Record<string, string | undefined> = { PAGEFIFTY_LIVE: '1' };
		const caller = testCaller(1);
		const run = await switchRun({
			argv: ['--live', '--cap', '2'],
			env,
			onRequest: () => {
				env.PAGEFIFTY_LIVE = '0';
			},
			meteredSteps: [caller.step]
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(env.PAGEFIFTY_LIVE).toBe('0');
		// Still live: the gate refuses for want of a key (plan 01.1-14 loads them), never a dry run.
		expect(caller.seen.results).toEqual([{ kind: 'refused', reason: 'no key loaded' }]);
		expect(run.lines.filter((line) => line.includes('WOULD'))).toEqual([]);
		expect(caller.provider).toEqual([]);
		expect(readRecord(run.folder)).toMatchObject({
			modes: { tokenFactory: 'live', tavily: 'live' },
			metered: { cap: 2, attempts: 0 }
		});
	});
});

describe('the command script with --live', () => {
	let blocked: BlockedNode;

	beforeAll(() => {
		blocked = createBlockedNode();
	});

	afterAll(() => {
		blocked.remove();
	});

	it('refuses --live --cap 1 with PAGEFIFTY_LIVE "true" with 2 before any request', () => {
		// The control first: under this preload a fetch to TED's search address throws.
		const probe = blocked.probe(TED_SEARCH_URL);
		expect(probe.stderr, probe.stdout).toContain(FETCH_BLOCKED);
		expect(probe.stdout).not.toContain('fetch returned');
		const lockBefore = existsSync(join('.capture-cache', 'capture.lock'));
		const command = blocked.run(
			['scripts/capture.mjs', '--live', '--cap', '1'],
			commandEnv({ PAGEFIFTY_LIVE: 'true' })
		);
		expect(command.status, command.stdout + command.stderr).toBe(2);
		const lines = command.stdout.split('\n').filter((line) => line.startsWith('capture:'));
		expect(lines[0]).toBe(MODES_OFF);
		expect(lines[1]).toContain('PAGEFIFTY_LIVE is "true"');
		expect(command.stderr).not.toContain(FETCH_BLOCKED);
		expect(existsSync(join('.capture-cache', 'capture.lock'))).toBe(lockBefore);
	});
});

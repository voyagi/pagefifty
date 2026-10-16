import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
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
import type { ProviderKeys } from './keys.ts';
import type { MeteredProvider, MeteredResponse } from './metered.ts';
import { runCapture, type MeteredStep } from './run.ts';
import { TED_SEARCH_URL } from './ted-search.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const PID = 5151;
const MODES_OFF = 'capture: modes ted=live tokenFactory=snapshot tavily=snapshot';
const MODES_LIVE = 'capture: modes ted=live tokenFactory=live tavily=live';
const NEBIUS = 'pf-canary-nebius-5d1e';
const TAVILY = 'pf-canary-tavily-8b07';
const BOTH_KEYS = `NEBIUS_API_KEY=${NEBIUS}\nTAVILY_API_KEY=${TAVILY}\n`;

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
	// Written to the temp root's key file before the run; no file when absent.
	keyFile?: string;
	loadKeys?: (path: string) => ProviderKeys;
}

// Each run gets its own temp root, so nothing lands under the repository's examples/ or cache, and
// the repository's own key file is never read.
async function switchRun({
	argv = [],
	env = {},
	meteredSteps,
	onRequest,
	keyFile,
	loadKeys
}: SwitchRun) {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-live-switch-'));
	roots.push(root);
	mkdirSync(join(root, 'examples'));
	if (keyFile !== undefined) writeFileSync(join(root, '.env'), keyFile);
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
		meteredSteps,
		loadKeys
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
			meteredSteps: [caller.step],
			keyFile: BOTH_KEYS
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(env.PAGEFIFTY_LIVE).toBe('0');
		// Still live: the call is sent with its key, never logged as a dry run.
		expect(caller.seen.results).toEqual([{ kind: 'sent', id: 'response-1', value: 'read' }]);
		expect(run.lines.filter((line) => line.includes('WOULD'))).toEqual([]);
		expect(caller.provider).toEqual([NEBIUS]);
		expect(readRecord(run.folder)).toMatchObject({
			modes: { tokenFactory: 'live', tavily: 'live' },
			metered: { cap: 2, attempts: 1 }
		});
	});
});

function filesUnder(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});
}

// Every place a run writes or prints: its log lines, every file under the temp root's examples/ and
// .capture-cache/ (run records, the cache, staging), and every value of process.env. Returns where a
// canary was found, and how many files were read, so an empty scan cannot pass for a clean one.
function canaryTraces(run: { lines: string[]; root: string }) {
	const canaries = [NEBIUS, TAVILY];
	const files = [
		...filesUnder(join(run.root, 'examples')),
		...filesUnder(join(run.root, '.capture-cache'))
	];
	const found = [
		...run.lines.filter((line) => canaries.some((canary) => line.includes(canary))),
		...files.filter((file) => {
			const text = readFileSync(file, 'latin1');
			return canaries.some((canary) => text.includes(canary));
		}),
		...Object.entries(process.env)
			.filter(([, value]) => canaries.some((canary) => value?.includes(canary)))
			.map(([name]) => `process.env.${name}`)
	];
	return { found, files };
}

interface ProviderCall {
	provider: MeteredProvider;
	operation: string;
}

// A stand-in for phase 2's provider clients: each send builds its Authorization header from the key
// the gate hands it, and the stub provider records the header it got.
function keyedCaller(calls: readonly ProviderCall[], fail?: (key: string) => Error) {
	const headers: string[] = [];
	const contexts: string[][] = [];
	const results: unknown[] = [];
	const stubProvider = async (authorization: string): Promise<MeteredResponse<string>> => {
		headers.push(authorization);
		return { id: `response-${headers.length}`, usage: { tokens: 1 }, value: 'read' };
	};
	const step: MeteredStep = async (context) => {
		contexts.push(Object.keys(context));
		for (const { provider, operation } of calls) {
			const send = async (key: string) => {
				if (fail) throw fail(key);
				return stubProvider(`Bearer ${key}`);
			};
			results.push(await context.gate.attempt(provider, operation, send));
		}
	};
	return { step, headers, contexts, results };
}

const THREE_CALLS: readonly ProviderCall[] = [
	{ provider: 'tokenFactory', operation: 'read criteria 1' },
	{ provider: 'tavily', operation: 'search awards 1' },
	{ provider: 'tokenFactory', operation: 'read criteria 2' }
];

const runRecords = (run: { cache: string }) =>
	filesUnder(join(run.cache, 'runs')).map((file) => JSON.parse(readFileSync(file, 'utf8')));

const LIVE = { argv: ['--live', '--cap', '2'], env: { PAGEFIFTY_LIVE: '1' } };

describe('provider keys in a live run', () => {
	it('hands each key to its own provider through the gate and leaves it in no output', async () => {
		const caller = keyedCaller(THREE_CALLS);
		const run = await switchRun({ ...LIVE, meteredSteps: [caller.step], keyFile: BOTH_KEYS });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(caller.headers).toEqual([`Bearer ${NEBIUS}`, `Bearer ${TAVILY}`]);
		expect(caller.contexts).toEqual([['gate', 'records']]);
		expect(readRecord(run.folder).metered).toMatchObject({
			cap: 2,
			attempts: 2,
			perProvider: { tokenFactory: 1, tavily: 1 },
			refusals: [
				{
					provider: 'tokenFactory',
					operation: 'read criteria 2',
					reason: 'the cap of 2 attempts is reached'
				}
			]
		});
		const traces = canaryTraces(run);
		expect(traces.found).toEqual([]);
		expect(traces.files).toContain(join(run.folder, 'run.json'));
		expect(filesUnder(join(run.cache, 'runs'))).toHaveLength(1);
	});

	it('exits 2 naming TAVILY_API_KEY before any request when the key file lacks it', async () => {
		const caller = keyedCaller(THREE_CALLS);
		const run = await switchRun({
			...LIVE,
			meteredSteps: [caller.step],
			keyFile: `NEBIUS_API_KEY=${NEBIUS}\n`
		});
		expect(run.code).toBe(2);
		expect(run.ted.calls()).toEqual([]);
		expect(run.lines[0]).toBe(MODES_LIVE);
		expect(run.lines.at(-1)).toMatch(/^capture: /);
		expect(run.lines.at(-1)).toContain('TAVILY_API_KEY');
		expect(caller.headers).toEqual([]);
		expect(existsSync(run.cache)).toBe(false);
		expect(canaryTraces(run).found).toEqual([]);
	});

	it('records a send that throws with a fixed reason naming provider and operation, never its text', async () => {
		const caller = keyedCaller(
			THREE_CALLS,
			(key) => new Error(`provider refused ${key}\nAuthorization: Bearer ${key}`)
		);
		const run = await switchRun({ ...LIVE, meteredSteps: [caller.step], keyFile: BOTH_KEYS });
		expect(run.code).toBe(1);
		expect(existsSync(run.folder)).toBe(false);
		const reason = 'metered call tokenFactory read criteria 1 failed';
		expect(run.lines).toContain(`capture: ${reason}; nothing was written`);
		const records = runRecords(run);
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({ outcome: 'failed', reason });
		expect(records[0].metered).toMatchObject({ attempts: 1, responses: [] });
		expect(canaryTraces(run).found).toEqual([]);
	});

	it('records a step that throws on its own with a fixed reason, never its text', async () => {
		const step: MeteredStep = async () => {
			throw new Error(`step broke near ${NEBIUS}`);
		};
		const run = await switchRun({ ...LIVE, meteredSteps: [step], keyFile: BOTH_KEYS });
		expect(run.code).toBe(1);
		expect(runRecords(run)[0]).toMatchObject({
			outcome: 'failed',
			reason: 'a metered step failed'
		});
		expect(canaryTraces(run).found).toEqual([]);
	});

	it('never calls the key loader when no metered step is supplied', async () => {
		const asked: string[] = [];
		const run = await switchRun({
			...LIVE,
			loadKeys: (path) => {
				asked.push(path);
				throw new Error('the key loader was called');
			}
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(asked).toEqual([]);
	});

	it.each([
		['without --live', [] as string[], { PAGEFIFTY_LIVE: '1' }],
		['with --cap only', ['--cap', '3'], {}]
	])('never calls the key loader in a snapshot run (%s)', async (_name, argv, env) => {
		const asked: string[] = [];
		const caller = keyedCaller(THREE_CALLS);
		const run = await switchRun({
			argv,
			env,
			meteredSteps: [caller.step],
			loadKeys: (path) => {
				asked.push(path);
				throw new Error('the key loader was called');
			}
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.lines[0]).toBe(MODES_OFF);
		expect(asked).toEqual([]);
		expect(caller.headers).toEqual([]);
	});

	it('reads the key file at the root it runs in', async () => {
		const asked: string[] = [];
		const caller = keyedCaller(THREE_CALLS.slice(0, 1));
		const run = await switchRun({
			...LIVE,
			meteredSteps: [caller.step],
			loadKeys: (path) => {
				asked.push(path);
				return Object.freeze({ NEBIUS_API_KEY: NEBIUS, TAVILY_API_KEY: TAVILY });
			}
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(asked).toEqual([join(run.root, '.env')]);
		expect(caller.headers).toEqual([`Bearer ${NEBIUS}`]);
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

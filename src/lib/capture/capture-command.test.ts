// The capture command as scripts/capture.mjs wires it, model step included, driven with a stub TED,
// the stub provider serving spike 004's recorded replies, a fake clock and stub keys. Every run gets
// its own temp root, so nothing lands under the repository and its key file is never read.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commandDeps } from '../../../scripts/capture.mjs';
import { readReplyFixture, type RecordedReply } from '../../test/fixtures/replies.ts';
import { createStubProvider } from '../../test/provider-stub.ts';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { ReadingsFileSchema } from '../snapshot/readings.ts';
import { runCapture } from './run.ts';

const START = Date.parse('2026-09-15T08:00:00Z');
const DAY = '2026-09-15';
const PID = 6262;
const NEBIUS = 'pf-stub-nebius-3a9c';
const TAVILY = 'pf-stub-tavily-71e4';
const LIVE = { argv: ['--live', '--cap', '5'], env: { PAGEFIFTY_LIVE: '1' } };
const GERMAN = 'de-610242-thinking-off';

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

interface CommandRun {
	notices: readonly string[];
	argv?: readonly string[];
	env?: Record<string, string>;
	replies?: readonly RecordedReply[];
}

async function commandRun({ notices, argv = [], env = {}, replies = [] }: CommandRun) {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-command-'));
	roots.push(root);
	mkdirSync(join(root, 'examples'));
	const clock = createFakeClock(START);
	const ted = createScriptedTed({ clock, notices });
	const provider = createStubProvider({ replies });
	const lines: string[] = [];
	const keyPaths: string[] = [];
	const code = await runCapture(
		commandDeps({
			root,
			transport: ted,
			providerTransport: provider,
			clock,
			argv,
			env,
			head: '0123456789abcdef0123456789abcdef01234567',
			pid: PID,
			isAlive: (pid: number) => pid === PID,
			log: (line: string) => lines.push(line),
			loadKeys: (path: string) => {
				keyPaths.push(path);
				return Object.freeze({ NEBIUS_API_KEY: NEBIUS, TAVILY_API_KEY: TAVILY });
			}
		})
	);
	return { code, root, lines, provider, keyPaths, folder: join(root, 'examples', DAY) };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

function filesUnder(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});
}

// Every file the run left under its temp root and every log line, so an empty scan cannot pass for a
// clean one: the caller asserts the files were read.
function keyTraces(run: { root: string; lines: string[] }) {
	const keys = [NEBIUS, TAVILY];
	const files = filesUnder(run.root);
	const found = [
		...run.lines.filter((line) => keys.some((key) => line.includes(key))),
		...files.filter((file) => {
			const text = readFileSync(file, 'latin1');
			return keys.some((key) => text.includes(key));
		})
	];
	return { found, files };
}

const RUN_RECORD_KEYS = [
	'schemaVersion',
	'startedAt',
	'finishedAt',
	'captureDate',
	'outcome',
	'reason',
	'command',
	'head',
	'modes',
	'query',
	'ted',
	'notices',
	'metered',
	'reading'
];

describe('the command with the model step', () => {
	it('the command reads one German lot live and publishes its reading with the run cost', async () => {
		const run = await commandRun({
			notices: ['610242-2026'],
			...LIVE,
			replies: [readReplyFixture(GERMAN)]
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.keyPaths).toEqual([join(run.root, '.env')]);
		expect(run.provider.calls()).toHaveLength(1);
		const readings = ReadingsFileSchema.parse(readJson(join(run.folder, 'readings.json')));
		expect(readings.notices).toEqual([
			{
				notice: '610242-2026',
				lots: [{ lot: 'LOT-0000', status: 'read', textSha256: readings.readings[0].textSha256 }]
			}
		]);
		expect(readings.readings).toHaveLength(1);
		expect(readings.readings[0]).toMatchObject({
			notice: '610242-2026',
			model: 'nvidia/nemotron-3-super-120b-a12b',
			readOn: DAY,
			responseId: 'chatcmpl-a0d0baa03bbd93f4',
			usage: { input: 1183, output: 1615, reasoning: 0 }
		});
		expect(readings.readings[0].items).toHaveLength(14);
		const record = readJson(join(run.folder, 'run.json'));
		expect(Object.keys(record)).toEqual(RUN_RECORD_KEYS);
		expect(record.reading).toMatchObject({
			model: 'nvidia/nemotron-3-super-120b-a12b',
			provider: 'Nebius Token Factory',
			region: 'us-central1',
			runDate: DAY,
			sends: 1,
			lots: { withCriteria: 1, read: 1, reused: 0, notRead: 0 },
			tokens: { input: 1183, output: 1615, reasoning: 0 },
			costUsd: '0.001808',
			quotes: { verified: 14, rejected: 0 }
		});
		expect(readings.run).toEqual(record.reading);
		expect(record.metered).toMatchObject({ cap: 5, attempts: 1, refusals: [] });
		const traces = keyTraces(run);
		expect(traces.found).toEqual([]);
		expect(traces.files).toContain(join(run.folder, 'readings.json'));
	});

	it('the German request is the one spike 004 sent for that lot', async () => {
		const run = await commandRun({
			notices: ['610242-2026'],
			...LIVE,
			replies: [readReplyFixture(GERMAN)]
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		const calls = run.provider.calls();
		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('POST');
		expect(calls[0].url).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions');
		expect(calls[0].headers.authorization).toBe(`Bearer ${NEBIUS}`);
		expect(JSON.stringify(calls[0].headers)).not.toContain(TAVILY);
		expect(calls[0].body).toEqual(readReplyFixture(GERMAN).request);
	});
});

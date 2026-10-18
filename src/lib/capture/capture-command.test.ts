// The capture command as scripts/capture.mjs wires it, model step included, driven with a stub TED,
// the stub provider serving spike 004's recorded replies, a fake clock and stub keys. Every run gets
// its own temp root, so nothing lands under the repository and its key file is never read.
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
import { afterAll, describe, expect, it } from 'vitest';
import { commandDeps } from '../../../scripts/capture.mjs';
import { capturePath } from '../../test/fixtures/node.ts';
import { readReplyFixture, type RecordedReply } from '../../test/fixtures/replies.ts';
import { buildSynthetic } from '../../test/fixtures/roles.ts';
import { chatResponse, createStubProvider, syntheticReply } from '../../test/provider-stub.ts';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { readNotice } from '../ingest/read-notice.ts';
import { ReadingRunSchema, ReadingsFileSchema } from '../snapshot/readings.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import { runCapture } from './run.ts';
import { chatBody, userMessage } from './token-factory.ts';

const START = Date.parse('2026-09-15T08:00:00Z');
const DAY = '2026-09-15';
const PID = 6262;
const NEBIUS = 'not-a-real-nebius-key-for-the-command';
const TAVILY = 'not-a-real-tavily-key-for-the-command';
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
	tedScript?: Parameters<typeof createScriptedTed>[0]['script'];
	providerScript?: Parameters<typeof createStubProvider>[0]['script'];
	// A root an earlier run used, for a run that finds its store and cache; a fresh temp root otherwise.
	root?: string;
	start?: number;
	// Other pids that read as running, besides the run's own.
	alive?: readonly number[];
}

async function commandRun({
	notices,
	argv = [],
	env = {},
	replies = [],
	tedScript,
	providerScript,
	root = freshRoot(),
	start = START,
	alive = []
}: CommandRun) {
	const clock = createFakeClock(start);
	const ted = createScriptedTed({ clock, notices, script: tedScript });
	const provider = createStubProvider({ replies, script: providerScript });
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
			isAlive: (pid: number) => pid === PID || alive.includes(pid),
			log: (line: string) => lines.push(line),
			loadKeys: (path: string) => {
				keyPaths.push(path);
				return Object.freeze({ NEBIUS_API_KEY: NEBIUS, TAVILY_API_KEY: TAVILY });
			}
		})
	);
	const day = new Date(start).toISOString().slice(0, 10);
	return { code, root, lines, provider, ted, keyPaths, folder: join(root, 'examples', day) };
}

function freshRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-command-'));
	roots.push(root);
	mkdirSync(join(root, 'examples'));
	return root;
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
		expect(ReadingRunSchema.parse(record.reading)).toEqual(record.reading);
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

const THREE = ['610242-2026', '629755-2026', '634398-2026'];
const THREE_REPLIES = ['de-610242-thinking-off', 'fr-629755-default-tab', 'nl-634398-super'].map(
	readReplyFixture
);
const WOULD = 'capture: (dry-run) WOULD call tokenFactory chat';
const PROVIDER_TEXT = 'provider-detail-5e7b';

function trackedRecord(notice: string) {
	const result = readNotice(new Uint8Array(readFileSync(capturePath(notice))), {
		noticeNumber: notice
	});
	if (!result.ok) throw new Error(`${notice} did not read: ${result.detail}`);
	return result.record;
}

const firstLotBody = (notice: string) => chatBody(trackedRecord(notice).lots[0].criteria);

const userMessageOf = (body: unknown) =>
	(body as { messages: { role: string; content: string }[] }).messages[1].content;

const readingsOf = (folder: string) =>
	ReadingsFileSchema.parse(readJson(join(folder, 'readings.json')));

const lotsOf = (folder: string) =>
	Object.fromEntries(
		readingsOf(folder).notices.map(({ notice, lots }) => [
			notice,
			lots.map((lot) => ('reason' in lot ? `${lot.status} ${lot.reason}` : lot.status))
		])
	);

const answerWith = (content: string) => ({
	status: 200,
	json: chatResponse('chatcmpl-x', content)
});

const UNKNOWN_KIND = JSON.stringify({
	requirements: [
		{
			criterion: 1,
			kind: 'turnover-average',
			quote: 'Nachweis der Befähigung',
			reading: 'r',
			numberText: '',
			period: '',
			mandatory: true
		}
	]
});

describe('the model step in a dry run', () => {
	it('a dry run through the command logs a WOULD line for the model step and sends nothing', async () => {
		const run = await commandRun({ notices: THREE, argv: ['--cap', '5'], replies: THREE_REPLIES });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.lines.filter((line) => line === WOULD)).toHaveLength(3);
		expect(run.provider.calls()).toHaveLength(0);
		expect(run.keyPaths).toEqual([]);
		expect(existsSync(join(run.folder, 'readings.json'))).toBe(false);
		expect(run.lines).toContain(
			'capture: model read: 0 read, 0 reused, 3 not read (dry-run 3), 0 sent, USD 0.000000'
		);
		expect(readJson(join(run.folder, 'run.json')).reading).toMatchObject({
			sends: 0,
			lots: { withCriteria: 3, read: 0, reused: 0, notRead: 3 },
			tokens: { input: 0, output: 0, reasoning: 0 },
			costUsd: '0.000000'
		});
	});
});

describe('the model step under the cap', () => {
	it('a cap of N sends N chats and leaves every later lot not read', async () => {
		const run = await commandRun({
			notices: THREE,
			argv: ['--live', '--cap', '2'],
			env: { PAGEFIFTY_LIVE: '1' },
			replies: THREE_REPLIES
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.provider.calls()).toHaveLength(2);
		expect(lotsOf(run.folder)).toEqual({
			'610242-2026': ['read'],
			'629755-2026': ['read'],
			'634398-2026': ['not-read cap-reached']
		});
		const record = readJson(join(run.folder, 'run.json'));
		expect(record.metered.attempts).toBe(2);
		expect(record.metered.refusals).toEqual([
			{ provider: 'tokenFactory', operation: 'chat', reason: 'the cap of 2 attempts is reached' }
		]);
		expect(record.reading).toMatchObject({ sends: 2, lots: { read: 2, notRead: 1 } });
		// With a cap of 1 two lots follow the first refusal, and neither is asked for again.
		const one = await commandRun({
			notices: THREE,
			argv: ['--live', '--cap', '1'],
			env: { PAGEFIFTY_LIVE: '1' },
			replies: THREE_REPLIES
		});
		expect(one.code, one.lines.join('\n')).toBe(0);
		expect(one.provider.calls()).toHaveLength(1);
		expect(lotsOf(one.folder)).toEqual({
			'610242-2026': ['read'],
			'629755-2026': ['not-read cap-reached'],
			'634398-2026': ['not-read cap-reached']
		});
		expect(readJson(join(one.folder, 'run.json')).metered.refusals).toEqual([
			{ provider: 'tokenFactory', operation: 'chat', reason: 'the cap of 1 attempts is reached' }
		]);
	});

	it('a lot whose repair would pass the cap is not partly read', async () => {
		const run = await commandRun({
			notices: ['610242-2026'],
			argv: ['--live', '--cap', '1'],
			env: { PAGEFIFTY_LIVE: '1' },
			replies: [readReplyFixture(GERMAN)],
			providerScript: { 1: answerWith('not json') }
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.provider.calls()).toHaveLength(1);
		expect(existsSync(join(run.folder, 'readings.json'))).toBe(false);
		const record = readJson(join(run.folder, 'run.json'));
		expect(record.metered.refusals).toEqual([
			{
				provider: 'tokenFactory',
				operation: 'chat-repair',
				reason: 'the cap of 1 attempts is reached'
			}
		]);
		expect(record.reading).toMatchObject({ sends: 1, lots: { read: 0, notRead: 1 } });
		expect(run.lines).toContain(
			'capture: model read: 0 read, 0 reused, 1 not read (cap-reached 1), 1 sent, USD 0.000021'
		);
	});
});

describe('which lots the model step sends', () => {
	it('lots go out in publication order, then lot id', async () => {
		const run = await commandRun({
			notices: ['634398-2026', '629755-2026', '610242-2026'],
			...LIVE,
			replies: THREE_REPLIES
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.provider.calls().map((call) => userMessageOf(call.body))).toEqual(
			THREE_REPLIES.map((reply) => userMessageOf(reply.request))
		);
	});

	it('two lots of one notice with the same text are read once and share the reading', async () => {
		const record = trackedRecord('613419-2026');
		expect(record.lots).toHaveLength(2);
		expect(userMessage(record.lots[1].criteria)).toBe(userMessage(record.lots[0].criteria));
		const body = firstLotBody('613419-2026');
		const quote = record.lots[0].criteria[0].descriptions[0].text.slice(0, 40);
		const item = {
			criterion: 1,
			kind: 'other',
			quote,
			reading: 'r',
			numberText: '',
			period: '',
			mandatory: true
		};
		const run = await commandRun({
			notices: ['613419-2026'],
			...LIVE,
			replies: [syntheticReply(body, [item])]
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.provider.calls()).toHaveLength(1);
		const readings = readingsOf(run.folder);
		const lots = readings.notices[0].lots;
		expect(lots.map((lot) => [lot.lot, lot.status])).toEqual([
			[record.lots[0].id, 'read'],
			[record.lots[1].id, 'read']
		]);
		expect(lots[0]).toEqual({ ...lots[1], lot: lots[0].lot });
		expect(readings.readings).toHaveLength(1);
		expect(readings.run.lots).toEqual({ withCriteria: 2, read: 2, reused: 0, notRead: 0 });
	});

	it('a lot with no criteria in the notice is never sent', async () => {
		const stripped = buildSynthetic(
			'notice-source-no-criteria',
			readFileSync(capturePath('609955-2026'), 'utf8')
		);
		const run = await commandRun({
			notices: ['610242-2026', '609955-2026'],
			...LIVE,
			replies: [readReplyFixture(GERMAN)],
			tedScript: { [tedNoticeXmlUrl('609955-2026')]: [{ status: 200, body: stripped }] }
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		const calls = run.provider.calls();
		expect(calls).toHaveLength(1);
		expect(calls[0].body).toEqual(readReplyFixture(GERMAN).request);
		const lots = lotsOf(run.folder);
		expect(lots['610242-2026']).toEqual(['read']);
		expect(lots['609955-2026'].length).toBeGreaterThan(0);
		expect(new Set(lots['609955-2026'])).toEqual(new Set(['no-criteria']));
	});

	it('every sent body is the lot criteria text and nothing else', async () => {
		const run = await commandRun({ notices: THREE, ...LIVE, replies: THREE_REPLIES });
		expect(run.code, run.lines.join('\n')).toBe(0);
		const bodies = run.provider.calls().map((call) => call.body);
		expect(bodies).toEqual(THREE.map(firstLotBody));
		expect(bodies[0]).toEqual(readReplyFixture(GERMAN).request);
		expect(Object.keys(bodies[0] as object)).toEqual([
			'model',
			'temperature',
			'max_tokens',
			'messages',
			'response_format',
			'chat_template_kwargs'
		]);
	});
});

describe('replies the model step cannot use', () => {
	it('an invalid reply gets exactly one repair carrying its issues, then the lot is not read', async () => {
		const cases: { script: CommandRun['providerScript']; issue: string; lot: string }[] = [
			{
				script: { 1: answerWith('not json'), 2: answerWith('still not json') },
				issue: 'reply: not JSON',
				lot: 'not-read reply-invalid'
			},
			{
				script: { 1: answerWith(UNKNOWN_KIND), 2: answerWith(UNKNOWN_KIND) },
				issue: 'requirements.0.kind: ',
				lot: 'not-read reply-invalid'
			},
			{ script: { 1: answerWith('not json') }, issue: 'reply: not JSON', lot: 'read' }
		];
		for (const { script, issue, lot } of cases) {
			const run = await commandRun({
				notices: ['610242-2026'],
				...LIVE,
				replies: [readReplyFixture(GERMAN)],
				providerScript: script
			});
			expect(run.code, run.lines.join('\n')).toBe(0);
			const calls = run.provider.calls();
			expect(calls, issue).toHaveLength(2);
			const repair = calls[1].body as { messages: { role: string; content: string }[] };
			expect(repair.messages.slice(0, 2)).toEqual(readReplyFixture(GERMAN).request.messages);
			expect(repair.messages).toHaveLength(4);
			expect(repair.messages[3].role).toBe('user');
			expect(repair.messages[3].content).toContain(issue);
			const record = readJson(join(run.folder, 'run.json'));
			expect(
				record.metered.responses.map((response: { operation: string }) => response.operation)
			).toEqual(['chat', 'chat-repair']);
			if (lot === 'read') expect(lotsOf(run.folder)).toEqual({ '610242-2026': ['read'] });
			else {
				expect(existsSync(join(run.folder, 'readings.json'))).toBe(false);
				expect(run.lines).toContain(
					`capture: model read: 0 read, 0 reused, 1 not read (reply-invalid 1), 2 sent, USD ${record.reading.costUsd}`
				);
			}
		}
	});

	it('a send that fails leaves only that lot not read', async () => {
		const failures = [
			{ status: 500, text: `upstream broke: ${PROVIDER_TEXT}` },
			{ status: 200, json: { error: PROVIDER_TEXT } },
			{ throws: new Error(`socket closed: ${PROVIDER_TEXT}`) }
		];
		for (const failure of failures) {
			const run = await commandRun({
				notices: THREE,
				...LIVE,
				replies: THREE_REPLIES,
				providerScript: { 1: failure }
			});
			expect(run.code, run.lines.join('\n')).toBe(0);
			expect(run.provider.calls()).toHaveLength(3);
			expect(lotsOf(run.folder)).toEqual({
				'610242-2026': ['not-read send-failed'],
				'629755-2026': ['read'],
				'634398-2026': ['read']
			});
			expect(run.lines.filter((line) => line.includes(PROVIDER_TEXT))).toEqual([]);
			const leaks = filesUnder(run.root).filter((file) =>
				readFileSync(file, 'latin1').includes(PROVIDER_TEXT)
			);
			expect(leaks).toEqual([]);
		}
	});

	it('no provider key appears in any output', async () => {
		const run = await commandRun({ notices: THREE, ...LIVE, replies: THREE_REPLIES });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(run.provider.calls().map((call) => call.headers.authorization)).toEqual(
			THREE.map(() => `Bearer ${NEBIUS}`)
		);
		const traces = keyTraces(run);
		expect(traces.found).toEqual([]);
		expect(traces.files).toEqual(
			expect.arrayContaining([join(run.folder, 'run.json'), join(run.folder, 'readings.json')])
		);
	});
});

const NEXT_DAY = START + 24 * 60 * 60 * 1000;

// The notice's XML with its first criterion text changed by one word, and the request the command
// then sends for that lot.
function changedNotice(notice: string) {
	const xml = readFileSync(capturePath(notice), 'utf8');
	const anchor = trackedRecord(notice).lots[0].criteria[0].descriptions[0].text.slice(0, 24);
	expect(xml.split(anchor)).toHaveLength(2);
	const changed = xml.replace(anchor, `${anchor} gewijzigd`);
	const result = readNotice(new TextEncoder().encode(changed), { noticeNumber: notice });
	if (!result.ok) throw new Error(`the changed ${notice} did not read: ${result.detail}`);
	return { xml: changed, body: chatBody(result.record.lots[0].criteria) };
}

describe('readings reused across runs', () => {
	it('a second run over unchanged text sends nothing and one changed text sends once', async () => {
		const first = await commandRun({ notices: THREE, ...LIVE, replies: THREE_REPLIES });
		expect(first.code, first.lines.join('\n')).toBe(0);
		expect(first.provider.calls()).toHaveLength(3);
		// The raw XML cache would serve the old bytes, so TED is asked for the changed notice again.
		rmSync(join(first.root, '.capture-cache', 'xml', '634398-2026.xml'));
		const changed = changedNotice('634398-2026');
		const second = await commandRun({
			notices: THREE,
			...LIVE,
			root: first.root,
			start: NEXT_DAY,
			replies: [...THREE_REPLIES, syntheticReply(changed.body, [])],
			tedScript: { [tedNoticeXmlUrl('634398-2026')]: [{ status: 200, body: changed.xml }] }
		});
		expect(second.code, second.lines.join('\n')).toBe(0);
		const calls = second.provider.calls();
		expect(calls).toHaveLength(1);
		expect(userMessageOf(calls[0].body)).toBe(userMessageOf(changed.body));
		expect(readJson(join(second.folder, 'run.json')).reading).toMatchObject({
			runDate: '2026-09-16',
			sends: 1,
			lots: { withCriteria: 3, read: 1, reused: 2, notRead: 0 }
		});
		expect(lotsOf(second.folder)).toEqual({
			'610242-2026': ['read'],
			'629755-2026': ['read'],
			'634398-2026': ['read']
		});
		const reused = readingsOf(second.folder).readings.filter((each) => each.readOn === DAY);
		expect(reused.map((each) => each.notice)).toEqual(['610242-2026', '629755-2026']);
	});

	it('reuse does not depend on the order notices arrive in', async () => {
		const first = await commandRun({ notices: THREE, ...LIVE, replies: THREE_REPLIES });
		expect(first.code, first.lines.join('\n')).toBe(0);
		const second = await commandRun({
			notices: [...THREE].reverse(),
			...LIVE,
			root: first.root,
			start: NEXT_DAY,
			replies: THREE_REPLIES
		});
		expect(second.code, second.lines.join('\n')).toBe(0);
		expect(second.provider.calls()).toHaveLength(0);
		const before = readingsOf(first.folder);
		const after = readingsOf(second.folder);
		expect(after.readings).toEqual(before.readings);
		expect(after.notices).toEqual(before.notices);
		expect(after.run.lots).toEqual({ withCriteria: 3, read: 0, reused: 3, notRead: 0 });
	});

	it('two dry runs write equal records and send nothing', async () => {
		const runs = [
			await commandRun({ notices: THREE, argv: ['--cap', '5'], replies: THREE_REPLIES }),
			await commandRun({ notices: THREE, argv: ['--cap', '5'], replies: THREE_REPLIES })
		];
		expect(runs[0].root).not.toBe(runs[1].root);
		for (const run of runs) {
			expect(run.code, run.lines.join('\n')).toBe(0);
			expect(run.provider.calls()).toEqual([]);
		}
		for (const name of ['run.json', 'README.md']) {
			const [a, b] = runs.map((run) => readFileSync(join(run.folder, name)));
			expect(a.equals(b), name).toBe(true);
		}
	});

	it('the run lock refuses a second live run with the model step', async () => {
		const root = freshRoot();
		mkdirSync(join(root, '.capture-cache'));
		const holder = { pid: 4242, startedAt: '2026-09-15T07:59:00.000Z', argv: ['--live'] };
		writeFileSync(join(root, '.capture-cache', 'capture.lock'), JSON.stringify(holder));
		const run = await commandRun({
			notices: THREE,
			...LIVE,
			replies: THREE_REPLIES,
			root,
			alive: [4242]
		});
		expect(run.code).toBe(2);
		expect(run.lines.at(-1)).toContain('another capture run holds');
		expect(run.ted.calls()).toEqual([]);
		expect(run.provider.calls()).toEqual([]);
	});
});

describe('the README of a capture with the model step', () => {
	it('names the model read, and a dry run says no model read was made', async () => {
		const live = await commandRun({ notices: THREE, ...LIVE, replies: THREE_REPLIES });
		const readme = readFileSync(join(live.folder, 'README.md'), 'utf8');
		expect(readme).toContain('## Model read');
		expect(readme).toContain(
			'nvidia/nemotron-3-super-120b-a12b on Nebius Token Factory, region us-central1, with thinking off'
		);
		expect(readme).toContain(
			'- 3 lots with criteria: 3 read in this run, 0 reused from an earlier run, 0 not read.'
		);
		expect(readme).toContain(
			'- `readings.json` holds the readings, and `run.json` the tokens and the cost: 3 sent, USD 0.008170.'
		);
		const dry = await commandRun({ notices: THREE, argv: ['--cap', '5'], replies: THREE_REPLIES });
		const dryReadme = readFileSync(join(dry.folder, 'README.md'), 'utf8');
		expect(dryReadme).toContain('## Model read');
		expect(dryReadme).toContain('No model read was made: this was a dry run');
		expect(dryReadme).toContain(
			'- 3 lots with criteria: 0 read in this run, 0 reused from an earlier run, 3 not read.'
		);
		expect(dryReadme).not.toContain('`readings.json`');
	});
});

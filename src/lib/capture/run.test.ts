import { spawnSync } from 'node:child_process';
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
import { folderProblems } from '../../test/capture-detectors.ts';
import { capturePath } from '../../test/fixtures/node.ts';
import { createFakeClock, createScriptedTed, PLANTED_ADDRESS } from '../../test/ted-stub.ts';
import { firstPublishedDay } from '../snapshot/capture-id.ts';
import { checkCaptureFolder } from '../snapshot/scrub-check.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import { captureDate, defaultSince } from './capture-folder.ts';
import { runRecordName } from './run-record.ts';
import { runCapture } from './run.ts';
import { createTedClient, GAP_MS, type Clock } from './ted-client.ts';
import { SEARCH_FIELDS, searchBody, TED_SEARCH_URL } from './ted-search.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const SEARCH = 'https://api.ted.europa.eu/v3/notices/search';
const QUERY =
	'classification-cpv IN (72000000 48000000) AND buyer-country IN (NLD BEL DEU) AND publication-date>=20260927 AND notice-type=cn-standard';
const FIELDS = [
	'publication-number',
	'buyer-country',
	'classification-cpv',
	'publication-date',
	'deadline-receipt-tender-date-lot',
	'selection-criterion-lot',
	'selection-criterion-description-lot',
	'document-url-lot',
	'links'
];

const HEAD = '0123456789abcdef0123456789abcdef01234567';
const FOLDER_ENTRIES = ['README.md', 'fetch-log.json', 'notices.json', 'run.json', 'xml'];

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

// Every run writes under its own temp root, never under the repository's examples/ or cache.
function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-run-'));
	mkdirSync(join(root, 'examples'));
	roots.push(root);
	return root;
}

interface RunOptions {
	script?: Parameters<typeof createScriptedTed>[0]['script'];
	// A root an earlier run used, so its cache is there.
	root?: string;
	prepare?: (root: string) => void;
	// Called with the run's root as each request reaches TED, before the stub answers.
	onRequest?: (root: string) => void;
	clock?: Clock;
	pid?: number;
	isAlive?: (pid: number) => boolean;
}

const RUN_PID = 4242;

// A run that rejects still leaves its root, its log and the stub's calls to read.
async function captureRun(notices: readonly string[], options: RunOptions = {}) {
	const root = options.root ?? tempRoot();
	options.prepare?.(root);
	const clock = options.clock ?? createFakeClock(START);
	const pid = options.pid ?? RUN_PID;
	const ted = createScriptedTed({ clock, notices, script: options.script });
	const lines: string[] = [];
	const result = { root, ted, lines, folder: join(root, 'examples', '2026-10-11') };
	try {
		const code = await runCapture({
			root,
			transport: async (request) => {
				options.onRequest?.(root);
				return ted(request);
			},
			clock,
			argv: [],
			env: {},
			head: HEAD,
			pid,
			// No test signals a process it did not start, so liveness is always injected.
			isAlive: options.isAlive ?? ((candidate) => candidate === pid),
			log: (line) => lines.push(line)
		});
		return { ...result, code, error: undefined };
	} catch (error) {
		return { ...result, code: undefined, error };
	}
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

const runsOf = (root: string) => join(root, '.capture-cache', 'runs');

function runRecords(root: string): string[] {
	const runs = runsOf(root);
	return existsSync(runs) ? readdirSync(runs).sort() : [];
}

// Stands in for a process killed mid-run: the clock refuses the wait with the given number, and the
// search waits for nothing, so wait 4 is the one before the fourth notice download.
function clockInterruptedAt(waitNumber: number): Clock {
	const clock = createFakeClock(START);
	let waits = 0;
	return {
		now: clock.now,
		sleep(ms: number): Promise<void> {
			waits += 1;
			return waits === waitNumber ? Promise.reject(new Error('interrupted')) : clock.sleep(ms);
		}
	};
}

describe('a capture run against the stub TED', () => {
	const listed = ['609955-2026', '600779-2026', '600457-2026'];
	const sorted = ['600457-2026', '600779-2026', '609955-2026'];
	let run: Awaited<ReturnType<typeof captureRun>>;

	beforeAll(async () => {
		run = await captureRun(listed);
	});

	it('returns 0 and writes notices.json, README.md and one XML file per notice', () => {
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(readdirSync(run.folder).sort()).toEqual(FOLDER_ENTRIES);
		expect(readdirSync(join(run.folder, 'xml')).sort()).toEqual(sorted.map((n) => `${n}.xml`));
		const notices = readJson(join(run.folder, 'notices.json'));
		expect(notices).toMatchObject({
			fetchedAt: '2026-10-11T08:00:00.000Z',
			query: QUERY,
			scope: 'ACTIVE',
			onlyLatestVersions: true,
			since: '20260927',
			total: 3,
			searchTotal: 3
		});
		expect(Object.keys(notices)).toEqual([
			'fetchedAt',
			'query',
			'scope',
			'onlyLatestVersions',
			'since',
			'total',
			'searchTotal',
			'notices'
		]);
		expect(
			notices.notices.map((hit: Record<string, unknown>) => hit['publication-number'])
		).toEqual(sorted);
		expect(run.lines).toContain('capture: wrote examples/2026-10-11 with 3 notices');
	});

	it('searches once with scope ACTIVE and latest versions only, then fetches each XML a second apart', () => {
		const calls = run.ted.calls();
		expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
			`POST ${SEARCH}`,
			...sorted.map((n) => `GET ${tedNoticeXmlUrl(n)}`)
		]);
		expect(calls[0].body).toEqual({
			query: QUERY,
			fields: FIELDS,
			limit: 250,
			page: 1,
			scope: 'ACTIVE',
			onlyLatestVersions: true
		});
		expect(GAP_MS).toBe(1000);
		for (let index = 1; index < calls.length; index += 1) {
			expect(calls[index].at - calls[index - 1].at).toBeGreaterThanOrEqual(GAP_MS);
		}
		expect(run.ted.maxInFlight()).toBe(1);
	});

	it("asks for scope ACTIVE and latest versions only on every search page, at TED's search address", () => {
		expect(TED_SEARCH_URL).toBe(SEARCH);
		expect(SEARCH_FIELDS).toEqual(FIELDS);
		for (const page of [1, 2, 3]) {
			expect(searchBody('20260927', page)).toEqual({
				query: QUERY,
				fields: FIELDS,
				limit: 250,
				page,
				scope: 'ACTIVE',
				onlyLatestVersions: true
			});
		}
	});

	it('writes each XML as the tracked file after the scrub and keeps the raw notice in the cache', () => {
		for (const notice of sorted) {
			const written = readFileSync(join(run.folder, 'xml', `${notice}.xml`));
			expect(Buffer.compare(written, readFileSync(capturePath(notice))), notice).toBe(0);
			const raw = readFileSync(join(run.root, '.capture-cache', 'xml', `${notice}.xml`), 'utf8');
			expect(raw, notice).toContain(PLANTED_ADDRESS);
		}
		expect(readdirSync(join(run.root, '.capture-cache', 'xml')).sort()).toEqual(
			sorted.map((n) => `${n}.xml`)
		);
	});

	it('leaves no staging folder, and the scrub check and the capture detectors find nothing', () => {
		const staging = join(run.root, '.capture-cache', 'staging');
		expect(existsSync(staging) ? readdirSync(staging) : []).toEqual([]);
		expect(checkCaptureFolder(run.folder)).toEqual({
			files: 7,
			dirty: [],
			notText: [],
			links: [],
			special: []
		});
		expect(folderProblems(run.folder)).toEqual([]);
	});

	it('names TED as the source and its reuse terms in the README', () => {
		const readme = readFileSync(join(run.folder, 'README.md'), 'utf8');
		expect(readme).toContain('# TED capture of 2026-10-11');
		expect(readme).toContain(
			"Source: TED, the European Union's Tenders Electronic Daily, https://ted.europa.eu."
		);
		expect(readme).toContain('Commission Decision 2011/833/EU');
		expect(readme).toContain('CC BY 4.0');
		expect(readme).toContain('Terms: https://ted.europa.eu/en/legal-notice');
		expect(readme).toContain('was replaced with `[removed]`');
		expect(readme).toContain('3 notices written, of the 3 TED stated for the search');
	});

	it('is built by scripts/build-records.mjs, whose capture line names 27 Sep 2026 as the first day', () => {
		const out = join(run.root, 'out');
		const build = spawnSync(
			process.execPath,
			['scripts/build-records.mjs', '--examples', join(run.root, 'examples'), '--out', out],
			{ encoding: 'utf8' }
		);
		expect(build.status, build.stderr).toBe(0);
		expect(build.stdout).toContain('records: 2026-10-11: 3 notices in');
		const capture = readJson(join(out, '2026-10-11', 'capture.json'));
		expect(firstPublishedDay(capture.query)).toBe('27 Sep 2026');
	});

	it('passes scripts/scrub-capture.mjs --check', () => {
		const check = spawnSync(
			process.execPath,
			['scripts/scrub-capture.mjs', '--check', run.folder],
			{
				encoding: 'utf8'
			}
		);
		expect(check.status, check.stdout + check.stderr).toBe(0);
	});
});

const RECORD_KEYS = {
	top: [
		'schemaVersion',
		'startedAt',
		'finishedAt',
		'captureDate',
		'outcome',
		'reason',
		'command',
		'head',
		'query',
		'ted',
		'notices'
	],
	query: ['query', 'fields', 'scope', 'onlyLatestVersions', 'since'],
	ted: [
		'searchPages',
		'xmlRequests',
		'cacheHits',
		'status429',
		'waited429Ms',
		'retries502',
		'failures'
	],
	notices: ['listed', 'written', 'leftOut', 'failed', 'sameProcedure']
};

describe.each([
	['601147-2026 listed first', ['601147-2026', '600367-2026']],
	['600367-2026 listed first', ['600367-2026', '601147-2026']]
])('a capture of a notice and the version that replaced it (%s)', (_order, listing) => {
	let run: Awaited<ReturnType<typeof captureRun>>;

	beforeAll(async () => {
		run = await captureRun(listing);
	});

	it('writes only 600367-2026 and lists 601147-2026 in run.json as superseded by it', () => {
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(readdirSync(join(run.folder, 'xml'))).toEqual(['600367-2026.xml']);
		const notices = readJson(join(run.folder, 'notices.json'));
		expect(notices.total).toBe(1);
		expect(notices.searchTotal).toBe(2);
		expect(
			notices.notices.map((hit: Record<string, unknown>) => hit['publication-number'])
		).toEqual(['600367-2026']);
		const record = readJson(join(run.folder, 'run.json'));
		expect(record.notices).toEqual({
			listed: 2,
			written: 1,
			leftOut: [{ notice: '601147-2026', reason: 'superseded by 600367-2026' }],
			failed: [],
			sameProcedure: []
		});
		expect(run.lines).toContain('capture: wrote examples/2026-10-11 with 1 notice');
	});

	it('names the left-out notice and its reason in the README', () => {
		const readme = readFileSync(join(run.folder, 'README.md'), 'utf8');
		expect(readme).toContain('## Left out');
		expect(readme).toContain('- 601147-2026: superseded by 600367-2026');
		expect(readme).toContain('1 notice written, of the 2 TED stated for the search');
	});

	it('writes run.json as two-space JSON in its fixed key order, ending in one newline', () => {
		const text = readFileSync(join(run.folder, 'run.json'), 'utf8');
		const record = JSON.parse(text);
		expect(text).toBe(`${JSON.stringify(record, null, 2)}\n`);
		expect(Object.keys(record)).toEqual(RECORD_KEYS.top);
		expect(Object.keys(record.query)).toEqual(RECORD_KEYS.query);
		expect(Object.keys(record.ted)).toEqual(RECORD_KEYS.ted);
		expect(Object.keys(record.notices)).toEqual(RECORD_KEYS.notices);
		expect(record).toMatchObject({
			schemaVersion: 1,
			startedAt: '2026-10-11T08:00:00.000Z',
			finishedAt: '2026-10-11T08:00:02.000Z',
			captureDate: '2026-10-11',
			outcome: 'written',
			reason: null,
			command: 'node scripts/capture.mjs',
			head: HEAD,
			query: {
				query: QUERY,
				fields: FIELDS,
				scope: 'ACTIVE',
				onlyLatestVersions: true,
				since: '20260927'
			},
			ted: {
				searchPages: 1,
				xmlRequests: 2,
				cacheHits: 0,
				status429: 0,
				waited429Ms: 0,
				retries502: 0,
				failures: 0
			}
		});
	});

	it('logs every request of the run in fetch-log.json, in order and in one entry shape', () => {
		const fetchLog = readJson(join(run.folder, 'fetch-log.json'));
		expect(Object.keys(fetchLog)).toEqual(['log', 'failures']);
		expect(fetchLog.failures).toEqual([]);
		const calls = run.ted.calls();
		expect(fetchLog.log).toHaveLength(calls.length);
		const ids = ['600367-2026', '601147-2026'];
		fetchLog.log.forEach((entry: Record<string, unknown>, index: number) => {
			const first = index === 0;
			expect(Object.keys(entry)).toEqual([
				'at',
				'category',
				first ? 'page' : 'id',
				'attempt',
				'status',
				'bytes',
				'headers',
				'url'
			]);
			expect(entry).toMatchObject({
				at: new Date(calls[index].at).toISOString(),
				category: first ? 'search' : 'xml',
				...(first ? { page: 1 } : { id: ids[index - 1] }),
				attempt: 0,
				status: 200,
				headers: {},
				url: first ? 'api.ted.europa.eu' : 'ted.europa.eu'
			});
		});
		expect(fetchLog.log[0].bytes).toBeGreaterThan(0);
		for (const [index, id] of ids.entries()) {
			const raw = readFileSync(join(run.root, '.capture-cache', 'xml', `${id}.xml`));
			expect(fetchLog.log[index + 1].bytes).toBe(raw.byteLength);
		}
	});
});

describe('a run over a cache an earlier run filled', () => {
	it('asks TED only for the search, counts its cache hits and writes the same XML', async () => {
		const listing = ['600367-2026', '601147-2026'];
		const first = await captureRun(listing);
		const xmlOf = (folder: string) => readFileSync(join(folder, 'xml', '600367-2026.xml'));
		const firstXml = xmlOf(first.folder);
		rmSync(first.folder, { recursive: true });
		const second = await captureRun(listing, { root: first.root });
		expect(second.code, second.lines.join('\n')).toBe(0);
		expect(second.ted.calls().map(({ method, url }) => `${method} ${url}`)).toEqual([
			`POST ${SEARCH}`
		]);
		const record = readJson(join(second.folder, 'run.json'));
		expect(record.ted).toMatchObject({ searchPages: 1, xmlRequests: 0, cacheHits: 2 });
		expect(Buffer.compare(xmlOf(second.folder), firstXml)).toBe(0);
	});
});

describe('two runs over the same responses under the same clock', () => {
	it('write byte-identical notices.json, fetch-log.json, run.json and README.md', async () => {
		const listing = ['601147-2026', '609955-2026', '600367-2026'];
		const first = await captureRun(listing);
		const second = await captureRun(listing);
		expect([first.code, second.code]).toEqual([0, 0]);
		for (const file of ['notices.json', 'fetch-log.json', 'run.json', 'README.md']) {
			const a = readFileSync(join(first.folder, file));
			const b = readFileSync(join(second.folder, file));
			expect(Buffer.compare(a, b), file).toBe(0);
		}
	});
});

describe('a capture run that must not publish', () => {
	const stagingOf = (root: string) => join(root, '.capture-cache', 'staging');

	it('refuses with 2 before any request when examples/<date> already exists', async () => {
		const run = await captureRun(['600457-2026'], {
			prepare: (root) => mkdirSync(join(root, 'examples', '2026-10-11'))
		});
		expect(run.code).toBe(2);
		expect(run.ted.calls()).toEqual([]);
		expect(run.lines).toEqual([
			'capture: examples/2026-10-11 already exists, and a capture folder is never written again in place'
		]);
	});

	it('writes no folder when the staged check finds an address the scrub cannot see', async () => {
		const notice = '600457-2026';
		const served = readFileSync(capturePath(notice), 'utf8')
			.split('[removed]')
			.join(PLANTED_ADDRESS)
			.replace(
				'<cbc:Description languageID="DEU">',
				`<cbc:Description languageID="DEU">Kontakt ${PLANTED_ADDRESS.replace('@', '&#64;')} `
			);
		const run = await captureRun([notice], {
			script: { [tedNoticeXmlUrl(notice)]: [{ status: 200, body: served }] }
		});
		expect(run.code).toBe(1);
		expect(existsSync(run.folder)).toBe(false);
		expect(readdirSync(stagingOf(run.root))).toEqual([]);
		const named = run.lines.filter((line) =>
			line.startsWith(`capture: contact data left in ${join('xml', `${notice}.xml`)}: `)
		);
		expect(named, run.lines.join('\n')).toHaveLength(1);
		expect(named[0]).toContain('encoded email');
	});

	it('keeps the staged folder and names it when examples/<date> appears during the run', async () => {
		const run = await captureRun(['600457-2026'], {
			onRequest: (root) => mkdirSync(join(root, 'examples', '2026-10-11'), { recursive: true })
		});
		expect(run.code).toBe(1);
		expect(readdirSync(run.folder)).toEqual([]);
		const staged = join(stagingOf(run.root), '2026-10-11-4242');
		expect(readdirSync(staged).sort()).toEqual(FOLDER_ENTRIES);
		expect(run.lines.at(-1)).toBe(
			`capture: ${run.folder} appeared during the run; the capture is complete in ${staged}`
		);
	});
});

describe('a run interrupted before its fourth notice download, then run again', () => {
	const six = [
		'609955-2026',
		'600779-2026',
		'605563-2026',
		'600457-2026',
		'601783-2026',
		'600554-2026'
	];
	const downloaded = ['600457-2026', '600554-2026', '600779-2026'];
	const rest = ['601783-2026', '605563-2026', '609955-2026'];
	let first: Awaited<ReturnType<typeof captureRun>>;
	let second: Awaited<ReturnType<typeof captureRun>>;
	let recordsAfterFirst: string[];

	beforeAll(async () => {
		first = await captureRun(six, { clock: clockInterruptedAt(4) });
		recordsAfterFirst = runRecords(first.root);
		second = await captureRun(six, { root: first.root });
	});

	it('rejects, writes no folder and leaves only whole notices in the cache', () => {
		expect(first.error).toBeInstanceOf(Error);
		expect((first.error as Error).message).toBe('interrupted');
		expect(first.ted.calls().map(({ method, url }) => `${method} ${url}`)).toEqual([
			`POST ${SEARCH}`,
			...downloaded.map((n) => `GET ${tedNoticeXmlUrl(n)}`)
		]);
		expect(recordsAfterFirst).toHaveLength(1);
		const xml = readdirSync(join(first.root, '.capture-cache', 'xml')).sort();
		expect(xml).toEqual(downloaded.map((n) => `${n}.xml`));
	});

	it('records the interrupted run as failed, with the error as its reason', () => {
		expect(recordsAfterFirst).toHaveLength(1);
		const record = readJson(join(runsOf(first.root), recordsAfterFirst[0]));
		expect(Object.keys(record)).toEqual(RECORD_KEYS.top);
		expect(record).toMatchObject({
			startedAt: '2026-10-11T08:00:00.000Z',
			captureDate: '2026-10-11',
			outcome: 'failed',
			reason: 'interrupted',
			ted: { searchPages: 1, xmlRequests: 3 }
		});
	});

	it('asks TED again only for the search and the three notices not yet cached', () => {
		expect(second.code, second.lines.join('\n')).toBe(0);
		expect(second.ted.calls().map(({ method, url }) => `${method} ${url}`)).toEqual([
			`POST ${SEARCH}`,
			...rest.map((n) => `GET ${tedNoticeXmlUrl(n)}`)
		]);
		expect(readdirSync(join(second.folder, 'xml')).sort()).toEqual(
			[...downloaded, ...rest].map((n) => `${n}.xml`)
		);
	});

	it("keeps one record per run, the written one equal to its folder's run.json", () => {
		const names = runRecords(second.root);
		expect(names).toHaveLength(2);
		const written = names.filter((name) => !recordsAfterFirst.includes(name));
		expect(written).toHaveLength(1);
		const record = readFileSync(join(runsOf(second.root), written[0]), 'utf8');
		expect(record).toBe(readFileSync(join(second.folder, 'run.json'), 'utf8'));
		expect(JSON.parse(record)).toMatchObject({ outcome: 'written', reason: null });
	});
});

describe('the run record of every run', () => {
	it('is named by the start instant without a colon and the pid', async () => {
		expect(runRecordName(START, 1234)).toBe('20261011T080000000Z-1234.json');
		const run = await captureRun(['600457-2026'], { pid: 1234 });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(readdirSync(runsOf(run.root))).toEqual(['20261011T080000000Z-1234.json']);
	});

	it('keeps both records of two runs started at one instant in one process', async () => {
		const first = await captureRun(['600457-2026'], { pid: 1234 });
		rmSync(first.folder, { recursive: true });
		const second = await captureRun(['600457-2026'], { root: first.root, pid: 1234 });
		expect([first.code, second.code]).toEqual([0, 0]);
		expect(runRecords(first.root)).toEqual([
			'20261011T080000000Z-1234-2.json',
			'20261011T080000000Z-1234.json'
		]);
	});
});

describe('the start of a run', () => {
	const xmlOf = (root: string) => join(root, '.capture-cache', 'xml');
	const stagingOf = (root: string) => join(root, '.capture-cache', 'staging');

	it('deletes a half-written cache file before any request, and asks TED for that notice', async () => {
		const notice = '600779-2026';
		const temp = (root: string) => join(xmlOf(root), `${notice}.xml.4242.tmp`);
		const half = readFileSync(capturePath(notice)).subarray(0, 2000);
		const seen: boolean[] = [];
		const run = await captureRun([notice], {
			pid: 1234,
			prepare: (root) => {
				mkdirSync(xmlOf(root), { recursive: true });
				writeFileSync(temp(root), half);
			},
			onRequest: (root) => seen.push(existsSync(temp(root)))
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(seen[0]).toBe(false);
		expect(run.ted.calls().map(({ url }) => url)).toContain(tedNoticeXmlUrl(notice));
		expect(readdirSync(xmlOf(run.root))).toEqual([`${notice}.xml`]);
		expect(run.lines).toContain('capture: removed 1 stale temp file from the cache');
	});

	it('removes the staging folder of a run whose process is gone, and keeps a live one', async () => {
		const names = ['2026-10-11-4242', '2026-10-11-5555', 'kept-by-name'];
		const presentAtFirstRequest: string[][] = [];
		const run = await captureRun(['600457-2026'], {
			pid: 1234,
			isAlive: (pid) => pid === 1234 || pid === 5555,
			prepare: (root) => {
				for (const name of names) {
					mkdirSync(join(stagingOf(root), name), { recursive: true });
					writeFileSync(join(stagingOf(root), name, 'notices.json'), '{}');
				}
			},
			onRequest: (root) => presentAtFirstRequest.push(readdirSync(stagingOf(root)).sort())
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(presentAtFirstRequest[0]).toEqual(['2026-10-11-5555', 'kept-by-name']);
		expect(readdirSync(stagingOf(run.root)).sort()).toEqual(['2026-10-11-5555', 'kept-by-name']);
		expect(run.lines).toContain('capture: removed 1 stale staging folder');
	});

	it('logs no cleanup line when there was nothing to remove', async () => {
		const run = await captureRun(['600457-2026']);
		expect(run.code).toBe(0);
		expect(run.lines.filter((line) => line.includes('removed'))).toEqual([]);
	});
});

describe('the TED client', () => {
	it('refuses an address that is not plain https on a TED host, and sends nothing', async () => {
		const clock = createFakeClock(START);
		const ted = createScriptedTed({ clock, notices: [] });
		const client = createTedClient({ transport: ted, clock });
		for (const url of [
			'http://ted.europa.eu/en/notice/600457-2026/xml',
			'https://ted.europa.eu:8443/en/notice/600457-2026/xml',
			'https://ted.europa.eu.example.org/en/notice/600457-2026/xml',
			'https://example.org/en/notice/600457-2026/xml'
		]) {
			const answer = await client.send('xml', () => new Request(url), { id: '600457-2026' }, 1000);
			expect(answer, url).toEqual({ ok: false, reason: `refused ${url}: not https on a TED host` });
		}
		expect(ted.calls()).toEqual([]);
		expect(client.log()).toEqual([]);
	});
});

describe('the capture day and its window', () => {
	it('names the folder by the day in Amsterdam, so 22:30 UTC on 10 Oct is 11 Oct', () => {
		expect(captureDate(Date.parse('2026-10-10T22:30:00Z'))).toBe('2026-10-11');
		expect(captureDate(Date.parse('2026-10-10T21:59:59Z'))).toBe('2026-10-10');
		expect(captureDate(Date.parse('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
	});

	it('opens the window 14 days before the capture day, across a month and a year', () => {
		expect(defaultSince('2026-10-11')).toBe('20260927');
		expect(defaultSince('2026-03-05')).toBe('20260219');
		expect(defaultSince('2027-01-03')).toBe('20261220');
	});
});

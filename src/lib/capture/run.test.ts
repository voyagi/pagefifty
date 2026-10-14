import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
import { runCapture } from './run.ts';
import { createTedClient, GAP_MS } from './ted-client.ts';
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
	prepare?: (root: string) => void;
	// Called with the run's root as each request reaches TED, before the stub answers.
	onRequest?: (root: string) => void;
}

async function captureRun(notices: readonly string[], options: RunOptions = {}) {
	const root = tempRoot();
	options.prepare?.(root);
	const clock = createFakeClock(START);
	const ted = createScriptedTed({ clock, notices, script: options.script });
	const lines: string[] = [];
	const code = await runCapture({
		root,
		transport: async (request) => {
			options.onRequest?.(root);
			return ted(request);
		},
		clock,
		argv: [],
		env: {},
		head: '0123456789abcdef0123456789abcdef01234567',
		pid: 4242,
		log: (line) => lines.push(line)
	});
	return { root, ted, lines, code, folder: join(root, 'examples', '2026-10-11') };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('a capture run against the stub TED', () => {
	const listed = ['609955-2026', '600779-2026', '600457-2026'];
	const sorted = ['600457-2026', '600779-2026', '609955-2026'];
	let run: Awaited<ReturnType<typeof captureRun>>;

	beforeAll(async () => {
		run = await captureRun(listed);
	});

	it('returns 0 and writes notices.json, README.md and one XML file per notice', () => {
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(readdirSync(run.folder).sort()).toEqual(['README.md', 'notices.json', 'xml']);
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
			files: 5,
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
		expect(readdirSync(staged).sort()).toEqual(['README.md', 'notices.json', 'xml']);
		expect(run.lines.at(-1)).toBe(
			`capture: ${run.folder} appeared during the run; the capture is complete in ${staged}`
		);
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

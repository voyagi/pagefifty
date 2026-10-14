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
import { runCapture } from './run.ts';

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

async function captureRun(notices: readonly string[]) {
	const root = tempRoot();
	const clock = createFakeClock(START);
	const ted = createScriptedTed({ clock, notices });
	const lines: string[] = [];
	const code = await runCapture({
		root,
		transport: ted,
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
		for (let index = 1; index < calls.length; index += 1) {
			expect(calls[index].at - calls[index - 1].at).toBeGreaterThanOrEqual(1000);
		}
		expect(run.ted.maxInFlight()).toBe(1);
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

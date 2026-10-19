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
import { capturePath } from '../../test/fixtures/node.ts';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import { runCapture, type MeteredStep } from './run.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const PID = 6262;

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

interface OpenAfterRun {
	notices: readonly string[];
	argv: readonly string[];
	script?: Parameters<typeof createScriptedTed>[0]['script'];
	meteredSteps?: readonly MeteredStep[];
	prepare?: (root: string) => void;
}

// Each run writes under its own temp root against the stub TED, never the repository's examples/.
async function openAfterRun({ notices, argv, script, meteredSteps, prepare }: OpenAfterRun) {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-open-after-'));
	roots.push(root);
	mkdirSync(join(root, 'examples'));
	prepare?.(root);
	const clock = createFakeClock(START);
	const ted = createScriptedTed({ clock, notices, script });
	const lines: string[] = [];
	const code = await runCapture({
		root,
		transport: ted,
		clock,
		argv,
		env: {},
		head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
		pid: PID,
		isAlive: (pid) => pid === PID,
		log: (line) => lines.push(line),
		meteredSteps
	});
	return { code, lines, root, ted, folder: join(root, 'examples', '2026-10-11') };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

const writtenNotices = (folder: string): string[] =>
	readJson(join(folder, 'notices.json')).notices.map(
		(hit: Record<string, unknown>) => hit['publication-number']
	);

describe('a capture run with --open-after', () => {
	it('a capture with --open-after keeps only notices whose every lot closes after it', async () => {
		// 624998-2026 closes 25 Sep and 604299-2026 30 Sep; 604321-2026 closes 1 Oct at 10:00 CEST
		// and both lots of 600779-2026 on 5 Oct.
		const run = await openAfterRun({
			notices: ['624998-2026', '604321-2026', '600779-2026', '604299-2026'],
			argv: ['--open-after', '2026-10-01T00:00:00Z']
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(writtenNotices(run.folder)).toEqual(['600779-2026', '604321-2026']);
		expect(readdirSync(join(run.folder, 'xml')).sort()).toEqual([
			'600779-2026.xml',
			'604321-2026.xml'
		]);
		const reason = 'a lot closes at or before 2026-10-01T00:00:00.000Z';
		const record = readJson(join(run.folder, 'run.json'));
		expect(record.notices.leftOut).toEqual([
			{ notice: '604299-2026', reason },
			{ notice: '624998-2026', reason }
		]);
		expect(record.notices.written).toBe(2);
		expect(record.openAfter).toBe('2026-10-01T00:00:00.000Z');
		const keys = Object.keys(record);
		expect(keys[keys.indexOf('modes') + 1]).toBe('openAfter');
		const listing = readJson(join(run.folder, 'notices.json'));
		expect(listing.openAfter).toBe('2026-10-01T00:00:00.000Z');
		expect(Object.keys(listing)).toEqual([
			'fetchedAt',
			'query',
			'scope',
			'onlyLatestVersions',
			'since',
			'openAfter',
			'total',
			'searchTotal',
			'notices'
		]);
	});

	it('the README of a capture made with --open-after names the instant and the notices it left out', async () => {
		const run = await openAfterRun({
			notices: ['624998-2026', '604321-2026', '600779-2026', '604299-2026'],
			argv: ['--open-after', '2026-10-01T00:00:00Z']
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		const readme = readFileSync(join(run.folder, 'README.md'), 'utf8');
		expect(readme).toContain(
			'- Only notices whose every lot closes after 2026-10-01T00:00:00.000Z (1 Oct 2026, 02:00 CEST) were kept: 2 notices with a lot that closes at or before it, or shows no deadline, were left out, and Left out names each.'
		);
	});

	it('the README of a filtered capture that left nothing out says so', async () => {
		const run = await openAfterRun({
			notices: ['600779-2026'],
			argv: ['--open-after', '2026-09-20T00:00:00Z']
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(readFileSync(join(run.folder, 'README.md'), 'utf8')).toContain(
			'- Only notices whose every lot closes after 2026-09-20T00:00:00.000Z (20 Sep 2026, 02:00 CEST) were kept, and no listed notice closed earlier.'
		);
	});

	it('a capture made without --open-after records no instant and says nothing about one', async () => {
		const run = await openAfterRun({ notices: ['600779-2026'], argv: [] });
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(readJson(join(run.folder, 'run.json')).openAfter).toBeNull();
		expect(readJson(join(run.folder, 'notices.json')).openAfter).toBeNull();
		expect(readFileSync(join(run.folder, 'README.md'), 'utf8')).not.toContain('Only notices whose');
	});
});

// The tender deadline period of each lot of a tracked notice, in lot order, replaced by the given
// day and time, or removed for null. The count must match, so a notice with another lot count, or a
// period this pattern misses, fails the fixture instead of serving the tracked deadline.
const TENDER_PERIOD =
	/<cac:TenderSubmissionDeadlinePeriod>[\s\S]*?<\/cac:TenderSubmissionDeadlinePeriod>/g;

function withLotDeadlines(notice: string, periods: readonly ([string, string] | null)[]) {
	const tracked = readFileSync(capturePath(notice), 'utf8');
	const found = tracked.match(TENDER_PERIOD)?.length ?? 0;
	if (found !== periods.length) {
		throw new Error(`${notice} has ${found} tender deadline periods, not ${periods.length}`);
	}
	let lot = 0;
	const body = tracked.replace(TENDER_PERIOD, () => {
		const period = periods[lot++];
		return period === null
			? ''
			: `<cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>${period[0]}</cbc:EndDate><cbc:EndTime>${period[1]}</cbc:EndTime></cac:TenderSubmissionDeadlinePeriod>`;
	});
	return { [tedNoticeXmlUrl(notice)]: [{ status: 200, body }] };
}

// 607360-2026 closes on 30 Nov 2026, after every instant used here, so each run writes something.
const STAYS = '607360-2026';

async function filteredRun(
	openAfter: string,
	notice: string,
	periods: readonly ([string, string] | null)[]
) {
	const run = await openAfterRun({
		notices: [notice, STAYS],
		argv: ['--open-after', openAfter],
		script: withLotDeadlines(notice, periods)
	});
	expect(run.code, run.lines.join('\n')).toBe(0);
	return writtenNotices(run.folder);
}

describe('the edges of the --open-after filter', () => {
	it('a lot closing exactly at the instant is left out', async () => {
		const instant = '2026-10-02T10:00:00Z';
		expect(
			await filteredRun(instant, '609955-2026', [['2026-10-02+02:00', '12:00:00+02:00']])
		).toEqual([STAYS]);
		expect(
			await filteredRun(instant, '609955-2026', [['2026-10-02+02:00', '12:00:00.001+02:00']])
		).toEqual([STAYS, '609955-2026']);
	});

	it('every lot of a notice counts', async () => {
		const instant = '2026-10-02T10:00:00Z';
		const lotTwoEarly = await filteredRun(instant, '600779-2026', [
			['2026-10-05+02:00', '10:00:00+02:00'],
			['2026-10-01+02:00', '10:00:00+02:00']
		]);
		expect(lotTwoEarly).toEqual([STAYS]);
		const lotOneEarly = await filteredRun(instant, '600779-2026', [
			['2026-10-01+02:00', '10:00:00+02:00'],
			['2026-10-05+02:00', '10:00:00+02:00']
		]);
		expect(lotOneEarly).toEqual([STAYS]);
		const bothLate = await filteredRun(instant, '600779-2026', [
			['2026-10-05+02:00', '10:00:00+02:00'],
			['2026-10-06+02:00', '10:00:00+02:00']
		]);
		expect(bothLate).toEqual(['600779-2026', STAYS]);
	});

	it('a lot with no deadline instant is left out', async () => {
		expect(await filteredRun('2026-10-02T10:00:00Z', '609955-2026', [null])).toEqual([STAYS]);
	});

	it('deadlines are compared as instants', async () => {
		// 19:00 at +02:00 on the cutoff day is 17:00 UTC: the cutoff itself, though the written day and
		// hour read later than 18:00 CET.
		const cutoff = '2026-10-30T17:00:00Z';
		expect(
			await filteredRun(cutoff, '609955-2026', [['2026-10-30+02:00', '19:00:00+02:00']])
		).toEqual([STAYS]);
		expect(
			await filteredRun(cutoff, '609955-2026', [['2026-10-30+02:00', '19:00:01+02:00']])
		).toEqual([STAYS, '609955-2026']);
	});

	it('a filter that leaves no notice fails and writes nothing', async () => {
		const previous = ['examples', '2026-10-10', 'README.md'];
		const run = await openAfterRun({
			notices: ['624998-2026', '604299-2026'],
			argv: ['--open-after', '2026-10-01T00:00:00Z'],
			prepare: (root) => {
				mkdirSync(join(root, 'examples', '2026-10-10'));
				writeFileSync(join(root, ...previous), 'the previous capture\n');
			}
		});
		expect(run.code).toBe(1);
		expect(run.lines).toContain('capture: no notice was left to write; nothing was written');
		expect(existsSync(run.folder)).toBe(false);
		expect(readdirSync(join(run.root, 'examples'))).toEqual(['2026-10-10']);
		expect(readFileSync(join(run.root, ...previous), 'utf8')).toBe('the previous capture\n');
		const records = readdirSync(join(run.root, '.capture-cache', 'runs'));
		expect(records).toHaveLength(1);
		const record = readJson(join(run.root, '.capture-cache', 'runs', records[0]));
		expect(record).toMatchObject({
			outcome: 'failed',
			reason: 'no notice was left to write',
			openAfter: '2026-10-01T00:00:00.000Z'
		});
	});

	it('the deadline filter runs before the metered steps', async () => {
		const handed: string[][] = [];
		const step: MeteredStep = async ({ records }) => {
			handed.push(records.map((record) => record.noticeNumber));
		};
		const run = await openAfterRun({
			notices: ['624998-2026', '604321-2026', '600779-2026', '604299-2026'],
			argv: ['--open-after', '2026-10-01T00:00:00Z'],
			meteredSteps: [step]
		});
		expect(run.code, run.lines.join('\n')).toBe(0);
		expect(handed).toEqual([['600779-2026', '604321-2026']]);
	});

	it.each(['2026-10-30', '2026-10-30T17:00:00', '2026-13-01T00:00:00Z'])(
		'a run given --open-after %j exits 2 before any request',
		async (value) => {
			const run = await openAfterRun({ notices: [STAYS], argv: ['--open-after', value] });
			expect(run.code).toBe(2);
			expect(run.ted.calls()).toEqual([]);
			expect(run.lines.at(-1)).toContain(`--open-after ${JSON.stringify(value)}`);
			expect(existsSync(join(run.root, '.capture-cache'))).toBe(false);
		}
	);
});

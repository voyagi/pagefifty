import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { figureOf } from '$lib/core/figure';
import { DEMO_PROFILE } from '$lib/profile/demo-firm';
import {
	CaptureLineSchema,
	NoticeRecordSchema,
	SnapshotIndexSchema
} from '$lib/snapshot/index-row';
import { NoticeReadingsSchema, ReadingsFileSchema } from '$lib/snapshot/readings';
import { SearchesFileSchema } from '$lib/snapshot/searches';
import { buildTenderPage } from '$lib/tenders/tender-page';
import { lotVerdict } from '$lib/tenders/verdict-view';
import { buyerSearchCounts } from './buyer-search-counts';

// records.ts reads its files through the adapter's read(), which only a built app provides; these
// tests need only the capture it names as the example.
vi.mock('$app/server', () => ({ read: vi.fn() }));

const { EXAMPLE_CAPTURE } = await import('$lib/server/records');
const { FEATURED_NOTICE } = await import('$lib/server/tenders');

// The README is the judged landing page, and every figure in it is the example capture's own. A new
// example capture fails these tests until the README is rewritten, the screenshots' descriptions
// included, which is when the screenshots are retaken: no test reads the pictures themselves, only
// that each one the README shows exists.
const readJson = (...path: string[]): unknown => JSON.parse(readFileSync(join(...path), 'utf8'));
const README = readFileSync('README.md', 'utf8').replace(/\s+/g, ' ');

interface Run {
	notices: { written: number };
	search: { searches: number };
	metered: {
		attempts: number;
		perProvider: { tokenFactory: number };
		responses: { provider: string; operation: string }[];
	};
	reading: {
		runDate: string;
		sends: number;
		lots: { withCriteria: number; read: number; notRead: number };
		costUsd: string;
		tokens: { input: number; output: number; reasoning: number };
		quotes: { verified: number; rejected: number };
	};
}
interface Figure {
	population: number;
	runs: number;
	counts: { go: number; partnerNeeded: number; noGo: number; askFirst: number };
}

const run = readJson('examples', EXAMPLE_CAPTURE, 'run.json') as Run;
const figure = readJson('examples', EXAMPLE_CAPTURE, 'figure.json') as Figure;
const count = (value: number) => value.toLocaleString('en-US');
const { verified, rejected } = run.reading.quotes;
const quotes = verified + rejected;
const runDay = new Date(`${run.reading.runDate}T12:00:00Z`);
const dayMonth = runDay.toLocaleDateString('en-GB', {
	day: 'numeric',
	month: 'long',
	timeZone: 'UTC'
});

// The notices whose readings list at least one lot with criteria in the notice.
const readings = ReadingsFileSchema.parse(readJson('examples', EXAMPLE_CAPTURE, 'readings.json'));
const withCriteria = readings.notices
	.filter((notice) => notice.lots.some((lot) => lot.status !== 'no-criteria'))
	.map(({ notice }) => notice);

// A notice's page as the example serves it: the built capture, its readings, the capture's instant.
const BUILT = join('src', 'lib', 'snapshot', 'generated', EXAMPLE_CAPTURE);
function examplePage(notice: string) {
	const record = NoticeRecordSchema.parse(readJson(BUILT, 'records', `${notice}.json`));
	const noticeReadings = NoticeReadingsSchema.parse(readJson(BUILT, 'readings', `${notice}.json`));
	const { fetchedAt } = CaptureLineSchema.parse(readJson(BUILT, 'capture.json'));
	return buildTenderPage(record, new Date(fetchedAt), noticeReadings);
}

const NUMBER_WORDS = ['none', 'one', 'two', 'three', 'four', 'five'];

describe('README figures', () => {
	it('points at the example capture and opens the featured notice', () => {
		expect(README).toContain(`[examples/${EXAMPLE_CAPTURE}/](examples/${EXAMPLE_CAPTURE}/)`);
		expect(README).toContain(`/example/${FEATURED_NOTICE})`);
	});

	it("states the run's day, notices, cost and refused quotes as the run recorded them", () => {
		const day = runDay.toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
		const cost = Number(run.reading.costUsd).toFixed(2);
		expect(README).toContain(`On ${day} it went through ${run.notices.written} open IT tenders.`);
		expect(README).toContain(
			`for USD ${cost}, and code refused ${rejected} of the model's ${count(quotes)} quotes`
		);
		expect(README).toContain(`That was ${rejected} of ${count(quotes)} on ${dayMonth}.`);
	});

	it('says the model read every published criterion only when the run read every lot that had one', () => {
		const { withCriteria, read, notRead } = run.reading.lots;
		expect(README).toContain('read every selection criterion published in them');
		expect([read, notRead]).toEqual([withCriteria, 0]);
	});

	it('counts the lots read and the notices with and without criteria in the notice', () => {
		const { written } = run.notices;
		expect(readings.notices).toHaveLength(written);
		expect(README).toContain(
			`${run.reading.lots.read} lots in the ${withCriteria.length} notices that publish criteria in the notice`
		);
		expect(README).toContain(
			`On ${dayMonth}, ${written - withCriteria.length} of the ${written} notices published no selection criteria in the notice at all.`
		);
	});

	it('counts the buyer searches and the pages their panels list as the tender pages show them', () => {
		const file = SearchesFileSchema.parse(readJson('examples', EXAMPLE_CAPTURE, 'searches.json'));
		const searched = file.notices
			.filter((search) => search.status === 'searched')
			.map(({ notice }) => notice);
		expect(new Set(searched)).toEqual(new Set(withCriteria));
		const counts = buyerSearchCounts(EXAMPLE_CAPTURE);
		expect(counts.searched).toBe(run.search.searches);
		expect(README).toContain(
			`For each of the ${counts.searched} notices whose criteria are in the notice, the capture runs one Tavily search`
		);
		expect(README).toContain(
			`(${counts.listed} of ${count(counts.returned)} on ${dayMonth}, ${counts.none} notices left with none)`
		);
	});

	it("names the featured lot's floor and the demo firm's turnover as its verdict compares them", () => {
		const page = examplePage(FEATURED_NOTICE);
		const view = lotVerdict(page.lots[0], DEMO_PROFILE, page.now, page.documents);
		expect(view?.decision.verdict).toBe('PARTNER NEEDED');
		const floors = view?.shortfalls.map(({ floor }) => floor) ?? [];
		expect(floors).toHaveLength(1);
		// The page writes the floor with its cents; the README names a whole-euro floor without them.
		const floor = floors[0]?.match(/^EUR ([\d,]+)\.00$/)?.[1];
		expect(floor, `floor ${floors[0]}`).toEqual(expect.any(String));
		const years = DEMO_PROFILE.turnover.map(({ year, specific: [line] }) => {
			if (line?.net === undefined)
				throw new Error(`the demo firm's ${year} has no turnover in its field`);
			return line.net;
		});
		const average = years.reduce((sum, year) => sum + year, 0) / years.length;
		const floorEuros = Number(floor?.replaceAll(',', ''));
		expect(Math.max(...years)).toBeLessThan(floorEuros);
		expect(average).toBeLessThan(floorEuros);
		const [first, second, third] = years.map(count);
		expect(README).toContain(
			`Notice ${FEATURED_NOTICE}, lot 1: the buyer asks for EUR ${floor} a year in this field. The demo firm made EUR ${first}, ${second} and ${third}, so its best year and its three-year average of EUR ${count(average)} both fall short, the lot reads "${view?.label}"`
		);
	});

	it('shows the refused criterion the README describes, with every quote refused as not found', () => {
		const criterion = examplePage('699142-2026').lots[0].criteria.find(
			({ position }) => position === 6
		);
		const refused = criterion?.rejected ?? [];
		expect(refused.length).toBeGreaterThan(0);
		expect(refused.every(({ reason }) => reason === 'not-found')).toBe(true);
		expect(criterion?.requirements ?? []).toHaveLength(0);
		expect(README).toContain(
			`Notice 699142-2026, criterion 6: the model turned the clause's double quotes into single ones, so code found none of its ${NUMBER_WORDS[refused.length]} quotes and the criterion reads "Not read".`
		);
	});

	it('shows only screenshots that exist', () => {
		const images = [...README.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1]);
		expect(images).toEqual([
			'docs/images/card.png',
			'docs/images/payoff.gif',
			'docs/images/verdict.png',
			'docs/images/refusal.png',
			'docs/images/record.png'
		]);
		for (const image of images) expect(existsSync(image), image).toBe(true);
	});

	it('names the fonts the site and the design mock-ups load, each beside its licence file', () => {
		const families = (...path: string[]) => [
			...new Set(
				[...readFileSync(join(...path), 'utf8').matchAll(/font-family:\s*'([^']+)'/g)].map(
					(match) => match[1]
				)
			)
		];
		expect(families('src', 'app.css')).toEqual(['Albert Sans']);
		const mockups = families('design', 'assets', 'fonts.css');
		expect(mockups.length).toBeGreaterThan(0);
		expect(mockups.every((family) => family.startsWith('IBM Plex'))).toBe(true);
		const licences = ['static/fonts/albert-sans-OFL.txt', 'design/assets/fonts/OFL.txt'];
		for (const licence of licences) {
			expect(readFileSync(licence, 'utf8'), licence).toContain(
				'licensed under the SIL Open Font License, Version 1.1.'
			);
		}
		expect(README).toContain(
			`Fonts: Albert Sans on the site ([licence](${licences[0]})) and IBM Plex in the design mock-ups under \`design/\` ([licence](${licences[1]})), both under the SIL Open Font License 1.1.`
		);
	});

	it("gives the run record's tokens, cost and quote counts in the screenshot's description", () => {
		const { input, output, reasoning } = run.reading.tokens;
		expect(README).toContain(
			`${count(input)} input tokens, ${count(output)} output tokens, ${reasoning} reasoning tokens, USD ${run.reading.costUsd}, ${count(verified)} quotes verified and ${rejected} rejected`
		);
	});

	it("counts the demo firm's verdicts as the start page's figure does", () => {
		const { go, partnerNeeded, noGo, askFirst } = figure.counts;
		expect(figure.population).toBe(run.notices.written);
		expect(README).toContain(
			`${partnerNeeded} of the ${figure.population} notices read "Not met alone" and ${askFirst} read "Ask first". None reads a clean Go.`
		);
		expect([go, noGo]).toEqual([0, 0]);
		expect(README).toContain('There is one live model run so far.');
		expect(figure.runs).toBe(1);
	});

	// The project story outside this repository says these two about the run, so they are pinned to
	// the capture here, without a text match.
	it('finds every "Not met alone" among the notices that publish criteria, so the rest of them ask first', () => {
		const index = SnapshotIndexSchema.parse(readJson(BUILT, 'index.json'));
		const now = new Date(index.capture.fetchedAt).toISOString();
		const read = new Set(withCriteria);
		const served = index.rows.map(({ noticeNumber }) => {
			const record = NoticeRecordSchema.parse(readJson(BUILT, 'records', `${noticeNumber}.json`));
			const path = join(BUILT, 'readings', `${noticeNumber}.json`);
			return existsSync(path)
				? { record, readings: NoticeReadingsSchema.parse(readJson(path)) }
				: { record };
		});
		const inNotice = served.filter(({ record }) => read.has(record.noticeNumber));
		const elsewhere = served.filter(({ record }) => !read.has(record.noticeNumber));
		expect(inNotice).toHaveLength(withCriteria.length);
		const { partnerNeeded } = figure.counts;
		expect(figureOf(inNotice, DEMO_PROFILE, now)).toEqual({
			population: withCriteria.length,
			go: 0,
			partnerNeeded,
			noGo: 0,
			askFirst: withCriteria.length - partnerNeeded
		});
		expect(figureOf(elsewhere, DEMO_PROFILE, now)).toEqual({
			population: elsewhere.length,
			go: 0,
			partnerNeeded: 0,
			noGo: 0,
			askFirst: elsewhere.length
		});
	});

	it('answered every Token Factory call on its first attempt, with no repair retry and no lot unread', () => {
		const calls = run.metered.responses.filter(({ provider }) => provider === 'tokenFactory');
		expect(calls).toHaveLength(run.reading.sends);
		expect(run.metered.perProvider.tokenFactory).toBe(run.reading.sends);
		expect(calls.every(({ operation }) => operation === 'chat')).toBe(true);
		expect(run.metered.attempts).toBe(run.metered.responses.length);
		expect(run.reading.lots.notRead).toBe(0);
	});
});

// The video's transcript speaks some figures as words, so those are pinned as values: a new example
// capture fails here until the transcript, and the video it transcribes, are redone.
describe('demo transcript figures', () => {
	const TRANSCRIPT = readFileSync(join('examples', 'demo-transcript.md'), 'utf8').replace(
		/\s+/g,
		' '
	);
	const { population, counts } = figure;

	it('points at the example capture the video recorded', () => {
		expect(TRANSCRIPT).toContain(`[${EXAMPLE_CAPTURE}/](${EXAMPLE_CAPTURE}/)`);
	});

	it("names the demo firm's size and the featured lot's floor as the verdict compares them", () => {
		expect(TRANSCRIPT).toContain(`You run a ${DEMO_PROFILE.staff.total}-person IT firm.`);
		const page = examplePage(FEATURED_NOTICE);
		const view = lotVerdict(page.lots[0], DEMO_PROFILE, page.now, page.documents);
		expect(view?.shortfalls.map(({ floor }) => floor)).toEqual(['EUR 1,400,000.00']);
		expect(TRANSCRIPT).toContain('one point four million euros a year in this field');
	});

	it("states the run's day, notices, cost and thinking as the run recorded them", () => {
		expect(run.reading.runDate).toBe('2026-10-22');
		expect(Number(run.reading.costUsd).toFixed(2)).toBe('0.28');
		expect(run.reading.tokens.reasoning).toBe(0);
		expect([run.reading.lots.read, run.reading.lots.notRead]).toEqual([
			run.reading.lots.withCriteria,
			0
		]);
		expect(TRANSCRIPT).toContain(
			`On October 22nd it went through ${run.notices.written} open notices and read every criterion printed in them, for twenty-eight US cents, with thinking off.`
		);
		expect(population).toBe(run.notices.written);
		expect(TRANSCRIPT).toContain(
			`${population} open notices, each with its own answer for the same demo firm.`
		);
	});

	it('counts the refused quotes on the shown criterion and on the whole run', () => {
		const criterion = examplePage('699142-2026').lots[0].criteria.find(
			({ position }) => position === 6
		);
		const refused = criterion?.rejected ?? [];
		expect(TRANSCRIPT).toContain(
			`All ${NUMBER_WORDS[refused.length]} quotes are refused, and the criterion says Not read.`
		);
		expect(TRANSCRIPT).toContain(`code refused ${rejected} of ${count(quotes)} quotes`);
	});

	it('gives the Ask first count the start page gives for the demo firm', () => {
		expect(TRANSCRIPT).toContain(
			`Most answers are Ask first: ${counts.askFirst} of ${population} for this firm.`
		);
	});
});

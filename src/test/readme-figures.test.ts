import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// records.ts reads its files through the adapter's read(), which only a built app provides; these
// tests need only the capture it names as the example.
vi.mock('$app/server', () => ({ read: vi.fn() }));

const { EXAMPLE_CAPTURE } = await import('$lib/server/records');
const { FEATURED_NOTICE } = await import('$lib/server/tenders');

// The README is the judged landing page, and every figure in it is the example capture's own. A new
// example capture fails these tests until the README, and the screenshots it shows, are redone.
const readJson = (...path: string[]): unknown => JSON.parse(readFileSync(join(...path), 'utf8'));
const README = readFileSync('README.md', 'utf8').replace(/\s+/g, ' ');

interface Run {
	notices: { written: number };
	reading: {
		runDate: string;
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

describe('README figures', () => {
	it('points at the example capture and opens the featured notice', () => {
		expect(README).toContain(`[examples/${EXAMPLE_CAPTURE}/](examples/${EXAMPLE_CAPTURE}/)`);
		expect(README).toContain(`/example/${FEATURED_NOTICE})`);
	});

	it("states the run's day, notices, cost and refused quotes as the run recorded them", () => {
		const day = new Date(`${run.reading.runDate}T12:00:00Z`).toLocaleDateString('en-GB', {
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
		expect(README).toContain(`That was ${rejected} of ${count(quotes)} on`);
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
});

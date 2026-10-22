import { describe, expect, it } from 'vitest';
import { EXAMPLE_FIGURE, SPREAD_FIGURE } from '../../test/home-figure';
import { FigureFileSchema, type FigureFile } from './figure';

// scripts/figure.mjs runs this schema in a spawned process, where a mutation run cannot see which
// test read the sum rule, so it is also checked here, in the test's own process.

const SUM = 'the four counts do not sum to the population';

const issues = (input: unknown) => {
	const parsed = FigureFileSchema.safeParse(input);
	return parsed.success ? [] : parsed.error.issues.map(({ path, message }) => ({ path, message }));
};

const KEYS = ['go', 'partnerNeeded', 'noGo', 'askFirst'] as const;

describe('FigureFileSchema', () => {
	it.each([
		['the example figure', EXAMPLE_FIGURE],
		['a figure with every count set', SPREAD_FIGURE]
	])('%s parses unchanged', (_, figure: FigureFile) => {
		expect(FigureFileSchema.parse(figure)).toEqual(figure);
	});

	it.each(KEYS)('one more %s than the population holds is refused', (key) => {
		const planted = {
			...SPREAD_FIGURE,
			counts: { ...SPREAD_FIGURE.counts, [key]: SPREAD_FIGURE.counts[key] + 1 }
		};
		expect(issues(planted)).toEqual([{ path: ['counts'], message: SUM }]);
	});

	it('a population the four counts do not reach is refused', () => {
		const planted = { ...SPREAD_FIGURE, population: SPREAD_FIGURE.population + 1 };
		expect(issues(planted)).toEqual([{ path: ['counts'], message: SUM }]);
	});
});

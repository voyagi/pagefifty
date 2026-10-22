import { describe, expect, it } from 'vitest';
import { searchesFileOf } from '../capture/buyer-search';
import { MAX_RESULTS, SearchesFileSchema, type NoticeSearch, type WebResult } from './searches';

// The records build runs this schema in a spawned process, where a mutation run cannot see which
// test read which rule, so each rule is also checked here, in the test's own process.

const result = (n: number): WebResult => ({
	title: `Earlier award ${n}`,
	url: `https://example.org/award/${n}`,
	score: 0.5
});

const searched: NoticeSearch = {
	notice: '610242-2026',
	status: 'searched',
	query: 'Stadt Beispiel earlier contract awards',
	results: [result(1)]
};
const sendFailed: NoticeSearch = {
	notice: '610243-2026',
	status: 'not-searched',
	reason: 'send-failed'
};
const dryRun: NoticeSearch = { notice: '610244-2026', status: 'not-searched', reason: 'dry-run' };

// Two searches were sent: one came back, one failed on the way.
const file = () =>
	searchesFileOf({ searches: 2, credits: 1, notices: [searched, sendFailed, dryRun] }).file;

const issues = (input: unknown) => {
	const parsed = SearchesFileSchema.safeParse(input);
	return parsed.success ? [] : parsed.error.issues.map(({ path, message }) => ({ path, message }));
};

const SENT =
	'the run counts a different number of searches sent than its notices searched or failed';
const NOT_SEARCHED = 'the run counts a different number of notices not searched than it lists';
const URL = 'a result url must be an absolute http or https address';

describe('SearchesFileSchema', () => {
	it('a file whose run counts match its notices parses unchanged', () => {
		expect(file().run).toEqual({ searches: 2, notSearched: 2, credits: 1 });
		expect(SearchesFileSchema.parse(file())).toEqual(file());
	});

	it.each([1, 3])(
		'a run counting %i searches sent beside two sent notices is refused',
		(searches) => {
			const planted = { ...file(), run: { ...file().run, searches } };
			expect(issues(planted)).toEqual([{ path: ['run', 'searches'], message: SENT }]);
		}
	);

	it('a failed send counts as sent, and a dry run does not', () => {
		const onlyReturned = { ...file(), run: { ...file().run, searches: 1 } };
		expect(issues(onlyReturned)).toEqual([{ path: ['run', 'searches'], message: SENT }]);
		const withDryRun = { ...file(), run: { ...file().run, searches: 3 } };
		expect(issues(withDryRun)).toEqual([{ path: ['run', 'searches'], message: SENT }]);
	});

	it.each([1, 3])('a run counting %i notices not searched beside two is refused', (notSearched) => {
		const planted = { ...file(), run: { ...file().run, notSearched } };
		expect(issues(planted)).toEqual([{ path: ['run', 'notSearched'], message: NOT_SEARCHED }]);
	});

	it.each(['javascript:alert(1)', '/award/1', 'ftp://example.org/award'])(
		'a result address %s is refused where the page would link it',
		(url) => {
			const planted = {
				...file(),
				notices: [{ ...searched, results: [{ ...result(1), url }] }, sendFailed, dryRun]
			};
			expect(issues(planted)).toEqual([
				{ path: ['notices', 0, 'results', 0, 'url'], message: URL }
			]);
		}
	);

	it(`a searched notice holds at most ${MAX_RESULTS} results`, () => {
		const results = (count: number) => Array.from({ length: count }, (_, n) => result(n));
		const withResults = (count: number) => ({
			...file(),
			notices: [{ ...searched, results: results(count) }, sendFailed, dryRun]
		});
		expect(issues(withResults(MAX_RESULTS))).toEqual([]);
		expect(issues(withResults(MAX_RESULTS + 1)).map(({ path }) => path)).toEqual([
			['notices', 0, 'results']
		]);
	});
});

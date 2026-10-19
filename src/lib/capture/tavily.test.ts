import { describe, expect, it } from 'vitest';
import { readReplyFixture } from '../../test/fixtures/replies.ts';
import type { Buyer, LangText } from '../ingest/record.ts';
import { AWARD_WORDS, SEARCH_URL, readResults, searchBody, searchQuery } from './tavily.ts';

const buyer = (name: string, country: string): Buyer => ({ name: { text: name }, country });

const notice = (buyers: Buyer[], title: LangText = { text: 'A tender', lang: 'en' }) => ({
	buyers,
	title
});

const result = (url: string, score = 0.5, title = `Result at ${url}`) => ({ url, title, score });

describe('the Tavily search request', () => {
	it('is the request spike 004 sent for the German buyer', () => {
		const recorded = readReplyFixture('tavily-610242-buyer').request;
		const body = searchBody(notice([buyer('Berlin TXL Management GmbH', 'DEU')]));
		expect(body).toEqual(recorded);
		expect(Object.keys(body)).toEqual(Object.keys(recorded));
		expect(SEARCH_URL).toBe('https://api.tavily.com/search');
	});

	it.each([
		['a German buyer', [buyer('Stadt A', 'DEU')], undefined, `Stadt A ${AWARD_WORDS.de}`],
		['a Dutch buyer', [buyer('Gemeente B', 'NLD')], undefined, `Gemeente B ${AWARD_WORDS.nl}`],
		[
			'a Belgian buyer with a Dutch title',
			[buyer('Stad C', 'BEL')],
			{ text: 'Raamovereenkomst', lang: 'nl' },
			`Stad C ${AWARD_WORDS.nl}`
		],
		[
			'a Belgian buyer with a French title',
			[buyer('Ville D', 'BEL')],
			{ text: 'Accord-cadre', lang: 'fr' },
			`Ville D ${AWARD_WORDS.fr}`
		],
		[
			'a Belgian buyer with an English title',
			[buyer('City E', 'BEL')],
			{ text: 'Framework', lang: 'en' },
			`City E ${AWARD_WORDS.en}`
		],
		[
			'a buyer of another country',
			[buyer('Office F', 'AUT')],
			undefined,
			`Office F ${AWARD_WORDS.en}`
		],
		[
			'the first of two buyers, in its own language',
			[buyer('Stadt G', 'DEU'), buyer('Gemeente H', 'NLD')],
			undefined,
			`Stadt G ${AWARD_WORDS.de}`
		]
	])('asks for %s by name and the award words', (_who, buyers, title, query) => {
		expect(searchQuery(notice(buyers, title))).toBe(query);
	});
});

describe('the results the capture keeps', () => {
	it('a result whose URL is not http or https is dropped', () => {
		const kept = readResults([
			result('javascript:alert(1)'),
			result('https://a.example/one', 0.9),
			result('data:text/html,<p>x</p>'),
			result('ftp://files.example/list'),
			result('not a url at all'),
			result('http://b.example/two', 0.4)
		]);
		expect(kept.map(({ url }) => url)).toEqual(['https://a.example/one', 'http://b.example/two']);
	});

	it('at most five results are kept', () => {
		const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => result(`https://r.example/${n}`, 1 - n / 10));
		expect(readResults(seven).map(({ url }) => url)).toEqual(
			seven.slice(0, 5).map(({ url }) => url)
		);
	});

	it('results keep the order Tavily returned them in', () => {
		const given = [
			result('https://low.example/', 0.1),
			result('https://high.example/', 0.9),
			result('https://middle.example/', 0.5)
		];
		expect(readResults(given)).toEqual(given);
	});

	it('keeps only the title, the URL and the score of each result', () => {
		const answer = readReplyFixture('tavily-610242-buyer').response as {
			results: { url: string; title: string; score: number }[];
		};
		const kept = readResults(answer.results);
		expect(kept).toHaveLength(5);
		for (const each of kept) expect(Object.keys(each)).toEqual(['title', 'url', 'score']);
	});
});

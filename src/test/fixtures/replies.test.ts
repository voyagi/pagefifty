import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMAIL_PATTERN, SCRUB_PLACEHOLDER } from '../../lib/snapshot/scrub';
import {
	REPLIES_DIR,
	REPLY_FIXTURES,
	REPLY_MODEL,
	readReplyFixture,
	readReplyText
} from './replies';

const EN_DASH = String.fromCodePoint(0x2013);
const EM_DASH = String.fromCodePoint(0x2014);
const DASHES = new RegExp(`[${EN_DASH}${EM_DASH}]`, 'gu');
const CHAT = REPLY_FIXTURES.filter((each) => each.provider === 'tokenFactory');

describe('the spike 004 reply fixtures', () => {
	it('the replies manifest names exactly the six tracked reply files', () => {
		expect(
			REPLY_FIXTURES.map(({ name, notice, lot, provider, thinking, run }) => ({
				name,
				notice,
				lot,
				provider,
				thinking,
				run
			}))
		).toEqual([
			{
				name: 'de-610242-default',
				notice: '610242-2026',
				lot: 'LOT-0000',
				provider: 'tokenFactory',
				thinking: 'default',
				run: 1
			},
			{
				name: 'de-610242-thinking-off',
				notice: '610242-2026',
				lot: 'LOT-0000',
				provider: 'tokenFactory',
				thinking: 'off',
				run: 1
			},
			{
				name: 'fr-629755-default-tab',
				notice: '629755-2026',
				lot: 'LOT-0001',
				provider: 'tokenFactory',
				thinking: 'default',
				run: 1
			},
			{
				name: 'fr-629755-probe',
				notice: '629755-2026',
				lot: 'LOT-0001',
				provider: 'tokenFactory',
				thinking: 'default',
				run: 1
			},
			{
				name: 'nl-634398-super',
				notice: '634398-2026',
				lot: 'LOT-0001',
				provider: 'tokenFactory',
				thinking: 'off',
				run: 2
			},
			{
				name: 'tavily-610242-buyer',
				notice: '610242-2026',
				lot: 'LOT-0000',
				provider: 'tavily',
				thinking: null,
				run: 1
			}
		]);
		expect(readdirSync(REPLIES_DIR).sort()).toEqual(REPLY_FIXTURES.map((each) => each.file).sort());
	});

	it('no reply fixture holds a header, a key or an Authorization field', () => {
		for (const { name } of REPLY_FIXTURES) {
			const text = readReplyText(name);
			expect(Object.keys(readReplyFixture(name)), name).toEqual(['request', 'response']);
			for (const forbidden of [
				'Authorization',
				'Bearer',
				'api_key',
				'NEBIUS_API_KEY',
				'TAVILY_API_KEY'
			]) {
				expect(text.includes(forbidden), `${name} holds ${forbidden}`).toBe(false);
			}
			expect(EMAIL_PATTERN.test(text), `${name} holds an email address`).toBe(false);
		}
	});

	it('no reply fixture file holds a literal dash, and the Tavily reply keeps its seven', () => {
		for (const { name } of REPLY_FIXTURES) {
			expect(readReplyText(name).match(DASHES), name).toBeNull();
		}
		for (const { name } of CHAT) {
			expect(JSON.stringify(readReplyFixture(name)).match(DASHES), name).toBeNull();
		}
		const tavily = readReplyFixture('tavily-610242-buyer').response as {
			results: { content: string }[];
		};
		expect(JSON.stringify(tavily).match(DASHES)).toHaveLength(7);
		expect(tavily.results[2].content).toContain(`Berlin TXL ${EN_DASH} Tax consultancy`);
		expect(tavily.results[1].content).toContain(
			`13405 Berlin ${SCRUB_PLACEHOLDER} Execution place`
		);
	});

	it('every chat fixture names nvidia/nemotron-3-super-120b-a12b', () => {
		expect(CHAT).toHaveLength(5);
		for (const { name, model } of CHAT) {
			const { request, response } = readReplyFixture(name);
			expect([model, request.model, response.model], name).toEqual([
				REPLY_MODEL,
				REPLY_MODEL,
				REPLY_MODEL
			]);
		}
	});
});

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readReplyFixture, replyContent } from '../../test/fixtures/replies.ts';
import { ReplyItemSchema } from '../snapshot/readings.ts';
import {
	CHAT_URL,
	ChatCompletionSchema,
	chatBody,
	costUsd,
	MODEL_READ,
	promptSha256,
	readReply,
	repairBody,
	RESPONSE_SCHEMA,
	SYSTEM_PROMPT
} from './token-factory.ts';

const PRICES = MODEL_READ.prices;
const TAB = String.fromCodePoint(9);
const CHAT_FIXTURES = [
	'de-610242-default',
	'de-610242-thinking-off',
	'fr-629755-default-tab',
	'fr-629755-probe',
	'nl-634398-super'
];

describe('the client constants', () => {
	it('names the prompt by the SHA-256 of the system message spike 004 sent', () => {
		const recorded = readReplyFixture('nl-634398-super').request as {
			messages: { content: string }[];
		};
		const system = recorded.messages[0].content;
		expect(`${SYSTEM_PROMPT}\n${JSON.stringify(RESPONSE_SCHEMA)}`).toBe(system);
		expect(promptSha256).toBe(
			createHash('sha256').update(Buffer.from(system, 'utf8')).digest('hex')
		);
		expect(CHAT_URL).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions');
	});

	it('reads every recorded completion and keeps only the fields it uses', () => {
		for (const name of CHAT_FIXTURES) {
			const parsed = ChatCompletionSchema.parse(readReplyFixture(name).response);
			expect(Object.keys(parsed).sort(), name).toEqual(['choices', 'id', 'usage']);
		}
		const response = readReplyFixture('de-610242-thinking-off').response as {
			usage: Record<string, unknown>;
		};
		const fractional = { ...response, usage: { ...response.usage, prompt_tokens: 1183.5 } };
		expect(ChatCompletionSchema.safeParse(fractional).success).toBe(false);
		expect(ChatCompletionSchema.safeParse({ ...response, choices: [] }).success).toBe(false);
	});

	it('refuses an item with a key ModelItem lacks or a criterion below 1', () => {
		const [item] = JSON.parse(replyContent('de-610242-thinking-off')).requirements;
		expect(ReplyItemSchema.safeParse(item).success).toBe(true);
		expect(ReplyItemSchema.safeParse({ ...item, note: 'x' }).success).toBe(false);
		expect(ReplyItemSchema.safeParse({ ...item, criterion: 0 }).success).toBe(false);
		expect(ReplyItemSchema.safeParse({ ...item, criterion: 1.5 }).success).toBe(false);
	});
});

describe('the reply check', () => {
	it('the French reply with a raw TAB parses once each TAB is a space', () => {
		const content = replyContent('fr-629755-default-tab');
		expect(content).toContain(TAB);
		expect(() => JSON.parse(content)).toThrow();
		const reply = readReply(content, 'stop');
		expect(reply.ok).toBe(true);
		expect(reply.ok && reply.items).toHaveLength(11);
	});

	it('reads the German and Dutch replies as sent', () => {
		for (const [name, items] of [
			['de-610242-thinking-off', 14],
			['nl-634398-super', 10]
		] as const) {
			const reply = readReply(replyContent(name), 'stop');
			expect(reply.ok && reply.items, name).toHaveLength(items);
		}
	});

	it('names each issue of a reply by its path', () => {
		const item = {
			criterion: 1,
			kind: 'turnover-average',
			quote: 'a quote long enough',
			reading: 'r',
			numberText: '',
			period: '',
			mandatory: true
		};
		const reply = readReply(JSON.stringify({ requirements: [item] }), 'stop');
		expect(reply.ok).toBe(false);
		expect(!reply.ok && reply.issues).toEqual([expect.stringMatching(/^requirements\.0\.kind: /)]);
		const extra = readReply(
			JSON.stringify({ requirements: [{ ...item, kind: 'other', note: 'x' }] })
		);
		expect(!extra.ok && extra.issues).toEqual([expect.stringMatching(/^requirements\.0: /)]);
	});

	it('refuses a reply that is not JSON, and one cut off at its length limit', () => {
		expect(readReply('Here are the requirements:', 'stop')).toEqual({
			ok: false,
			issues: ['reply: not JSON']
		});
		const whole = replyContent('de-610242-thinking-off');
		const cut = readReply(whole, 'length');
		expect(cut.ok).toBe(false);
		expect(!cut.ok && cut.issues).toEqual([
			'finish_reason: length, the reply stopped at the token limit'
		]);
	});
});

describe('the repair request', () => {
	it('is the first request, the reply and one message naming its issues', () => {
		const criteria = [
			{ code: 'slc-stand-to-gen', descriptions: [{ text: 'Mindestumsatz 1 Mio. EUR', lang: 'de' }] }
		];
		const issues = [
			'requirements.0.kind: Invalid option',
			'requirements.1: Unrecognized key: "note"'
		];
		const body = repairBody(criteria, '{"requirements":[]}', issues);
		const first = chatBody(criteria);
		expect({ ...body, messages: body.messages.slice(0, 2) }).toEqual(first);
		expect(body.messages).toHaveLength(4);
		expect(body.messages[2]).toEqual({ role: 'assistant', content: '{"requirements":[]}' });
		expect(body.messages[3].role).toBe('user');
		for (const issue of issues) expect(body.messages[3].content).toContain(issue);
		expect(body.messages[3].content).toContain('JSON only');
	});
});

describe('the request spike 004 sent', () => {
	it('keeps the system prompt and the schema of spike 004 character for character', () => {
		const recorded = readReplyFixture('de-610242-thinking-off').request as {
			messages: { content: string }[];
			response_format: unknown;
			model: string;
			temperature: number;
			max_tokens: number;
			chat_template_kwargs: unknown;
		};
		const body = chatBody([]);
		expect(body.messages[0].content).toBe(recorded.messages[0].content);
		expect(JSON.stringify(body.response_format)).toBe(JSON.stringify(recorded.response_format));
		expect(body.model).toBe(recorded.model);
		expect(body.temperature).toBe(recorded.temperature);
		expect(body.max_tokens).toBe(recorded.max_tokens);
		expect(body.chat_template_kwargs).toEqual(recorded.chat_template_kwargs);
	});
});

describe('the cost of a run', () => {
	it.each([
		['de-610242-thinking-off', 1183, 1615, 0, '0.001808'],
		['nl-634398-super', 1628, 948, 0, '0.001342'],
		['de-610242-default', 1183, 5521, 4101, '0.005324'],
		['fr-629755-default-tab', 993, 5247, 4078, '0.005020']
	])(
		'prices the %s reply from its usage, reasoning inside completion tokens',
		(name, input, output, reasoning, cost) => {
			const usage = readReplyFixture(name).response.usage as Record<string, unknown>;
			expect(usage).toMatchObject({
				prompt_tokens: input,
				completion_tokens: output,
				completion_tokens_details: { reasoning_tokens: reasoning }
			});
			expect(costUsd({ input, output, reasoning }, PRICES)).toBe(cost);
		}
	);

	it.each([
		[0, 5, '0.000005'],
		[0, 15, '0.000014'],
		[30, 15, '0.000023'],
		[20, 1615, '0.001460'],
		[0, 0, '0.000000'],
		[2_000_000_000, 1_000_000_000, '1500.000000']
	])('prices %i input and %i output tokens at %s, exact and half up', (input, output, cost) => {
		expect(costUsd({ input, output, reasoning: 0 }, PRICES)).toBe(cost);
	});

	it('refuses a price that is not a plain decimal of at most six places', () => {
		for (const price of ['0,30', '.3', '0.1234567', '1e-6', '']) {
			expect(() =>
				costUsd({ input: 1, output: 1, reasoning: 0 }, { ...PRICES, inputUsdPerMillion: price })
			).toThrow(`a price per million tokens must be a decimal of at most six places, not ${price}`);
		}
	});
});

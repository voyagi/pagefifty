// The capture's one client of Nebius Token Factory: the request spike 004 measured (model, prompt,
// schema and settings), the reply's validation and the cost. It never calls fetch: the transport is
// injected and every request goes out through the metered gate, which hands it the key. Imported
// under Node type stripping: erasable syntax only, relative .ts imports.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LangText } from '../ingest/record.ts';
import { MIN_QUOTE_LENGTH, criterionText } from '../core/quote.ts';
import { READING_KINDS, ReplySchema, type ReplyItem } from '../snapshot/readings.ts';
import type { Transport } from '../snapshot/transport.ts';
import type { MeteredGate } from './metered.ts';

// The prices are the account's model list as spike 004 read it on 2026-10-15 (no web page was read
// while this was built); the provider's price page is read again before the final capture.
export const MODEL_READ = Object.freeze({
	id: 'nvidia/nemotron-3-super-120b-a12b',
	provider: 'Nebius Token Factory',
	region: 'us-central1',
	temperature: 0,
	maxTokens: 8000,
	thinking: false,
	prices: Object.freeze({ inputUsdPerMillion: '0.30', outputUsdPerMillion: '0.90' }),
	pricesListedOn: '2026-10-15'
});

export const CHAT_URL = 'https://api.tokenfactory.nebius.com/v1/chat/completions';

// Copied character for character from spike 004 (spike.mjs SYSTEM and requirementSchema(false)): the
// recorded replies are fixtures of this command only while the request is the one they answered.
export const SYSTEM_PROMPT = [
	'You read the selection criteria of one lot of an EU public tender.',
	'Return every requirement a bidder must meet to take part, one item per requirement.',
	'quote: copy the exact words from the criterion text that state the requirement, character for character, in the original language. Never translate, shorten inside, or paraphrase it. At least 12 characters.',
	'reading: one plain English sentence saying what the bidder must show.',
	'kind: the kind of requirement. Use points-to-documents when the text only says the criteria are in the tender documents.',
	'numberText: the exact words holding the threshold number with its unit or currency as written (for example "1.500.000 EUR" or "3 Mitarbeiter"), or "" when there is none.',
	'period: the period as written (for example "in den letzten drei Geschäftsjahren"), or "".',
	'criterion: the number of the criterion block the quote comes from.',
	'mandatory: false only when the text says the item is optional, scored, or only a request for information.',
	'Never invent a requirement or a number. Answer with JSON only, matching this schema:'
].join('\n');

export const RESPONSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['requirements'],
	properties: {
		requirements: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['criterion', 'kind', 'quote', 'reading', 'numberText', 'period', 'mandatory'],
				properties: {
					criterion: { type: 'integer', minimum: 1 },
					kind: { type: 'string', enum: [...READING_KINDS] },
					quote: { type: 'string', minLength: MIN_QUOTE_LENGTH },
					reading: { type: 'string' },
					numberText: { type: 'string' },
					period: { type: 'string' },
					mandatory: { type: 'boolean' }
				}
			}
		}
	}
};

const SYSTEM_MESSAGE = `${SYSTEM_PROMPT}\n${JSON.stringify(RESPONSE_SCHEMA)}`;

const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export const promptSha256 = sha256Hex(SYSTEM_MESSAGE);

interface CriterionInput {
	readonly code: string;
	readonly descriptions: readonly LangText[];
}

export function userMessage(criteria: readonly CriterionInput[]): string {
	return criteria
		.map((criterion, index) => {
			const langs = criterion.descriptions
				.map((description) => description.lang ?? description.rawLang)
				.join(',');
			return `Criterion ${index + 1} (code ${criterion.code}, language ${langs}):\n${criterionText(criterion.descriptions)}`;
		})
		.join('\n\n');
}

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export function chatBody(criteria: readonly CriterionInput[]) {
	return {
		model: MODEL_READ.id,
		temperature: MODEL_READ.temperature,
		max_tokens: MODEL_READ.maxTokens,
		messages: [
			{ role: 'system', content: SYSTEM_MESSAGE },
			{ role: 'user', content: userMessage(criteria) }
		] as ChatMessage[],
		response_format: {
			type: 'json_schema',
			json_schema: { name: 'requirements', schema: RESPONSE_SCHEMA, strict: true }
		},
		chat_template_kwargs: { enable_thinking: MODEL_READ.thinking }
	};
}

type ChatBody = ReturnType<typeof chatBody>;

export type ReplyRead = { ok: true; items: ReplyItem[] } | { ok: false; issues: string[] };

const issuePath = (path: readonly PropertyKey[]) =>
	path.length === 0 ? 'reply' : path.map(String).join('.');

export function readReply(content: string): ReplyRead {
	let json: unknown;
	try {
		json = JSON.parse(content);
	} catch {
		return { ok: false, issues: ['reply: not JSON'] };
	}
	const parsed = ReplySchema.safeParse(json);
	if (parsed.success) return { ok: true, items: parsed.data.requirements };
	return {
		ok: false,
		issues: parsed.error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`)
	};
}

const tokenCount = z.int().nonnegative();

// Not strict: the provider adds fields of its own, and only these are used.
export const ChatCompletionSchema = z.object({
	id: z.string(),
	choices: z
		.array(
			z.object({
				finish_reason: z.string().nullable(),
				message: z.object({ content: z.string().nullable() })
			})
		)
		.min(1),
	usage: z.object({
		prompt_tokens: tokenCount,
		completion_tokens: tokenCount,
		completion_tokens_details: z.object({ reasoning_tokens: tokenCount.nullish() }).nullish()
	})
});

export interface Tokens {
	input: number;
	output: number;
	reasoning: number;
}

export interface ChatReply {
	content: string;
	finishReason: string | null;
	tokens: Tokens;
}

const MICRO = 1_000_000n;

function picodollarsPerToken(usdPerMillion: string): bigint {
	const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdPerMillion);
	if (match === null) {
		throw new Error(
			`a price per million tokens must be a decimal of at most six places, not ${usdPerMillion}`
		);
	}
	return BigInt(match[1]) * MICRO + BigInt((match[2] ?? '').padEnd(6, '0'));
}

// Whole picodollars, so no sum of float prices drifts, and the six-decimal figure is rounded half up
// once at the end. Reasoning tokens are already inside completion_tokens (spike 004 result 5), so
// only input and output are priced.
export function costUsd(
	tokens: Tokens,
	prices: { inputUsdPerMillion: string; outputUsdPerMillion: string }
): string {
	const pico =
		BigInt(tokens.input) * picodollarsPerToken(prices.inputUsdPerMillion) +
		BigInt(tokens.output) * picodollarsPerToken(prices.outputUsdPerMillion);
	const micro = (pico + MICRO / 2n) / MICRO;
	return `${micro / MICRO}.${String(micro % MICRO).padStart(6, '0')}`;
}

function parsedJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// A refusal names only the status or the schema, never the body: a provider's error text can quote
// the request it was sent.
export function sendChat(
	gate: MeteredGate,
	transport: Transport,
	body: ChatBody,
	operation: 'chat' | 'chat-repair'
) {
	return gate.attempt<ChatReply>('tokenFactory', operation, async (key) => {
		const response = await transport(
			new Request(CHAT_URL, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${key}`,
					'content-type': 'application/json',
					accept: 'application/json'
				},
				body: JSON.stringify(body)
			})
		);
		if (!response.ok) throw new Error(`Token Factory answered ${response.status}`);
		const json = parsedJson(await response.text());
		const parsed = ChatCompletionSchema.safeParse(json);
		if (!parsed.success) throw new Error('the Token Factory answer is not a chat completion');
		const { id, choices, usage } = parsed.data;
		return {
			id,
			usage: (json as { usage: unknown }).usage,
			value: {
				content: choices[0].message.content ?? '',
				finishReason: choices[0].finish_reason,
				tokens: {
					input: usage.prompt_tokens,
					output: usage.completion_tokens,
					reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0
				}
			}
		};
	});
}

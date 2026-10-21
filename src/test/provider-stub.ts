// Token Factory's and Tavily's side of the wire for the capture's metered steps. A chat request is
// answered with the recorded reply whose request carried the same user message, and a search with
// the recorded answer whose request carried the same query, so an answer a test sees is one the
// provider gave for that exact request. A test scripts any other answer by call number. Nothing here
// reaches a network: an unmatched request answers 599 naming its address, as ted-stub.ts does.
import type { Transport } from '../lib/snapshot/transport.ts';
import type { RecordedReply } from './fixtures/replies.ts';

// Written out here rather than imported, so a wrong address in the client fails the tests.
const STUB_CHAT_URL = 'https://api.tokenfactory.nebius.com/v1/chat/completions';
const STUB_SEARCH_URL = 'https://api.tavily.com/search';

interface ProviderCall {
	method: string;
	url: string;
	headers: Record<string, string>;
	body: unknown;
}

type ScriptedAnswer = { status: number; json?: unknown; text?: string } | { throws: Error };

interface Usage {
	prompt: number;
	completion: number;
	reasoning?: number;
}

interface ChatMessage {
	role: string;
	content: string;
}

function firstUserMessage(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) return undefined;
	const { messages } = body as { messages?: unknown };
	if (!Array.isArray(messages)) return undefined;
	return (messages as ChatMessage[]).find((message) => message.role === 'user')?.content;
}

function searchQueryOf(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) return undefined;
	const { query } = body as { query?: unknown };
	return typeof query === 'string' ? query : undefined;
}

function parsedBody(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

// A chat completion in the shape Token Factory answers with, for a reply no recording holds.
export function chatResponse(
	id: string,
	content: string | null,
	usage: Usage = { prompt: 10, completion: 20 },
	finishReason = 'stop'
): Record<string, unknown> {
	return {
		id,
		object: 'chat.completion',
		choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', content } }],
		usage: {
			prompt_tokens: usage.prompt,
			completion_tokens: usage.completion,
			total_tokens: usage.prompt + usage.completion,
			completion_tokens_details: { reasoning_tokens: usage.reasoning ?? 0 }
		}
	};
}

// A reply to a request no recording holds, carrying the given requirements as its JSON content.
export function syntheticReply(
	request: Record<string, unknown>,
	requirements: readonly unknown[],
	id = 'chatcmpl-synthetic'
): RecordedReply {
	return { request, response: chatResponse(id, JSON.stringify({ requirements })) };
}

interface StubResult {
	url: string;
	title: string;
	score: number;
}

// A Tavily answer to a query no recording holds, in the shape the recorded one has: each result with
// a content snippet the capture must not keep.
export function searchAnswer(
	query: string,
	results: readonly StubResult[],
	credits: number | null = 1
): RecordedReply {
	return {
		request: { query },
		response: {
			query,
			answer: null,
			results: results.map((result) => ({ ...result, content: 'a snippet', raw_content: null })),
			...(credits !== null && { usage: { credits } }),
			request_id: `stub-${query.length}`
		}
	};
}

function unanswered(method: string, url: string, detail = ''): Response {
	return new Response(`provider stub: nothing answers ${method} ${url}${detail}`, {
		status: 599,
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}

function scripted(answer: ScriptedAnswer): Response {
	if ('throws' in answer) throw answer.throws;
	if (answer.json !== undefined) return Response.json(answer.json, { status: answer.status });
	return new Response(answer.text ?? '', { status: answer.status });
}

function recordedSearch(
	bySearch: ReadonlyMap<string, RecordedReply>,
	call: ProviderCall
): Response {
	const query = searchQueryOf(call.body);
	const search = query === undefined ? undefined : bySearch.get(query);
	if (search === undefined) {
		return unanswered(call.method, call.url, ' (no recorded answer for this query)');
	}
	return Response.json(search.response);
}

export function createStubProvider(options: {
	replies: readonly RecordedReply[];
	// Tavily answers, each matched by the query its request carried.
	searches?: readonly RecordedReply[];
	// Answers by call number, counted from 1 over every request this stub receives.
	script?: Readonly<Record<number, ScriptedAnswer>>;
}) {
	const byMessage = new Map<string, RecordedReply>();
	for (const reply of options.replies) {
		const message = firstUserMessage(reply.request);
		if (message === undefined)
			throw new Error('provider stub: a reply whose request has no user message');
		byMessage.set(message, reply);
	}
	const bySearch = new Map<string, RecordedReply>();
	for (const search of options.searches ?? []) {
		const query = searchQueryOf(search.request);
		if (query === undefined) throw new Error('provider stub: a search whose request has no query');
		bySearch.set(query, search);
	}
	const log: ProviderCall[] = [];

	const transport: Transport = async (request) => {
		const call: ProviderCall = {
			method: request.method,
			url: request.url,
			headers: Object.fromEntries(request.headers),
			body: parsedBody(await request.text())
		};
		log.push(call);
		const answer = options.script?.[log.length];
		if (answer !== undefined) return scripted(answer);
		if (call.method === 'POST' && call.url === STUB_SEARCH_URL)
			return recordedSearch(bySearch, call);
		if (call.method !== 'POST' || call.url !== STUB_CHAT_URL)
			return unanswered(call.method, call.url);
		const message = firstUserMessage(call.body);
		const reply = message === undefined ? undefined : byMessage.get(message);
		if (reply === undefined) {
			return unanswered(call.method, call.url, ' (no recorded reply for this user message)');
		}
		return Response.json(reply.response);
	};

	return Object.assign(transport, {
		calls: () => log.map((entry) => ({ ...entry, headers: { ...entry.headers } }))
	});
}

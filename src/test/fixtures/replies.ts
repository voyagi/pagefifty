// The six replies spike 004 recorded on 2026-10-15, kept as fixtures: five chat completions from
// Nebius Token Factory and one Tavily search. Each file holds only the request body as sent and
// the response body as received. The Tavily reply had one email address of a tender mailbox,
// replaced with [removed] as the capture scrub does, and its dashes are written as JSON escapes.
// Every chat request carried public clause text from examples/2026-09-15 and nothing else.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readNotice } from '../../lib/ingest/read-notice';
import { criterionText } from '../../lib/core/quote';
import { capturePath } from './node';

export const REPLY_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

interface ReplyFixture {
	name: string;
	file: string;
	notice: string;
	lot: string;
	provider: 'tokenFactory' | 'tavily';
	model: typeof REPLY_MODEL | null;
	thinking: 'default' | 'off' | null;
	run: 1 | 2;
}

const fixture = (
	name: string,
	notice: string,
	lot: string,
	provider: ReplyFixture['provider'],
	thinking: ReplyFixture['thinking'],
	run: ReplyFixture['run']
): ReplyFixture => ({
	name,
	file: `${name}.json`,
	notice,
	lot,
	provider,
	model: provider === 'tokenFactory' ? REPLY_MODEL : null,
	thinking,
	run
});

export const REPLY_FIXTURES: readonly ReplyFixture[] = [
	fixture('de-610242-default', '610242-2026', 'LOT-0000', 'tokenFactory', 'default', 1),
	fixture('de-610242-thinking-off', '610242-2026', 'LOT-0000', 'tokenFactory', 'off', 1),
	fixture('fr-629755-default-tab', '629755-2026', 'LOT-0001', 'tokenFactory', 'default', 1),
	fixture('fr-629755-probe', '629755-2026', 'LOT-0001', 'tokenFactory', 'default', 1),
	fixture('nl-634398-super', '634398-2026', 'LOT-0001', 'tokenFactory', 'off', 2),
	fixture('tavily-610242-buyer', '610242-2026', 'LOT-0000', 'tavily', null, 1)
];

export const REPLIES_DIR = join('src', 'test', 'fixtures', 'replies');

export interface RecordedReply {
	request: Record<string, unknown>;
	response: Record<string, unknown>;
}

function manifestEntry(name: string): ReplyFixture {
	const entry = REPLY_FIXTURES.find((each) => each.name === name);
	if (!entry) throw new Error(`no reply fixture named ${name}`);
	return entry;
}

export function readReplyText(name: string): string {
	return readFileSync(join(REPLIES_DIR, manifestEntry(name).file), 'utf8');
}

export function readReplyFixture(name: string): RecordedReply {
	return JSON.parse(readReplyText(name)) as RecordedReply;
}

interface ChatResponse {
	choices: { message: { content: string } }[];
}

export function replyContent(name: string): string {
	const response = readReplyFixture(name).response as unknown as ChatResponse;
	return response.choices[0].message.content;
}

export interface ReplyRequirement {
	criterion: number;
	kind: string;
	quote: string;
	reading: string;
	numberText: string;
	period: string;
	mandatory: boolean;
}

// The capture swaps each raw TAB for a space before parsing (SPEC R1): the French default reply
// copied a TAB from the source into a JSON string, which JSON.parse refuses.
export function replyRequirements(name: string): ReplyRequirement[] {
	const content = replyContent(name).replaceAll('\t', ' ');
	return (JSON.parse(content) as { requirements: ReplyRequirement[] }).requirements;
}

// The clause texts of the fixture's own lot, each built as the spike built the text it sent.
export function lotClauseTexts(name: string): string[] {
	const { notice, lot } = manifestEntry(name);
	const result = readNotice(new Uint8Array(readFileSync(capturePath(notice))), {
		noticeNumber: notice
	});
	if (!result.ok) throw new Error(`${notice} did not read: ${result.kind}, ${result.detail}`);
	const found = result.record.lots.find((each) => each.id === lot);
	if (!found) throw new Error(`${notice} has no ${lot}`);
	return found.criteria.map((criterion) => criterionText(criterion.descriptions));
}

// The capture's model step: each lot's in-notice criteria text goes to the model through the metered
// gate, every reply is validated, and the run publishes what was read (readings.json) with the
// tokens and cost (run.json's reading block). Imported under Node type stripping: erasable syntax
// only, relative .ts imports.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { criterionText, verifyRequirements } from '../core/quote.ts';
import type { NoticeRecord } from '../ingest/record.ts';
import { NOTICE_NUMBER } from '../snapshot/index-row.ts';
import {
	NOT_READ_REASONS,
	ReadingEntrySchema,
	type LotEntry,
	type ReadingEntry,
	type ReadingRun,
	type ReadingsFile
} from '../snapshot/readings.ts';
import type { Transport } from '../snapshot/transport.ts';
import { captureDate, writeJsonFile } from './capture-folder.ts';
import { publicationOrder, type MeteredStep, type StepOutput } from './run.ts';
import type { Clock } from './ted-client.ts';
import {
	MODEL_READ,
	chatBody,
	costUsd,
	promptSha256,
	readReply,
	repairBody,
	sendChat,
	userMessage,
	type Tokens
} from './token-factory.ts';

// The text is hashed exactly as sent, with no normalisation: two texts that differ by one space are
// two readings, never one reading stretched over a text the model did not see.
export function readingKey(notice: string, text: string) {
	return { notice, textSha256: createHash('sha256').update(text, 'utf8').digest('hex') };
}

// One file per reading under .capture-cache/readings/<notice>/<sha256>.json, kept across runs so each
// text is read at most once (SPEC R2).
function storePath(root: string, notice: string, textSha256: string): string {
	// The number becomes a folder name, so only TED's shape gets that far.
	if (!NOTICE_NUMBER.test(notice)) {
		throw new Error(`reading store: ${JSON.stringify(notice)} is not a TED notice number`);
	}
	return join(root, '.capture-cache', 'readings', notice, `${textSha256}.json`);
}

// A reading written under another model or prompt answered another question, so it is read again.
function storedReading(root: string, notice: string, textSha256: string): ReadingEntry | undefined {
	const path = storePath(root, notice, textSha256);
	if (!existsSync(path)) return undefined;
	let json: unknown;
	try {
		json = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return undefined;
	}
	const parsed = ReadingEntrySchema.safeParse(json);
	if (!parsed.success) return undefined;
	const entry = parsed.data;
	const same =
		entry.notice === notice &&
		entry.textSha256 === textSha256 &&
		entry.model === MODEL_READ.id &&
		entry.promptSha256 === promptSha256;
	return same ? entry : undefined;
}

// Written under a temp name and renamed into place, so a run that dies mid-write leaves no file a
// later run could take for a whole reading.
function storeReading(root: string, entry: ReadingEntry): void {
	const path = storePath(root, entry.notice, entry.textSha256);
	mkdirSync(join(path, '..'), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	writeJsonFile(temp, entry);
	renameSync(temp, path);
}

interface Reading {
	entry: ReadingEntry;
	// The clause texts the user message carried, for the quote count.
	sources: readonly string[];
	reused: boolean;
}

interface ReadOutcome {
	runDate: string;
	sends: number;
	tokens: Tokens;
	notices: { notice: string; lots: LotEntry[] }[];
	readings: readonly Reading[];
}

const addTokens = (a: Tokens, b: Tokens): Tokens => ({
	input: a.input + b.input,
	output: a.output + b.output,
	reasoning: a.reasoning + b.reasoning
});

const NO_TOKENS: Tokens = { input: 0, output: 0, reasoning: 0 };

export function readingsFileOf(outcome: ReadOutcome): { file: ReadingsFile; run: ReadingRun } {
	const lots = outcome.notices.flatMap(({ notice, lots: entries }) =>
		entries.map((entry) => ({ notice, entry }))
	);
	const reusedTexts = new Set(
		outcome.readings
			.filter((reading) => reading.reused)
			.map(({ entry }) => `${entry.notice} ${entry.textSha256}`)
	);
	const readLots = lots.filter(({ entry }) => entry.status === 'read');
	const reused = readLots.filter(
		({ notice, entry }) =>
			entry.status === 'read' && reusedTexts.has(`${notice} ${entry.textSha256}`)
	).length;
	let verified = 0;
	let rejected = 0;
	for (const { entry, sources } of outcome.readings) {
		for (const check of verifyRequirements(sources, entry.items)) {
			if (check.status === 'verified') verified += 1;
			else rejected += 1;
		}
	}
	const run: ReadingRun = {
		model: MODEL_READ.id,
		provider: MODEL_READ.provider,
		region: MODEL_READ.region,
		thinking: MODEL_READ.thinking,
		runDate: outcome.runDate,
		prices: {
			inputUsdPerMillion: MODEL_READ.prices.inputUsdPerMillion,
			outputUsdPerMillion: MODEL_READ.prices.outputUsdPerMillion,
			listedOn: MODEL_READ.pricesListedOn
		},
		lots: {
			withCriteria: lots.filter(({ entry }) => entry.status !== 'no-criteria').length,
			read: readLots.length - reused,
			reused,
			notRead: lots.filter(({ entry }) => entry.status === 'not-read').length
		},
		sends: outcome.sends,
		tokens: { ...outcome.tokens },
		costUsd: costUsd(outcome.tokens, MODEL_READ.prices),
		quotes: { verified, rejected }
	};
	return {
		run,
		file: {
			schemaVersion: 1,
			run,
			notices: outcome.notices,
			readings: outcome.readings.map(({ entry }) => entry)
		}
	};
}

interface StepOptions {
	transport: Transport;
	root: string;
	clock: Pick<Clock, 'now'>;
	log: (line: string) => void;
}

type TextOutcome =
	| { status: 'read'; textSha256: string }
	| { status: 'not-read'; reason: (typeof NOT_READ_REASONS)[number] };

type Answer = Awaited<ReturnType<typeof sendChat>> | { kind: 'failed' };

const NOT_SENT = { 'dry-run': 'dry-run', refused: 'cap-reached', failed: 'send-failed' } as const;

// One run's sending state. After the gate's first refusal nothing more is attempted: every later
// text reads cap-reached, so a repair can never pass the cap and leave its lot half read.
interface Session {
	gate: Parameters<MeteredStep>[0]['gate'];
	transport: Transport;
	root: string;
	runDate: string;
	tokens: Tokens;
	stopped: boolean;
	readings: Reading[];
}

// The gate the step is handed has already replaced a thrown send's text with a fixed reason, so
// a failed send ends only its own lot and nothing the provider said is kept.
async function attemptChat(
	session: Session,
	body: ReturnType<typeof chatBody>,
	operation: 'chat' | 'chat-repair'
): Promise<Answer> {
	try {
		return await sendChat(session.gate, session.transport, body, operation);
	} catch {
		return { kind: 'failed' };
	}
}

function notSent(session: Session, kind: keyof typeof NOT_SENT): TextOutcome {
	if (kind === 'refused') session.stopped = true;
	return { status: 'not-read', reason: NOT_SENT[kind] };
}

type Criteria = NoticeRecord['lots'][number]['criteria'];

const sourcesOf = (criteria: Criteria) =>
	criteria.map((criterion) => criterionText(criterion.descriptions));

// Reuse needs no attempt, so a stored reading is taken even after the cap is reached or in a dry run.
function reuse(session: Session, notice: string, criteria: Criteria, textSha256: string) {
	const entry = storedReading(session.root, notice, textSha256);
	if (entry === undefined) return undefined;
	session.readings.push({ entry, sources: sourcesOf(criteria), reused: true });
	return { status: 'read', textSha256 } as const;
}

async function readText(
	session: Session,
	notice: string,
	criteria: Criteria,
	textSha256: string
): Promise<TextOutcome> {
	if (session.stopped) return { status: 'not-read', reason: 'cap-reached' };
	let answer = await attemptChat(session, chatBody(criteria), 'chat');
	if (answer.kind !== 'sent') return notSent(session, answer.kind);
	session.tokens = addTokens(session.tokens, answer.value.tokens);
	let usage = answer.value.tokens;
	let reply = readReply(answer.value.content, answer.value.finishReason);
	if (!reply.ok) {
		const repair = repairBody(criteria, answer.value.content, reply.issues);
		answer = await attemptChat(session, repair, 'chat-repair');
		if (answer.kind !== 'sent') return notSent(session, answer.kind);
		session.tokens = addTokens(session.tokens, answer.value.tokens);
		usage = addTokens(usage, answer.value.tokens);
		reply = readReply(answer.value.content, answer.value.finishReason);
		if (!reply.ok) return { status: 'not-read', reason: 'reply-invalid' };
	}
	const entry: ReadingEntry = {
		notice,
		textSha256,
		promptSha256,
		model: MODEL_READ.id,
		readOn: session.runDate,
		responseId: answer.id,
		usage,
		items: reply.items
	};
	storeReading(session.root, entry);
	session.readings.push({ entry, sources: sourcesOf(criteria), reused: false });
	return { status: 'read', textSha256 };
}

const byLotId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Lots sharing one text within a notice share one read; the key holds the notice, so the same text
// in another notice is read again (SPEC R2).
async function readLots(session: Session, record: NoticeRecord): Promise<LotEntry[]> {
	const byText = new Map<string, TextOutcome>();
	const lots: LotEntry[] = [];
	for (const lot of [...record.lots].sort(byLotId)) {
		if (lot.criteria.length === 0) {
			lots.push({ lot: lot.id, status: 'no-criteria' });
			continue;
		}
		const { textSha256 } = readingKey(record.noticeNumber, userMessage(lot.criteria));
		let outcome = byText.get(textSha256);
		if (outcome === undefined) {
			const { noticeNumber } = record;
			outcome =
				reuse(session, noticeNumber, lot.criteria, textSha256) ??
				(await readText(session, noticeNumber, lot.criteria, textSha256));
			byText.set(textSha256, outcome);
		}
		lots.push({ lot: lot.id, ...outcome });
	}
	return lots;
}

function summaryLine(run: ReadingRun, notices: ReadOutcome['notices']): string {
	const reasons = notices.flatMap(({ lots }) =>
		lots.flatMap((lot) => (lot.status === 'not-read' ? [lot.reason] : []))
	);
	const counted = NOT_READ_REASONS.map(
		(reason) => [reason, reasons.filter((each) => each === reason).length] as const
	)
		.filter(([, count]) => count > 0)
		.map(([reason, count]) => `${reason} ${count}`);
	const why = counted.length > 0 ? ` (${counted.join(', ')})` : '';
	return `capture: model read: ${run.lots.read} read, ${run.lots.reused} reused, ${run.lots.notRead} not read${why}, ${run.sends} sent, USD ${run.costUsd}`;
}

export function createModelReadStep({ transport, root, clock, log }: StepOptions): MeteredStep {
	return async ({ gate, records }): Promise<StepOutput> => {
		const session: Session = {
			gate,
			transport,
			root,
			runDate: captureDate(clock.now()),
			tokens: NO_TOKENS,
			stopped: false,
			readings: []
		};
		const notices: ReadOutcome['notices'] = [];
		// One at a time, in an order fixed by the notices alone, so a capped run reads the same set again.
		const ordered = [...records].sort((a, b) => publicationOrder(a.noticeNumber, b.noticeNumber));
		for (const record of ordered) {
			notices.push({ notice: record.noticeNumber, lots: await readLots(session, record) });
		}
		const { file, run } = readingsFileOf({
			runDate: session.runDate,
			sends: gate.record().perProvider.tokenFactory,
			tokens: session.tokens,
			notices,
			readings: session.readings
		});
		log(summaryLine(run, notices));
		return {
			file: file.readings.length > 0 ? 'readings.json' : null,
			value: file,
			recordKey: 'reading',
			record: run
		};
	};
}

// The capture's model step: each lot's in-notice criteria text goes to the model through the metered
// gate, every reply is validated, and the run publishes what was read (readings.json) with the
// tokens and cost (run.json's reading block). Imported under Node type stripping: erasable syntax
// only, relative .ts imports.
import { createHash } from 'node:crypto';
import { criterionText, verifyRequirements } from '../core/quote.ts';
import type { LotEntry, ReadingEntry, ReadingRun, ReadingsFile } from '../snapshot/readings.ts';
import type { Transport } from '../snapshot/transport.ts';
import { captureDate } from './capture-folder.ts';
import type { MeteredStep, StepOutput } from './run.ts';
import type { Clock } from './ted-client.ts';
import {
	MODEL_READ,
	chatBody,
	costUsd,
	promptSha256,
	readReply,
	sendChat,
	userMessage,
	type Tokens
} from './token-factory.ts';

export function readingKey(notice: string, text: string) {
	return { notice, textSha256: createHash('sha256').update(text, 'utf8').digest('hex') };
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

export function createModelReadStep({ transport, clock, log }: StepOptions): MeteredStep {
	return async ({ gate, records }): Promise<StepOutput> => {
		const runDate = captureDate(clock.now());
		let tokens = NO_TOKENS;
		const readings: Reading[] = [];
		const notices: ReadOutcome['notices'] = [];
		for (const record of records) {
			const lots: LotEntry[] = [];
			for (const lot of record.lots) {
				if (lot.criteria.length === 0) {
					lots.push({ lot: lot.id, status: 'no-criteria' });
					continue;
				}
				const { textSha256 } = readingKey(record.noticeNumber, userMessage(lot.criteria));
				const answer = await sendChat(gate, transport, chatBody(lot.criteria), 'chat');
				if (answer.kind !== 'sent') {
					const reason = answer.kind === 'dry-run' ? 'dry-run' : 'cap-reached';
					lots.push({ lot: lot.id, status: 'not-read', reason });
					continue;
				}
				tokens = addTokens(tokens, answer.value.tokens);
				const reply = readReply(answer.value.content);
				if (!reply.ok) {
					lots.push({ lot: lot.id, status: 'not-read', reason: 'reply-invalid' });
					continue;
				}
				readings.push({
					entry: {
						notice: record.noticeNumber,
						textSha256,
						promptSha256,
						model: MODEL_READ.id,
						readOn: runDate,
						responseId: answer.id,
						usage: answer.value.tokens,
						items: reply.items
					},
					sources: lot.criteria.map((criterion) => criterionText(criterion.descriptions)),
					reused: false
				});
				lots.push({ lot: lot.id, status: 'read', textSha256 });
			}
			notices.push({ notice: record.noticeNumber, lots });
		}
		const sends = gate.record().perProvider.tokenFactory;
		const { file, run } = readingsFileOf({ runDate, sends, tokens, notices, readings });
		log(
			`capture: model read: ${run.lots.read} read, ${run.lots.reused} reused, ${run.lots.notRead} not read, ${sends} sent, USD ${run.costUsd}`
		);
		return {
			file: file.readings.length > 0 ? 'readings.json' : null,
			value: file,
			recordKey: 'reading',
			record: run
		};
	};
}

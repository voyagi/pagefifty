// run.json: what one capture run asked, what TED answered and what the folder holds (D-25). The
// key order is fixed by construction, so two runs under the same clock write the same bytes.
// Imported under Node type stripping: erasable syntax only.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Modes } from '../server/transport-mode.ts';
import type { ReadingRun } from '../snapshot/readings.ts';
import type { SearchRun } from '../snapshot/search-run.ts';
import { errorCode, writeJsonFile } from './capture-folder.ts';
import type { MeteredRecord } from './metered.ts';

// 2 adds the reading block, 3 the openAfter instant, 4 the search block.
const RUN_RECORD_VERSION = 4;

interface NoticeReason {
	notice: string;
	reason: string;
}

export type RunOutcome = 'written' | 'failed' | 'refused';

interface RunRecordParts {
	startedAt: string;
	finishedAt: string;
	captureDate: string;
	outcome: RunOutcome;
	reason: string | null;
	command: string;
	head: string;
	modes: Modes;
	// The --open-after instant, or null for a run that kept notices whatever their deadlines.
	openAfter: string | null;
	query: {
		query: string;
		fields: readonly string[];
		scope: string;
		onlyLatestVersions: boolean;
		since: string;
	};
	ted: {
		searchPages: number;
		xmlRequests: number;
		cacheHits: number;
		status429: number;
		waited429Ms: number;
		retries502: number;
		failures: number;
	};
	notices: {
		listed: number;
		written: number;
		leftOut: readonly NoticeReason[];
		failed: readonly NoticeReason[];
		sameProcedure: readonly (readonly string[])[];
	};
	metered: MeteredRecord;
	// The model step's block; absent or null when no model step ran.
	reading?: ReadingRun | null;
	// The buyer search's block; absent or null when no search step ran.
	search?: SearchRun | null;
}

function searchBlock(search: SearchRun | null | undefined) {
	if (search === null || search === undefined) return null;
	return { searches: search.searches, notSearched: search.notSearched, credits: search.credits };
}

function readingBlock(reading: ReadingRun | null | undefined) {
	if (reading === null || reading === undefined) return null;
	const { prices, lots, tokens, quotes } = reading;
	return {
		model: reading.model,
		provider: reading.provider,
		region: reading.region,
		thinking: reading.thinking,
		runDate: reading.runDate,
		prices: {
			inputUsdPerMillion: prices.inputUsdPerMillion,
			outputUsdPerMillion: prices.outputUsdPerMillion,
			listedOn: prices.listedOn
		},
		lots: {
			withCriteria: lots.withCriteria,
			read: lots.read,
			reused: lots.reused,
			notRead: lots.notRead
		},
		sends: reading.sends,
		tokens: { input: tokens.input, output: tokens.output, reasoning: tokens.reasoning },
		costUsd: reading.costUsd,
		quotes: { verified: quotes.verified, rejected: quotes.rejected }
	};
}

// Every key is written out rather than spread, so a part built in another order still lands in
// this order.
export function buildRunRecord(parts: RunRecordParts) {
	const { modes, query, ted, notices, metered } = parts;
	return {
		schemaVersion: RUN_RECORD_VERSION,
		startedAt: parts.startedAt,
		finishedAt: parts.finishedAt,
		captureDate: parts.captureDate,
		outcome: parts.outcome,
		reason: parts.reason,
		command: parts.command,
		head: parts.head,
		modes: { ted: modes.ted, tokenFactory: modes.tokenFactory, tavily: modes.tavily },
		openAfter: parts.openAfter,
		query: {
			query: query.query,
			fields: [...query.fields],
			scope: query.scope,
			onlyLatestVersions: query.onlyLatestVersions,
			since: query.since
		},
		ted: {
			searchPages: ted.searchPages,
			xmlRequests: ted.xmlRequests,
			cacheHits: ted.cacheHits,
			status429: ted.status429,
			waited429Ms: ted.waited429Ms,
			retries502: ted.retries502,
			failures: ted.failures
		},
		notices: {
			listed: notices.listed,
			written: notices.written,
			leftOut: notices.leftOut.map(({ notice, reason }) => ({ notice, reason })),
			failed: notices.failed.map(({ notice, reason }) => ({ notice, reason })),
			sameProcedure: notices.sameProcedure.map((group) => [...group])
		},
		metered: {
			cap: metered.cap,
			attempts: metered.attempts,
			perProvider: {
				tokenFactory: metered.perProvider.tokenFactory,
				tavily: metered.perProvider.tavily
			},
			refusals: metered.refusals.map(({ provider, operation, reason }) => ({
				provider,
				operation,
				reason
			})),
			// usage goes in as the provider sent it, whatever its keys and number forms.
			responses: metered.responses.map(({ provider, operation, id, usage }) => ({
				provider,
				operation,
				id,
				usage
			}))
		},
		reading: readingBlock(parts.reading),
		search: searchBlock(parts.search)
	};
}

export type RunRecord = ReturnType<typeof buildRunRecord>;

// NTFS reads a colon in a file name as the start of an alternate data stream, so the ISO instant
// keeps only its digits, T and Z: 2026-10-11T08:00:00.000Z becomes 20261011T080000000Z.
export function runRecordName(epochMs: number, pid: number, copy = 1): string {
	const stamp = new Date(epochMs).toISOString().replace(/[-:.]/g, '');
	return `${stamp}-${pid}${copy > 1 ? `-${copy}` : ''}.json`;
}

// Two runs can start at one clock instant in one process (the tests do), so a name already taken
// gets the next free suffix rather than overwriting the record it would collide with.
export function writeRunRecord(dir: string, epochMs: number, pid: number, record: RunRecord): void {
	mkdirSync(dir, { recursive: true });
	for (let copy = 1; ; copy += 1) {
		try {
			writeJsonFile(join(dir, runRecordName(epochMs, pid, copy)), record, 'wx');
			return;
		} catch (error) {
			if (errorCode(error) !== 'EEXIST') throw error;
		}
	}
}

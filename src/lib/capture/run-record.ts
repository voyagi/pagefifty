// run.json: what one capture run asked, what TED answered and what the folder holds (D-25). The
// key order is fixed by construction, so two runs under the same clock write the same bytes.
// Imported under Node type stripping: erasable syntax only.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Modes } from '../server/transport-mode.ts';
import { errorCode, writeJsonFile } from './capture-folder.ts';
import type { MeteredRecord } from './metered.ts';

const RUN_RECORD_VERSION = 1;

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
		}
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

// run.json: what one capture run asked, what TED answered and what the folder holds (D-25). The
// key order is fixed by construction, so two runs under the same clock write the same bytes.
// Imported under Node type stripping: erasable syntax only.

const RUN_RECORD_VERSION = 1;

interface NoticeReason {
	notice: string;
	reason: string;
}

interface RunRecordParts {
	startedAt: string;
	finishedAt: string;
	captureDate: string;
	command: string;
	head: string;
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
}

// Every key is written out rather than spread, so a part built in another order still lands in
// this order.
export function buildRunRecord(parts: RunRecordParts) {
	const { query, ted, notices } = parts;
	return {
		schemaVersion: RUN_RECORD_VERSION,
		startedAt: parts.startedAt,
		finishedAt: parts.finishedAt,
		captureDate: parts.captureDate,
		command: parts.command,
		head: parts.head,
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
		}
	};
}

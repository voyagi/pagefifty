// The capture's buyer search: one Tavily basic search per notice with criteria in the notice, for
// the buyer's earlier awards, through the metered gate and the cap the model read shares. The run
// publishes what came back (searches.json) and how many searches and credits it took (run.json's
// search block). The results are web pages nobody checked, and nothing decides a verdict from them.
// Imported under Node type stripping: erasable syntax only, relative .ts imports.
import type { NoticeRecord } from '../ingest/record.ts';
import type { SearchRun } from '../snapshot/search-run.ts';
import {
	NOT_SEARCHED_REASONS,
	type NoticeSearch,
	type SearchesFile
} from '../snapshot/searches.ts';
import type { Transport } from '../snapshot/transport.ts';
import { publicationOrder, type MeteredStep, type StepOutput } from './run.ts';
import { readResults, searchBody, searchQuery, sendSearch } from './tavily.ts';

interface SearchOutcome {
	// Searches the gate let through, answered or not: each sent the buyer's name to Tavily.
	searches: number;
	// The credits Tavily reported, or null once a sent search reported none, a failed one included.
	credits: number | null;
	notices: readonly NoticeSearch[];
}

export function searchesFileOf(outcome: SearchOutcome): { file: SearchesFile; run: SearchRun } {
	const run: SearchRun = {
		searches: outcome.searches,
		notSearched: outcome.notices.filter((notice) => notice.status === 'not-searched').length,
		credits: outcome.credits
	};
	return { run, file: { schemaVersion: 1, run, notices: [...outcome.notices] } };
}

// The notice's own buyer is the one searched, so a notice with no buyer has nothing to search for.
const searchable = (record: NoticeRecord) =>
	record.buyers.length > 0 && record.lots.some((lot) => lot.criteria.length > 0);

type NotSearched = (typeof NOT_SEARCHED_REASONS)[number];

const notSearched = (notice: string, reason: NotSearched): NoticeSearch => ({
	notice,
	status: 'not-searched',
	reason
});

const addCredits = (total: number | null, credits: number | null) =>
	total === null || credits === null ? null : total + credits;

// One run's searching state. The first dry-run answer or refusal ends the asking: every later notice
// takes the same reason without another attempt, so the gate logs one WOULD line or one refusal,
// and no search is ever sent past the cap.
interface Session {
	gate: Parameters<MeteredStep>[0]['gate'];
	transport: Transport;
	credits: number | null;
	stopped?: 'dry-run' | 'cap-reached';
}

// The gate the step is handed has already replaced a thrown send's text with a fixed reason, so a
// failed search ends only its own notice and nothing the provider said is kept. A search is never
// retried. The gate counted a failed search as sent before it failed, and it reported no credits,
// so the run's credit total is unknown from then on.
async function searchOne(session: Session, record: NoticeRecord): Promise<NoticeSearch> {
	const notice = record.noticeNumber;
	if (session.stopped !== undefined) return notSearched(notice, session.stopped);
	let answer: Awaited<ReturnType<typeof sendSearch>>;
	try {
		answer = await sendSearch(session.gate, session.transport, searchBody(record));
	} catch {
		session.credits = null;
		return notSearched(notice, 'send-failed');
	}
	if (answer.kind !== 'sent') {
		session.stopped = answer.kind === 'dry-run' ? 'dry-run' : 'cap-reached';
		return notSearched(notice, session.stopped);
	}
	session.credits = addCredits(session.credits, answer.value.credits);
	return {
		notice,
		status: 'searched',
		query: searchQuery(record),
		results: readResults(answer.value.results)
	};
}

function summaryLine(run: SearchRun, notices: readonly NoticeSearch[]): string {
	const counts = NOT_SEARCHED_REASONS.flatMap((reason) => {
		const count = notices.filter(
			(notice) => notice.status === 'not-searched' && notice.reason === reason
		).length;
		return count === 0 ? [] : [`${reason} ${count}`];
	});
	const why = counts.length === 0 ? '' : ` (${counts.join(', ')})`;
	const searched = notices.length - run.notSearched;
	return `capture: buyer search: ${searched} searched, ${run.notSearched} not searched${why}, ${run.searches} sent, credits ${run.credits ?? 'not reported'}`;
}

export function createBuyerSearchStep({
	transport,
	log
}: {
	transport: Transport;
	log: (line: string) => void;
}): MeteredStep {
	return async ({ gate, records }): Promise<StepOutput> => {
		const session: Session = { gate, transport, credits: 0 };
		const notices: NoticeSearch[] = [];
		// One at a time, in an order fixed by the notices alone, so a capped run searches the same set again.
		const ordered = records
			.filter(searchable)
			.sort((a, b) => publicationOrder(a.noticeNumber, b.noticeNumber));
		for (const record of ordered) notices.push(await searchOne(session, record));
		const { file, run } = searchesFileOf({
			searches: gate.record().perProvider.tavily,
			credits: session.credits,
			notices
		});
		log(summaryLine(run, notices));
		return {
			file: run.searches > 0 ? 'searches.json' : null,
			value: file,
			recordKey: 'search',
			record: run
		};
	};
}

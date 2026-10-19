// The tender page model /tenders/[notice] and /example/[notice] share. Pure: the record and "now"
// come in as arguments, so the deadline, the time left and the open test all read the one instant
// the loader was given (D-06). Nothing here translates or judges a clause (D-13): the model's
// readings come in with the capture, and only what code verified against a clause is shown under it.
import {
	safeLink,
	type CriterionParameter,
	type DocumentsLink,
	type LangText,
	type LegislationReference,
	type LotRecord,
	type NoticeRecord,
	type SafeLink
} from '../ingest/record';
import { parameterLabel } from '../codelists/labels';
import type { LotContext } from '../core/compare';
import { summarizeLot } from '../core/coverage-facts';
import {
	displayedDeadline,
	isOpen,
	noticeDeadline,
	timeLeft,
	type DisplayedDeadline,
	type NoticeDeadline
} from '../core/deadline';
import {
	lotStatusOf,
	type CriterionReading,
	type LotReading,
	type LotStatus,
	type RejectedItem
} from '../core/lot-reading';
import { coverageLines, readingStatus, type CoverageLine } from '../core/reading';
import { toIndexRow } from '../snapshot/index-row';
import type { LotEntry, NoticeReadings, ReadingRun } from '../snapshot/readings';
import type { NoticeSearch } from '../snapshot/searches';
import { countryName, formatValue, type CaptureFacts } from './list';

export interface WorkKind {
	label: 'IT services' | 'Software packages';
	code: string;
	main?: string;
}

export interface QuoteText extends LangText {
	language: string;
}

// A weight or threshold published beside a criterion: named by its EU code list, or shown by its
// list and code as published when the list has no name for it. The number stays as published.
type ParameterView = { label: string; value: string } | { code: string; value: string };

// One requirement the model read in a clause whose quote code found there word for word: the quote
// in the language of the description it was found in and the model's plain English reading, which
// the page labels as AI-made.
interface RequirementView {
	quote: string;
	lang?: string;
	reading: string;
	model: string;
}

type RejectedReason = RejectedItem['reason'];

export interface CriterionView {
	code: string;
	position: number;
	of: number;
	descriptions: QuoteText[];
	parameters: ParameterView[];
	// Set only on a lot the model read. A rejected requirement keeps only its reason: neither its
	// quote nor its reading is shown, since code could not tie them to this clause.
	requirements?: RequirementView[];
	rejected?: { reason: RejectedReason; line: string }[];
	// The TED notice the clause and its quotes come from.
	source?: string;
}

type NotReadReason = Extract<LotEntry, { status: 'not-read' }>['reason'] | 'reading-missing';

// One line per reason a lot the readings list was not read, worded for the page.
export const NOT_READ_LINES: Readonly<Record<NotReadReason, string>> = {
	'dry-run': 'Not read: the run that captured this notice made no model calls.',
	'cap-reached': 'Not read: the run reached its cap on model calls before this lot.',
	'reply-invalid':
		'Not read: the model did not answer in the expected form, even when asked a second time.',
	'send-failed': 'Not read: the request to the model failed.',
	'outside-the-run': 'Not read: this lot was not part of the run that read this capture.',
	'reading-missing': 'Not read: this capture lists the lot as read, but its reading is missing.'
};

export const REJECTED_LINES: Readonly<Record<RejectedReason, string>> = {
	'not-found':
		'Not read: the quote the model gave was not found in this clause, so it is not used.',
	'too-short':
		'Not read: the quote the model gave is too short to check against this clause, so it is not used.',
	'no-such-criterion':
		'Not read: the model named a clause this lot does not have, so its answer is not used.'
};

type LotReadingView =
	| { status: 'read'; model: string }
	| { status: 'no-criteria' }
	| { status: 'not-read'; reason: NotReadReason; line: string };

// What the browser decides a listed lot's verdict from, as plain data: the status lotStatusOf gave
// (a read lot's figures parsed here, on the server, from its verified quotes) and every fact of the
// lot's context except the instant, which the page carries once for all its lots. The reservation
// stays as published, so a lot that declares none is never read as "none".
interface LotVerdictInput {
	status: LotStatus;
	context: Omit<LotContext, 'now'>;
}

export interface LotView {
	number: number;
	anchor: string;
	id: string;
	title?: LangText;
	deadline: DisplayedDeadline;
	// The lot's own deadline has passed. A notice stays open while any lot is open (D-08), so a
	// closed lot can sit on an open notice, and its date alone would read as still open.
	closed: boolean;
	deadlineKind?: 'Requests to participate' | 'Tenders';
	value: string | null;
	criteriaSource?: string;
	legalBasis: { code: string; name?: string };
	legislation: LegislationReference[];
	reserved?: string;
	// The lot declares no reservation code at all (BT-71 absent): unknown, which is never "none", so
	// the page says it is not stated rather than showing the lot as not reserved.
	reservedUnstated: boolean;
	procedureNotes: LangText[];
	notes: LangText[];
	groupLegalForm?: LangText;
	criteria: CriterionView[];
	coverage: CoverageLine[];
	// The lot's own documents link, set only when the notice names no one link for every lot and no
	// coverage line carries it: a lot whose criteria come from the notice alone would otherwise show
	// its published link nowhere.
	documents?: DocumentsLink;
	// Absent when the capture's readings do not list the lot.
	reading?: LotReadingView;
	// Set exactly when reading is.
	verdictInput?: LotVerdictInput;
}

interface LotIndexEntry {
	number: number;
	anchor: string;
	title?: LangText;
	deadline: DisplayedDeadline;
	closed: boolean;
}

// What the capture's web search for the buyer's earlier awards found, in Tavily's order. Each address
// went through safeLink, so only an http or https one carries an href.
export type BuyerSearchView = { results: { title: string; link: SafeLink }[] } | { none: true };

export interface TenderPageModel {
	// The instant the loader built the page for, as an ISO string: the browser's verdict reads this
	// one, never its own clock, so a lot's closed state and its verdict cannot disagree.
	now: string;
	noticeNumber: string;
	title: LangText;
	buyers: LangText[];
	deadline: NoticeDeadline;
	timeLeft?: string;
	countries: string[];
	kind?: WorkKind;
	value: string | null;
	tedUrl: string;
	documents?: DocumentsLink;
	lotIndex: LotIndexEntry[];
	lots: LotView[];
	documentsUnread: boolean;
	cancelIntent: boolean;
	// The capture's readings list this notice.
	modelRead: boolean;
	// Absent when the capture did not search this notice's buyer. Nothing here reaches a verdict.
	search?: BuyerSearchView;
}

// What the loader hands the page. It lives here, not beside the loader, because components may not
// import from lib/server. The loader always sets readingRun, null for a capture the model never
// read; a page built without it says the same.
export interface TenderPageData {
	tender: TenderPageModel;
	capture: CaptureFacts;
	readingRun?: ReadingRun | null;
}

// Maps, like the country names: every code here comes from the notice, and a plain object would
// answer "constructor" or "__proto__" with a built-in property instead of nothing.
const LEGAL_BASIS_NAMES: ReadonlyMap<string, string> = new Map([
	['32014L0024', 'Directive 2014/24/EU'],
	['32014L0025', 'Directive 2014/25/EU'],
	['32014L0023', 'Directive 2014/23/EU'],
	['32009L0081', 'Directive 2009/81/EC']
]);

// A code without a name here (32024R2509, "other") is shown as published, in Mono.
export function legalBasisName(code: string): string | undefined {
	return LEGAL_BASIS_NAMES.get(code);
}

// The first IT code decides the kind, and the main code is named beside it: in the 2026-09-15
// capture 65 of 363 notices publish a first main CPV outside groups 72 and 48 (research Pitfall 4),
// so the kind never claims the main code.
export function workKind(cpv: NoticeRecord['cpv']): WorkKind | undefined {
	const code = [...cpv.main, ...cpv.additional].find(
		(each) => each.startsWith('72') || each.startsWith('48')
	);
	if (code === undefined) return undefined;
	const label = code.startsWith('72') ? 'IT services' : 'Software packages';
	const main = cpv.main[0];
	return { label, code, ...(main !== undefined && main !== code && { main }) };
}

const SOURCE_PLACES: ReadonlyMap<string, string> = new Map([
	['epo-notice', 'the notice'],
	['epo-procurement-document', 'the procurement documents'],
	['epo-sub-espd', 'the ESPD']
]);

// BT-821 as the buyer declared it, each source once. A code this version does not know is shown
// exactly as published, never reworded.
function criteriaSourceText(sources: readonly string[]): string | undefined {
	const named = [...new Set(sources)].map((source, index) => {
		const place = SOURCE_PLACES.get(source);
		if (place === undefined) return source;
		return `${index === 0 ? 'In' : 'in'} ${place}`;
	});
	return named.length === 0 ? undefined : named.join(' and ');
}

const LANGUAGE_NAMES = new Intl.DisplayNames('en', { type: 'language' });

// The language a description is written in, named in English. A code TED writes that no BCP 47 tag
// was found for has no lang, so its published code is the only honest name; a text with no code at
// all says so rather than leaving its label empty.
function withLanguage(text: LangText): QuoteText {
	return {
		...text,
		language: text.lang
			? (LANGUAGE_NAMES.of(text.lang) ?? text.lang)
			: (text.rawLang ?? 'Language not stated')
	};
}

const DEADLINE_KINDS = { request: 'Requests to participate', tender: 'Tenders' } as const;

// The documents every lot shares. In the 2026-09-15 capture no notice publishes a procedure-level
// link and no two lots of one notice publish different ones, so the lot's link is the notice's.
// Shared means the same published address AND the same restriction: an address open on one lot
// and restricted on another could be worded neither way for the whole notice. The link target is
// no third test: safeLink derives it from the published address alone, so equal addresses always
// carry equal targets.
function noticeDocuments(record: NoticeRecord): DocumentsLink | undefined {
	if (record.documents) return record.documents;
	const links = record.lots.map((lot) => lot.documents);
	const [first] = links;
	const same = (link: DocumentsLink | undefined) =>
		link?.published === first?.published &&
		Boolean(link?.restricted) === Boolean(first?.restricted);
	return first && links.every(same) ? first : undefined;
}

const sameText = (a: LangText) => (b: LangText) => a.text === b.text;

function toParameterView({ listName, code, value }: CriterionParameter): ParameterView {
	const label = parameterLabel(listName, code);
	if (label !== undefined) return { label, value };
	return { code: listName === undefined ? code : `${listName} ${code}`, value };
}

// The lot's reading by the one mapping the verdict also uses (lotStatusOf), with what the page shows
// of it: a lot listed as read whose stored reading is missing reads as not read, never as read.
function lotReadingOf(
	lot: LotRecord,
	readings: NoticeReadings | undefined
): { status: LotStatus; view?: LotReadingView; reading?: LotReading } {
	const status = lotStatusOf(lot, readings);
	const listed = readings?.lots.find((each) => each.lot === lot.id);
	if (status.status === 'unlisted') return { status };
	if (status.status === 'no-criteria') return { status, view: { status: 'no-criteria' } };
	if (status.status === 'not-read') {
		const reason = listed?.status === 'not-read' ? listed.reason : 'reading-missing';
		return { status, view: { status: 'not-read', reason, line: NOT_READ_LINES[reason] } };
	}
	const stored = readings?.readings.find(
		(each) => listed?.status === 'read' && each.textSha256 === listed.textSha256
	);
	return {
		status,
		view: { status: 'read', model: stored?.model ?? '' },
		reading: status.reading
	};
}

function verdictContext(
	record: NoticeRecord,
	lot: LotRecord,
	deadline: DisplayedDeadline
): LotVerdictInput['context'] {
	return {
		legalBasis: record.legalBasis,
		deadline: deadline.kind === 'in-notice' ? null : deadline.instant,
		coverage: summarizeLot(lot),
		cancelIntent: record.cancelIntent === true,
		reserved: lot.reserved
	};
}

const tedUrlOf = (record: NoticeRecord) =>
	`https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(record.noticeNumber)}`;

function readCriterion(criterion: CriterionReading, model: string, source: string) {
	return {
		source,
		requirements: criterion.verified.map(({ item, lang }) => ({
			quote: item.quote,
			...(lang && { lang }),
			reading: item.reading,
			model
		})),
		rejected: criterion.rejected.map(({ reason }) => ({ reason, line: REJECTED_LINES[reason] }))
	};
}

function toLotView(
	record: NoticeRecord,
	lot: LotRecord,
	index: number,
	now: Date,
	shared: DocumentsLink | undefined,
	readings: NoticeReadings | undefined
): LotView {
	const { status, view, reading } = lotReadingOf(lot, readings);
	const model = view?.status === 'read' ? view.model : '';
	const deadline = displayedDeadline(lot);
	const coverage = coverageLines(summarizeLot(lot), lot.documents ?? record.documents);
	const ownDocuments =
		shared === undefined && !coverage.some((line) => line.link) ? lot.documents : undefined;
	const criteriaSource = criteriaSourceText(lot.criteriaSources);
	const legalBasis = legalBasisName(record.legalBasis);
	const reserved = lot.reserved !== 'none' ? lot.reserved : undefined;
	const groupLegalForm = lot.groupLegalForm?.description;
	return {
		number: index + 1,
		anchor: `lot-${index + 1}`,
		id: lot.id,
		...(lot.title && { title: lot.title }),
		deadline,
		closed: !isOpen(deadline, now),
		...(deadline.kind !== 'in-notice' && { deadlineKind: DEADLINE_KINDS[deadline.kind] }),
		value: formatValue(lot.estimatedValue),
		...(criteriaSource && { criteriaSource }),
		legalBasis: { code: record.legalBasis, ...(legalBasis && { name: legalBasis }) },
		legislation: record.nationalLegislation,
		...(reserved && { reserved }),
		reservedUnstated: lot.reserved === undefined,
		procedureNotes: record.procedureNotes,
		// A one-lot notice can publish the same note on the procedure and the lot; it shows once.
		notes: lot.notes.filter((note) => !record.procedureNotes.some(sameText(note))),
		...(groupLegalForm && { groupLegalForm }),
		criteria: lot.criteria.map((criterion, position) => ({
			code: criterion.code,
			position: position + 1,
			of: lot.criteria.length,
			descriptions: criterion.descriptions.map(withLanguage),
			parameters: criterion.parameters.map(toParameterView),
			...(reading && readCriterion(reading.criteria[position], model, tedUrlOf(record)))
		})),
		coverage,
		...(ownDocuments && { documents: ownDocuments }),
		...(view && {
			reading: view,
			verdictInput: { status, context: verdictContext(record, lot, deadline) }
		})
	};
}

function searchView(search: NoticeSearch | undefined): BuyerSearchView | undefined {
	if (search === undefined || search.status !== 'searched') return undefined;
	if (search.results.length === 0) return { none: true };
	return {
		results: search.results.map(({ title, url }) => ({ title, link: safeLink(url) }))
	};
}

// readings is the notice's slice of its capture's readings, absent when the capture lists none for
// it: a lot the readings do not list keeps the phase 1 view. search is the notice's buyer search,
// absent when the capture holds none for it.
export function buildTenderPage(
	record: NoticeRecord,
	now: Date,
	readings?: NoticeReadings,
	search?: NoticeSearch
): TenderPageModel {
	const buyerSearch = searchView(search);
	const row = toIndexRow(record);
	const deadline = noticeDeadline(record.lots, now);
	const left =
		deadline.open && deadline.shown.kind !== 'in-notice'
			? timeLeft(deadline.shown.instant, now)
			: undefined;
	const kind = workKind(record.cpv);
	const documents = noticeDocuments(record);
	const lots = record.lots.map((lot, index) =>
		toLotView(record, lot, index, now, documents, readings)
	);
	return {
		now: now.toISOString(),
		noticeNumber: record.noticeNumber,
		title: record.title,
		buyers: record.buyers.map((buyer) => buyer.name),
		deadline,
		...(left && { timeLeft: left }),
		countries: row.country.map(countryName),
		...(kind && { kind }),
		value: formatValue(row.estimatedValue),
		tedUrl: tedUrlOf(record),
		...(documents && { documents }),
		lotIndex:
			lots.length > 1
				? lots.map(({ number, anchor, title, deadline: shown, closed }) => ({
						number,
						anchor,
						...(title && { title }),
						deadline: shown,
						closed
					}))
				: [],
		lots,
		// The same facts that give the list its "Criteria in the documents" tag.
		documentsUnread: readingStatus(record.lots.map(summarizeLot)).tag === 'criteria-in-documents',
		cancelIntent: record.cancelIntent === true,
		modelRead: readings !== undefined,
		...(buyerSearch && { search: buyerSearch })
	};
}

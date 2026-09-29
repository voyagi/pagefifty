// The tender page model /tenders/[notice] and /example/[notice] share. Pure: the record and "now"
// come in as arguments, so the deadline, the time left and the open test all read the one instant
// the loader was given (D-06). Nothing here reads, translates or judges a clause (D-13).
import type {
	DocumentsLink,
	LangText,
	LegislationReference,
	LotRecord,
	NoticeRecord
} from '../ingest/record';
import { summarizeLot } from '../core/coverage-facts';
import {
	displayedDeadline,
	isOpen,
	noticeDeadline,
	timeLeft,
	type DisplayedDeadline,
	type NoticeDeadline
} from '../core/deadline';
import { coverageLines, readingStatus, type CoverageLine } from '../core/reading';
import { toIndexRow } from '../snapshot/index-row';
import { countryName, formatValue, type CaptureFacts } from './list';

export interface WorkKind {
	label: 'IT services' | 'Software packages';
	code: string;
	main?: string;
}

export interface QuoteText extends LangText {
	language: string;
}

export interface CriterionView {
	code: string;
	position: number;
	of: number;
	descriptions: QuoteText[];
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
}

interface LotIndexEntry {
	number: number;
	anchor: string;
	title?: LangText;
	deadline: DisplayedDeadline;
	closed: boolean;
}

export interface TenderPageModel {
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
}

// What the loader hands the page. It lives here, not beside the loader, because components may not
// import from lib/server.
export interface TenderPageData {
	tender: TenderPageModel;
	capture: CaptureFacts;
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
// Shared means the same address AND the same restriction: an address open on one lot and
// restricted on another could be worded neither way for the whole notice.
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

function toLotView(record: NoticeRecord, lot: LotRecord, index: number, now: Date): LotView {
	const deadline = displayedDeadline(lot);
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
			descriptions: criterion.descriptions.map(withLanguage)
		})),
		coverage: coverageLines(summarizeLot(lot), lot.documents ?? record.documents)
	};
}

export function buildTenderPage(record: NoticeRecord, now: Date): TenderPageModel {
	const row = toIndexRow(record);
	const deadline = noticeDeadline(record.lots, now);
	const left =
		deadline.open && deadline.shown.kind !== 'in-notice'
			? timeLeft(deadline.shown.instant, now)
			: undefined;
	const kind = workKind(record.cpv);
	const documents = noticeDocuments(record);
	const lots = record.lots.map((lot, index) => toLotView(record, lot, index, now));
	return {
		noticeNumber: record.noticeNumber,
		title: record.title,
		buyers: record.buyers.map((buyer) => buyer.name),
		deadline,
		...(left && { timeLeft: left }),
		countries: row.country.map(countryName),
		...(kind && { kind }),
		value: formatValue(row.estimatedValue),
		tedUrl: `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(record.noticeNumber)}`,
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
		documentsUnread: readingStatus(record.lots.map(summarizeLot)).tag === 'criteria-in-documents'
	};
}

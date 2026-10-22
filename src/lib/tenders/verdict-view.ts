// A listed lot's verdict as the browser shows it. This module only words a decision: the decision
// itself is decideLotStatus's, the one per-lot dispatch the home figure also calls, run on the
// plain-data input the server page model carries. The firm arrives as figures or null; nothing here
// imports the profile, so whatever reaches this module came from the page that holds it.
import { criterionLabel } from '../codelists/labels';
import {
	decideLotStatus,
	type CriterionOutcome,
	type FirmFacts,
	type OutcomeWhy,
	type ReadLotDecision
} from '../core/compare';
import { coverage } from '../core/coverage-facts';
import type { LotReading } from '../core/lot-reading';
import {
	VERDICT_LABELS,
	type AskFirstReason,
	type CriterionState,
	type LotDecision,
	type LotVerdict
} from '../core/verdict';
import type { DocumentsLink } from '../ingest/record';
import { CANCEL_INTENT_LINE } from './list';
import type { LotView } from './tender-page';

export type { FirmFacts };

export type ComparedFirm =
	{ kind: 'demo'; name: string } | { kind: 'own' } | { kind: 'none' } | { kind: 'newer' };

// The icon drawn beside a verdict or a state. Shape and word tell them apart, never colour.
type Mark = 'met' | 'short' | 'partner' | 'users' | 'unread' | 'info';

interface CriterionStateView {
	state: CriterionState | 'not-compared' | 'not-assessed';
	word: string;
	mark: Mark;
}

// A criterion the firm misses on its own, as its shortfall row under the verdict names it.
interface Shortfall {
	label: string;
	position: number;
	of: number;
	floor: string | null;
}

export interface LotVerdictView {
	decision: LotDecision;
	label: string;
	mark: Mark;
	gloss: string;
	next: string;
	reason: string;
	link: { kind: 'profile' } | { kind: 'documents'; documents: DocumentsLink } | null;
	criteria: CriterionStateView[];
	shortfalls: Shortfall[];
	article63: string | null;
	// The published position of the clause the verdict rests on, shown first under it; null when
	// no criterion is left open.
	deciding: number | null;
	// The deciding clause's requirements the verdict rests on, as indexes into its requirements.
	decidingQuotes: number[];
	// Who decided and from what, worded by what code compared for this lot and nothing more.
	decidedBy: string;
}

// Article 63 lets another firm lend its capacity; it never makes that firm's help sufficient, and
// the line says so in the same breath.
export const ARTICLE_63_LINE =
	'Directive 2014/24/EU, Article 63, lets a firm rely on the capacity of other firms, or bid jointly, for a criterion of this kind. A partner is necessary here and not sufficient on its own.';

// One sentence per verdict, per ask-first reason, and per why code where the reason alone would not
// tell the firm what is open. Each says what was read and compared, never what the firm should do
// or will get.
export const REASON_LINES = {
	GO: "Every selection criterion read in the notice is met by the figures compared. This covers only the selection criteria read, not exclusion grounds, declarations or the buyer's shortlisting.",
	'PARTNER NEEDED': 'The firm falls short on its own on the criteria named here.',
	'NO-GO':
		'A criterion named here rules the firm out on its own, and the notice leaves no route through another firm.',
	'cancel-intent': CANCEL_INTENT_LINE,
	'route-unsettled':
		'A criterion is short, and whether another firm can close it is not settled in this version.',
	'route-unsettled/not-held':
		'The profile holds no certificate named exactly as the buyer names it.',
	'route-unsettled/expired': 'A certificate in the profile ends before the deadline of this lot.',
	'route-unsettled/not-named':
		'The buyer asks for a certificate this version cannot match by name with the profile.',
	'route-unsettled/route-by-law':
		'The firm falls short on its own, and this version does not settle whether another firm can close it under this legal basis.',
	'route-unsettled/short-restricted':
		'The firm falls short on its own, and a clause in this lot limits relying on other firms.',
	'profile-field-missing': 'A criterion needs a figure the profile does not settle.',
	'profile-field-missing/firm-judges':
		'Only the firm can judge whether its references, staff or line of business fit what the buyer names.',
	'profile-field-missing/empty-field': 'A figure this comparison needs is empty in the profile.',
	'profile-field-missing/fewer-years':
		'The profile holds fewer completed financial years than the buyer asks for.',
	'profile-field-missing/no-profile':
		'With no firm profile in this browser, no criterion could be compared.',
	'profile-field-missing/net-below-gross-floor':
		'The buyer states a gross floor, and the net figures in the profile fall below it, so the comparison stays open.',
	'profile-field-missing/no-comparator':
		'A figure equals the floor, and the notice does not say whether equal is enough.',
	'profile-field-missing/period-unstated':
		"The notice does not say which years count, and the firm's years fall on both sides of the floor.",
	'profile-field-missing/certificate-scope':
		'The profile holds a certificate named as the buyer names it and valid through the deadline of this lot. Only the firm can judge whether its scope fits what the buyer asks for.',
	'profile-field-missing/undated': 'A certificate in the profile has no end date.',
	'profile-field-missing/no-deadline':
		"The notice dates no deadline, so a certificate's validity on it cannot be checked.",
	'not-read': 'A requirement in this lot was not read, so it is not compared.',
	'not-compared': 'A criterion in this lot is not compared in this version.',
	'not-compared/insurance':
		'Insurance cover is shown as published and not compared in this version.',
	'not-compared/kind-disagrees':
		'A requirement is shown as published and not compared in this version, because its criterion code and its reading disagree on what it asks for.',
	'not-compared/period-disagrees':
		'A figure is shown as published and not compared in this version, because its criterion code and its reading disagree on the years it counts.',
	'not-compared/family':
		'A criterion of a kind this version does not compare is shown as published.',
	'not-compared/optional':
		'A requirement its reading marks as optional or scored is shown as published and not compared in this version.',
	'not-compared/reserved':
		'Whether the lot is reserved for certain operators is not compared with the profile in this version.',
	'criteria-in-documents':
		'Documents not read yet: part of the criteria may sit outside the notice.',
	'criteria-in-documents/documents':
		'Documents not read yet: the buyer names the procurement documents as a source of criteria, and this version does not read them.',
	'criteria-in-documents/espd':
		'Documents not read yet: the buyer names the ESPD as a source of criteria, and this version does not read it.',
	'criteria-in-documents/points':
		'Documents not read yet: a criterion refers to the procurement documents, which this version does not read.',
	'criteria-in-documents/unnamed':
		'Documents not read yet: the notice does not say where its criteria are published.',
	'no-criteria-in-notice':
		'No criteria in the notice: this lot publishes no selection criteria in the notice itself.'
} as const satisfies Readonly<Record<string, string>>;

type ReasonKey = keyof typeof REASON_LINES;

type NextKey =
	Exclude<LotVerdict, 'ASK FIRST'> | AskFirstReason | 'profile-field-missing/no-profile';

// What to check next, after "Next:", one line per verdict and per ask-first reason. Each names
// something to read or check, never a step toward bidding, and none is a verdict word. "Below"
// points at the reason line and the clause that decides, which follow it.
export const NEXT_LINES: Readonly<Record<NextKey, string>> = {
	GO: 'check the exclusion grounds and declarations, which this reading does not cover.',
	'PARTNER NEEDED': 'check whether another firm can lend the capacity named below.',
	'NO-GO':
		'nothing in the criteria read leaves a route; the clause below is the one that rules it out.',
	'cancel-intent': 'check the notice on TED for the cancellation.',
	'route-unsettled': 'check whether the clause below lets another firm help.',
	'profile-field-missing': 'check the requirement named below against your own records.',
	'profile-field-missing/no-profile': 'set up a firm profile.',
	'not-read': 'read the criterion named below yourself.',
	'not-compared': 'read the criterion named below yourself.',
	'criteria-in-documents': 'read the procurement documents, which were not read.',
	'no-criteria-in-notice': 'read the notice on TED for criteria set elsewhere.'
};

// The profile link is set exactly when no profile was there to compare, which a figure check
// cannot follow.
export function nextLine(view: Pick<LotVerdictView, 'decision' | 'link'>): string {
	const { decision } = view;
	if (decision.verdict !== 'ASK FIRST') return NEXT_LINES[decision.verdict];
	if (view.link?.kind === 'profile') return NEXT_LINES['profile-field-missing/no-profile'];
	return NEXT_LINES[decision.reason];
}

// None of these is a verdict word: a state belongs to one criterion, a verdict to the lot.
export const STATE_LABELS: Readonly<Record<CriterionStateView['state'], string>> = {
	MET: 'Met',
	MET_WITH_TASK: 'Met, with a task',
	INFO: 'For information',
	SHORT_BORROWABLE: 'Short on its own',
	SHORT_FIXED: 'Short, no partner route',
	SHORT_ROUTE_UNSETTLED: 'Short, route not settled',
	PROFILE_GAP: 'Not settled by the profile',
	NOT_READ: 'Not read',
	'not-compared': 'Not compared in this version',
	'not-assessed': 'Not assessed'
};

// A short state crosses its ring out, unless a partner could close it; what is only shown or left
// open carries the information ring, and what was not read the dashed one.
const STATE_MARKS: Readonly<Record<CriterionStateView['state'], Mark>> = {
	MET: 'met',
	MET_WITH_TASK: 'met',
	INFO: 'info',
	SHORT_BORROWABLE: 'partner',
	SHORT_FIXED: 'short',
	SHORT_ROUTE_UNSETTLED: 'short',
	PROFILE_GAP: 'info',
	NOT_READ: 'unread',
	'not-compared': 'info',
	'not-assessed': 'info'
};

const VERDICT_MARKS: Readonly<Record<LotVerdict, Mark>> = {
	GO: 'met',
	'PARTNER NEEDED': 'users',
	'NO-GO': 'short',
	'ASK FIRST': 'info'
};

export function comparedLine(firm: ComparedFirm): string {
	switch (firm.kind) {
		case 'demo':
			// A firm name can end in its own period ("B.V."), which then ends the sentence too.
			return `Compared with the demo firm, ${firm.name}${firm.name.endsWith('.') ? '' : '.'}`;
		case 'own':
			return 'Compared with the firm profile kept in this browser.';
		case 'none':
			return 'No firm profile is kept in this browser yet.';
		case 'newer':
			return 'The firm profile in this browser was saved by a newer version of Pagefifty, so it was not read.';
	}
}

// The line under every verdict that says who decided it. Each says only what this run did: a lot
// where no figure or certificate of the firm was set against a clause says so, and a lot the model
// never read does not say the model read it.
export const DECIDED_LINES = {
	figures: 'Decided by code from the figures compared; the model only read the clauses.',
	certificates: 'Decided by code from the certificates compared; the model only read the clauses.',
	both: 'Decided by code from the figures and certificates compared; the model only read the clauses.',
	'nothing-compared':
		'Decided by code. No figure or certificate of the firm was compared for this lot; the model only read the clauses.',
	unread:
		'Decided by code from what the notice states. The model read no clause of this lot, and nothing was compared with the firm.'
} as const satisfies Readonly<Record<string, string>>;

// The why codes compare.ts gives a requirement only once it has set a figure from the profile
// against a floor read from a verified quote (fromCheck, shortfall, turnoverCheck's year count).
const FIGURE_WHYS: ReadonlySet<OutcomeWhy> = new Set<OutcomeWhy>([
	'met',
	'short',
	'short-restricted',
	'route-by-law',
	'no-comparator',
	'net-below-gross-floor',
	'period-unstated',
	'fewer-years'
]);

// The why codes certificateState gives once it has looked for a certificate the quote names among
// the profile's own.
const CERTIFICATE_WHYS: ReadonlySet<OutcomeWhy> = new Set<OutcomeWhy>([
	'not-held',
	'expired',
	'certificate-scope',
	'undated',
	'no-deadline'
]);

// A specific turnover the firm's general figure passes is left to the firm (decideFigure), after
// the figure was compared; the same why code set by the clause's kind alone carries no item.
const comparedFigure = (requirement: RequirementLike) =>
	FIGURE_WHYS.has(requirement.why) ||
	(requirement.why === 'firm-judges' && requirement.item !== undefined);

function decidedLine(decided: ReadLotDecision, lot: LotView): string {
	if (lot.verdictInput?.status.status !== 'read') return DECIDED_LINES.unread;
	const requirements = decided.criteria.flatMap((outcome) => outcome.requirements);
	const figures = requirements.some(comparedFigure);
	const certificates = requirements.some((each) => CERTIFICATE_WHYS.has(each.why));
	if (figures && certificates) return DECIDED_LINES.both;
	if (figures) return DECIDED_LINES.figures;
	if (certificates) return DECIDED_LINES.certificates;
	return DECIDED_LINES['nothing-compared'];
}

const LINES: Readonly<Record<string, string>> = REASON_LINES;

function stateOf(outcome: CriterionOutcome): CriterionStateView['state'] {
	if (outcome.state === 'INFO' && outcome.requirements.every((each) => each.why === 'not-assessed'))
		return 'not-assessed';
	return outcome.state ?? 'not-compared';
}

// The why codes behind a reason, in published order, each once.
function whysOf(
	decided: ReadLotDecision,
	pick: (outcome: RequirementLike) => boolean
): OutcomeWhy[] {
	const requirements = [
		...decided.criteria.flatMap((outcome) => outcome.requirements),
		...(decided.reservation ? [decided.reservation] : [])
	];
	return [...new Set(requirements.filter(pick).map((each) => each.why))];
}

type RequirementLike = ReadLotDecision['criteria'][number]['requirements'][number];

// The sentences a reason's why codes name, or the reason's own sentence when none is named.
function linesFor(reason: string, whys: readonly OutcomeWhy[]): string {
	const named = [...new Set(whys.flatMap((why) => LINES[`${reason}/${why}`] ?? []))];
	return named.length > 0 ? named.join(' ') : LINES[reason];
}

function documentsKey(input: LotView['verdictInput']): ReasonKey {
	const facts = input ? coverage(input.context.coverage) : undefined;
	if (facts?.namesDocuments) return 'criteria-in-documents/documents';
	if (facts?.namesEspd) return 'criteria-in-documents/espd';
	if (facts?.pointsToDocuments) return 'criteria-in-documents/points';
	if (facts?.sourceUnnamed) return 'criteria-in-documents/unnamed';
	return 'criteria-in-documents';
}

function reasonOf(decided: ReadLotDecision, lot: LotView): string {
	const { decision } = decided;
	if (decision.verdict !== 'ASK FIRST') return REASON_LINES[decision.verdict];
	switch (decision.reason) {
		case 'route-unsettled':
			return linesFor(
				decision.reason,
				whysOf(decided, (each) => each.state === 'SHORT_ROUTE_UNSETTLED')
			);
		case 'profile-field-missing':
			return linesFor(
				decision.reason,
				whysOf(decided, (each) => each.state === 'PROFILE_GAP')
			);
		case 'not-compared':
			return linesFor(
				decision.reason,
				whysOf(decided, (each) => each.notCompared)
			);
		case 'criteria-in-documents':
			return REASON_LINES[documentsKey(lot.verdictInput)];
		default:
			return REASON_LINES[decision.reason];
	}
}

// The documents a lot's criteria point to: its own link, the one its coverage line carries, or the
// one the whole notice shares.
function documentsOf(lot: LotView, shared: DocumentsLink | undefined): DocumentsLink | undefined {
	return lot.documents ?? lot.coverage.find((line) => line.link)?.link ?? shared;
}

function linkOf(
	decided: ReadLotDecision,
	lot: LotView,
	shared: DocumentsLink | undefined
): LotVerdictView['link'] {
	const { decision } = decided;
	if (decision.verdict !== 'ASK FIRST') return null;
	if (decision.reason === 'profile-field-missing') {
		const whys = whysOf(decided, (each) => each.state === 'PROFILE_GAP');
		return whys.includes('no-profile') ? { kind: 'profile' } : null;
	}
	if (decision.reason !== 'criteria-in-documents') return null;
	const documents = documentsOf(lot, shared);
	return documents ? { kind: 'documents', documents } : null;
}

const grouped = (digits: string) => digits.replace(/\B(?=(\d{3})+$)/g, ',');

// Euros with cents, from whole cents, so no floor is ever rounded on its way to the page.
function euros(cents: number): string {
	const whole = Math.floor(cents / 100);
	return `EUR ${grouped(String(whole))}.${String(cents % 100).padStart(2, '0')}`;
}

// The floor code read from the verified quote the shortfall rests on, never the model's number. A
// clause can hold a floor the firm meets beside the one it misses, so only a requirement in the
// shortfall's own state names it.
function floorOf(
	outcome: CriterionOutcome,
	reading: LotReading['criteria'][number] | undefined,
	short: CriterionState
) {
	for (const requirement of outcome.requirements) {
		if (requirement.state !== short) continue;
		const verified = reading?.verified.find((each) => each.item === requirement.item);
		if (verified === undefined) continue;
		if (reading?.family === 'staff-average' && verified.count.kind === 'one')
			return `${verified.count.count} staff`;
		if (verified.money.kind === 'one') return euros(verified.money.cents);
	}
	return null;
}

function shortfallsOf(decided: ReadLotDecision, lot: LotView): Shortfall[] {
	const short = decided.decision.verdict === 'NO-GO' ? 'SHORT_FIXED' : 'SHORT_BORROWABLE';
	if (decided.decision.verdict !== 'NO-GO' && decided.decision.verdict !== 'PARTNER NEEDED')
		return [];
	const status = lot.verdictInput?.status;
	const reading = status?.status === 'read' ? status.reading : undefined;
	return decided.criteria.flatMap((outcome, index) => {
		if (outcome.state !== short) return [];
		const view = lot.criteria[index];
		const code = view?.code ?? '';
		return [
			{
				label: criterionLabel(code) ?? code,
				position: index + 1,
				of: decided.criteria.length,
				floor: floorOf(outcome, reading?.criteria[index], short)
			}
		];
	});
}

// The state each verdict and ask-first reason rests on. A reason with no criterion in that state
// (a reservation, an item placed under no clause, the documents) falls back to the first criterion
// left open; met and information-only criteria are never open.
// A criterion and each requirement under it carry their state the same way, so one test reads both.
type Stated = Pick<CriterionOutcome, 'state' | 'notCompared'>;

const RESTS_ON: Partial<Record<LotVerdict | AskFirstReason, (outcome: Stated) => boolean>> = {
	'NO-GO': (outcome) => outcome.state === 'SHORT_FIXED',
	'PARTNER NEEDED': (outcome) => outcome.state === 'SHORT_BORROWABLE',
	'route-unsettled': (outcome) => outcome.state === 'SHORT_ROUTE_UNSETTLED',
	'profile-field-missing': (outcome) => outcome.state === 'PROFILE_GAP',
	'not-read': (outcome) => outcome.state === 'NOT_READ',
	'not-compared': (outcome) => outcome.notCompared
};

const SETTLED: ReadonlySet<CriterionStateView['state']> = new Set([
	'MET',
	'MET_WITH_TASK',
	'INFO',
	'not-assessed'
]);

function decidingOf(decided: ReadLotDecision): number | null {
	const { decision, criteria } = decided;
	const rests = RESTS_ON[decision.verdict === 'ASK FIRST' ? decision.reason : decision.verdict];
	const resting = rests === undefined ? -1 : criteria.findIndex(rests);
	const index =
		resting >= 0 ? resting : criteria.findIndex((outcome) => !SETTLED.has(stateOf(outcome)));
	return index >= 0 ? index + 1 : null;
}

// The verified quotes of the deciding clause that the verdict rests on, as indexes into that
// clause's requirements in the order they were read. Where code decided quote by quote, these are
// the quotes in the state the verdict rests on. Where the clause's kind set its state for the whole
// clause (references, staff qualifications, insurance), every quote read in it stands behind that
// state. A state no quote carries, such as an amount no quote names, names none.
function decidingQuotesOf(decided: ReadLotDecision, lot: LotView, deciding: number | null) {
	const status = lot.verdictInput?.status;
	if (deciding === null || status?.status !== 'read') return [];
	const outcome = decided.criteria[deciding - 1];
	const verified = status.reading.criteria[deciding - 1]?.verified ?? [];
	if (outcome === undefined) return [];
	const itemised = outcome.requirements.filter((each) => each.item !== undefined);
	if (itemised.length === 0) return verified.map((_, index) => index);
	const { decision } = decided;
	const rests =
		RESTS_ON[decision.verdict === 'ASK FIRST' ? decision.reason : decision.verdict] ??
		((each: Stated) => each.state === outcome.state);
	const indexes = itemised
		.filter(rests)
		.map((each) => verified.findIndex((requirement) => requirement.item === each.item))
		.filter((index) => index >= 0);
	return [...new Set(indexes)].sort((a, b) => a - b);
}

// The figure's gloss as a sentence of its own under the verdict.
const sentence = (gloss: string) => `${gloss.charAt(0).toUpperCase()}${gloss.slice(1)}.`;

export function verdictView(
	decided: ReadLotDecision,
	lot: LotView,
	shared?: DocumentsLink
): LotVerdictView {
	const { decision } = decided;
	const link = linkOf(decided, lot, shared);
	const deciding = decidingOf(decided);
	return {
		decision,
		label: VERDICT_LABELS[decision.verdict],
		mark: VERDICT_MARKS[decision.verdict],
		gloss: sentence(verdictGloss(decision.verdict)),
		next: nextLine({ decision, link }),
		reason: reasonOf(decided, lot),
		link,
		criteria: decided.criteria.map((outcome) => {
			const state = stateOf(outcome);
			return { state, word: STATE_LABELS[state], mark: STATE_MARKS[state] };
		}),
		shortfalls: shortfallsOf(decided, lot),
		article63: decision.verdict === 'PARTNER NEEDED' ? ARTICLE_63_LINE : null,
		deciding,
		decidingQuotes: decidingQuotesOf(decided, lot, deciding),
		decidedBy: decidedLine(decided, lot)
	};
}

type FigureCount = 'go' | 'partnerNeeded' | 'noGo' | 'askFirst';

const FIGURE_GLOSSES: Readonly<Record<LotVerdict, string>> = {
	GO: 'meets every selection criterion read, on its own',
	'PARTNER NEEDED': 'falls short on its own on a criterion read',
	'NO-GO': 'ruled out by a criterion read, with no route through another firm',
	'ASK FIRST': 'not read in full, or a question left open'
};

// What a verdict means, in the words the home figure glosses its counts with, so the figure and the
// tender page never explain one verdict two ways.
export function verdictGloss(verdict: LotVerdict): string {
	return FIGURE_GLOSSES[verdict];
}

// The home figure's words, in the tender page's display labels: one set of verdict words for both.
// The rows follow the figure file's count order; the lot rule follows the order mostLenient ranks.
export function figureWords(): {
	rows: { key: FigureCount; label: string; gloss: string }[];
	lotRule: string;
} {
	const row = (key: FigureCount, verdict: LotVerdict) => ({
		key,
		label: VERDICT_LABELS[verdict],
		gloss: verdictGloss(verdict)
	});
	const L = VERDICT_LABELS;
	return {
		rows: [
			row('go', 'GO'),
			row('partnerNeeded', 'PARTNER NEEDED'),
			row('noGo', 'NO-GO'),
			row('askFirst', 'ASK FIRST')
		],
		lotRule: `Each notice counts once, under its most lenient lot: ${L.GO}, then ${L['ASK FIRST']}, then ${L['PARTNER NEEDED']}, then ${L['NO-GO']}.`
	};
}

// now is the instant the page was built for, never the browser's own clock.
export function lotVerdict(
	lot: LotView,
	firm: FirmFacts | null,
	now: string,
	shared?: DocumentsLink
): LotVerdictView | null {
	const input = lot.verdictInput;
	if (input === undefined) return null;
	const decided = decideLotStatus(input.status, firm, { ...input.context, now });
	return decided && verdictView(decided, lot, shared);
}

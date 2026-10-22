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

interface CriterionStateView {
	state: CriterionState | 'not-compared' | 'not-assessed';
	word: string;
}

// A criterion the firm misses on its own, as the errata slip names it.
interface Shortfall {
	label: string;
	position: number;
	of: number;
	floor: string | null;
}

export interface LotVerdictView {
	decision: LotDecision;
	label: string;
	reason: string;
	link: { kind: 'profile' } | { kind: 'documents'; documents: DocumentsLink } | null;
	criteria: CriterionStateView[];
	shortfalls: Shortfall[];
	article63: string | null;
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
		'The notice does not state this floor as net, and the net figures in the profile do not clear it, so the comparison stays open.',
	'profile-field-missing/no-comparator':
		'A figure equals the floor, and this version cannot tell from the notice whether equal is enough.',
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
	'not-compared/other-lot':
		'A requirement the clause states for another lot of this notice is shown as published and not compared for this lot.',
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

export function verdictView(
	decided: ReadLotDecision,
	lot: LotView,
	shared?: DocumentsLink
): LotVerdictView {
	return {
		decision: decided.decision,
		label: VERDICT_LABELS[decided.decision.verdict],
		reason: reasonOf(decided, lot),
		link: linkOf(decided, lot, shared),
		criteria: decided.criteria.map((outcome) => {
			const state = stateOf(outcome);
			return { state, word: STATE_LABELS[state] };
		}),
		shortfalls: shortfallsOf(decided, lot),
		article63: decided.decision.verdict === 'PARTNER NEEDED' ? ARTICLE_63_LINE : null
	};
}

type FigureCount = 'go' | 'partnerNeeded' | 'noGo' | 'askFirst';

const FIGURE_GLOSSES: Readonly<Record<LotVerdict, string>> = {
	GO: 'meets every selection criterion read, on its own',
	'PARTNER NEEDED': 'falls short on its own on a criterion read',
	'NO-GO': 'ruled out by a criterion read, with no route through another firm',
	'ASK FIRST': 'not read in full, or a question left open'
};

// The home figure's words, in the tender page's display labels: one set of verdict words for both.
// The rows follow the figure file's count order; the lot rule follows the order mostLenient ranks.
export function figureWords(): {
	rows: { key: FigureCount; label: string; gloss: string }[];
	lotRule: string;
} {
	const row = (key: FigureCount, verdict: LotVerdict) => ({
		key,
		label: VERDICT_LABELS[verdict],
		gloss: FIGURE_GLOSSES[verdict]
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

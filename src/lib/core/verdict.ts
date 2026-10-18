// The verdict model as code. From phase 1 on this module is its record: the prose tables it
// replaces now point here, and verdict.test.ts pins every lot of up to three criteria against them.
// It imports nothing and uses erasable TypeScript only, so the build script, the node tests and the
// workerd project can all load it.

export const CRITERION_STATES = [
	'MET',
	'MET_WITH_TASK',
	'INFO',
	'SHORT_BORROWABLE',
	'SHORT_FIXED',
	'SHORT_ROUTE_UNSETTLED',
	'PROFILE_GAP',
	'NOT_READ'
] as const;
export type CriterionState = (typeof CRITERION_STATES)[number];

export const COVERAGE_FACTS = ['NO_CRITERIA', 'SOURCE_UNREAD'] as const;
export type CoverageFact = (typeof COVERAGE_FACTS)[number];

export const LOT_VERDICTS = ['NO-GO', 'PARTNER NEEDED', 'ASK FIRST', 'GO'] as const;
export type LotVerdict = (typeof LOT_VERDICTS)[number];

// The buyer's announced intent to cancel comes first: while it stands, nothing else the firm could
// act on matters. After it, the reason naming what the firm can act on first wins: settle a route,
// fill a profile field, wait for a clause to be read, then check a clause this version reads but
// does not compare, which the firm can do itself once nothing is left to wait for. The documents
// reason comes after those so the near-GO "nothing in the notice rules you out, the documents also
// hold criteria" keeps its own count instead of standing in for a gap the firm could close itself.
export const ASK_FIRST_REASONS = [
	'cancel-intent',
	'route-unsettled',
	'profile-field-missing',
	'not-read',
	'not-compared',
	'criteria-in-documents',
	'no-criteria-in-notice'
] as const;
export type AskFirstReason = (typeof ASK_FIRST_REASONS)[number];

export const STATE_SEVERITY = [
	'SHORT_FIXED',
	'SHORT_BORROWABLE',
	'SHORT_ROUTE_UNSETTLED',
	'PROFILE_GAP',
	'NOT_READ',
	'MET_WITH_TASK',
	'MET',
	'INFO'
] as const satisfies readonly CriterionState[];

export interface LotInput {
	readonly states: readonly CriterionState[];
	readonly facts: readonly CoverageFact[];
	readonly noticeIsOnlySource: boolean;
	readonly pointsToDocuments: boolean;
	// A criterion read but not compared in this version (insurance, a code without a comparison, a
	// model reading code disagrees with, a requirement read as optional) or a reservation the
	// profile cannot be compared with.
	readonly notCompared?: boolean;
	// The notice carries the buyer's intent to cancel (BT-140 cancel-intent, DATA-02).
	readonly cancelIntent?: boolean;
}

export type LotDecision =
	| { readonly verdict: 'NO-GO' | 'PARTNER NEEDED' | 'GO' }
	| { readonly verdict: 'ASK FIRST'; readonly reason: AskFirstReason };

const REASON_APPLIES: Readonly<Record<AskFirstReason, (lot: LotInput) => boolean>> = {
	'cancel-intent': (lot) => lot.cancelIntent === true,
	'route-unsettled': (lot) => lot.states.includes('SHORT_ROUTE_UNSETTLED'),
	'profile-field-missing': (lot) => lot.states.includes('PROFILE_GAP'),
	'not-read': (lot) => lot.states.includes('NOT_READ'),
	'not-compared': (lot) => lot.notCompared === true,
	'criteria-in-documents': (lot) =>
		lot.facts.includes('SOURCE_UNREAD') || !lot.noticeIsOnlySource || lot.pointsToDocuments,
	'no-criteria-in-notice': (lot) => lot.facts.includes('NO_CRITERIA') || lot.states.length === 0
};

// GO is what is left once no shortfall and no reason applies, which is exactly the GO row: the
// notice is the only source, at least one criterion was read, every one is MET, MET_WITH_TASK or
// INFO, nothing points to the documents and no coverage fact is present.
export function decideLot(lot: LotInput): LotDecision {
	// The buyer has said it means to cancel, so no reading of the clauses may stand as the verdict,
	// a NO-GO included.
	if (lot.cancelIntent === true) return { verdict: 'ASK FIRST', reason: 'cancel-intent' };
	const has = (state: CriterionState) => lot.states.includes(state);
	if (has('SHORT_FIXED')) return { verdict: 'NO-GO' };
	if (has('SHORT_BORROWABLE')) return { verdict: 'PARTNER NEEDED' };
	const reason = ASK_FIRST_REASONS.find((candidate) => REASON_APPLIES[candidate](lot));
	return reason ? { verdict: 'ASK FIRST', reason } : { verdict: 'GO' };
}

const severityOf = (state: CriterionState): number => STATE_SEVERITY.indexOf(state);

// A clause with no parsed sub-requirement has nothing to combine, so it was not read.
function pick(
	states: readonly CriterionState[],
	prefer: (candidate: CriterionState, kept: CriterionState) => boolean
): CriterionState {
	if (states.length === 0) return 'NOT_READ';
	return states.reduce((kept, candidate) => (prefer(candidate, kept) ? candidate : kept));
}

export function combineAll(states: readonly CriterionState[]): CriterionState {
	return pick(states, (candidate, kept) => severityOf(candidate) < severityOf(kept));
}

export function combineAny(states: readonly CriterionState[]): CriterionState {
	return pick(states, (candidate, kept) => severityOf(candidate) > severityOf(kept));
}

const KNOWN_STATES: ReadonlySet<unknown> = new Set(CRITERION_STATES);

export function isCriterionState(value: unknown): value is CriterionState {
	return KNOWN_STATES.has(value);
}

// Display words only; the internal names above never change. They describe what was read and never
// tell the firm what to do. The design pass for the verdict page may rename them, and DESIGN.md
// then records the mapping. Nothing in phase 1 renders them.
export const VERDICT_LABELS: Readonly<Record<LotVerdict, string>> = {
	GO: 'Go',
	'PARTNER NEEDED': 'Not met alone',
	'ASK FIRST': 'Ask first',
	'NO-GO': 'No-go'
};

export const ASK_FIRST_REASON_LABELS: Readonly<Record<AskFirstReason, string>> = {
	'cancel-intent': 'The buyer intends to cancel',
	'route-unsettled': 'Route not settled',
	'profile-field-missing': 'A profile field is missing',
	'not-read': 'Not read',
	'not-compared': 'Not compared in this version',
	'criteria-in-documents': 'Criteria in the ESPD or the documents',
	'no-criteria-in-notice': 'No criteria in the notice'
};

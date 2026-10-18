// A listed lot's verdict as the browser shows it. This module only words a decision: the decision
// itself is decideLotStatus's, the one per-lot dispatch the home figure also calls, run on the
// plain-data input the server page model carries. The firm arrives as figures or null; nothing here
// imports the profile, so whatever reaches this module came from the page that holds it.
import {
	decideLotStatus,
	type CriterionOutcome,
	type FirmFacts,
	type OutcomeWhy,
	type ReadLotDecision
} from '../core/compare';
import { VERDICT_LABELS, type CriterionState, type LotDecision } from '../core/verdict';
import type { LotView } from './tender-page';

export type { FirmFacts };

export type ComparedFirm =
	{ kind: 'demo'; name: string } | { kind: 'own' } | { kind: 'none' } | { kind: 'newer' };

interface CriterionStateView {
	state: CriterionState | 'not-compared' | 'not-assessed';
	word: string;
}

export interface LotVerdictView {
	decision: LotDecision;
	label: string;
	reason: string;
	criteria: CriterionStateView[];
}

// One sentence per verdict, per ASK FIRST reason, and per why code where the reason alone would not
// tell the firm what is open. None of them tells the firm what to do: they say what was read.
const REASON_LINES = {
	GO: 'Every selection criterion read in the notice is met by the figures compared.',
	'PARTNER NEEDED': 'The firm falls short on its own on a criterion below.',
	'NO-GO': 'A criterion below rules the firm out on its own.',
	'cancel-intent': 'The buyer has announced that it intends to cancel this procedure.',
	'route-unsettled':
		'A criterion below is short, and whether another firm can close it is not settled.',
	'profile-field-missing': 'A criterion below needs a figure the profile does not settle.',
	'profile-field-missing/firm-judges':
		'Only the firm can judge whether its references or staff fit what the buyer names.',
	'not-read': 'A requirement in this lot was not read, so it is not compared.',
	'not-compared': 'A criterion in this lot is not compared in this version.',
	'criteria-in-documents': 'Documents not read yet.',
	'no-criteria-in-notice': 'No criteria in the notice for this lot.'
} as const satisfies Readonly<Record<string, string>>;

const STATE_LABELS: Readonly<Record<CriterionStateView['state'], string>> = {
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
			return `Compared with the demo firm, ${firm.name}.`;
		case 'own':
			return 'Compared with the firm profile kept in this browser.';
		case 'none':
			return 'No firm profile is kept in this browser yet.';
		case 'newer':
			return 'The firm profile in this browser was saved by a newer version of Pagefifty, so it was not read.';
	}
}

function stateOf(outcome: CriterionOutcome): CriterionStateView['state'] {
	if (outcome.state === 'INFO' && outcome.requirements.every((each) => each.why === 'not-assessed'))
		return 'not-assessed';
	return outcome.state ?? 'not-compared';
}

const whysOf = (decided: ReadLotDecision, state: CriterionState): OutcomeWhy[] => [
	...new Set(
		decided.criteria.flatMap((outcome) =>
			outcome.requirements.flatMap((each) => (each.state === state ? [each.why] : []))
		)
	)
];

function reasonOf(decided: ReadLotDecision): string {
	const { decision } = decided;
	if (decision.verdict !== 'ASK FIRST') return REASON_LINES[decision.verdict];
	if (decision.reason === 'profile-field-missing') {
		const lines: Readonly<Record<string, string>> = REASON_LINES;
		const named = whysOf(decided, 'PROFILE_GAP').flatMap((why) => {
			const line = lines[`profile-field-missing/${why}`];
			return line === undefined ? [] : [line];
		});
		if (named.length > 0) return [...new Set(named)].join(' ');
	}
	return REASON_LINES[decision.reason];
}

function verdictView(decided: ReadLotDecision): LotVerdictView {
	return {
		decision: decided.decision,
		label: VERDICT_LABELS[decided.decision.verdict],
		reason: reasonOf(decided),
		criteria: decided.criteria.map((outcome) => {
			const state = stateOf(outcome);
			return { state, word: STATE_LABELS[state] };
		})
	};
}

// now is the instant the page was built for, never the browser's own clock.
export function lotVerdict(
	lot: LotView,
	firm: FirmFacts | null,
	now: string
): LotVerdictView | null {
	const input = lot.verdictInput;
	if (input === undefined) return null;
	const decided = decideLotStatus(input.status, firm, { ...input.context, now });
	return decided && verdictView(decided);
}

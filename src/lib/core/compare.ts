// The one place a criterion meets a firm's figures (SPEC R5, VERD-02). The state comes from the
// criterion code's family, the figures code read from the verified quote and the firm's own
// figures; the model's kind, number and period can only withhold a comparison, never choose its
// result. Profile-shaped by structure only: no module here imports src/lib/profile.
import type { LotCoverageInput } from './coverage-facts.ts';
import type { CriterionFamily } from './families.ts';
import { codePeriodOf } from './families.ts';
import type { PeriodReading } from './figures.ts';
import type {
	CriterionReading,
	LotReading,
	ModelItem,
	VerifiedRequirement
} from './lot-reading.ts';
import { toLotInput } from './reading.ts';
import { combineAll, decideLot, type CriterionState, type LotDecision } from './verdict.ts';

export interface FirmFacts {
	readonly completedFinancialYears?: number;
	readonly turnover: readonly {
		readonly year: number;
		readonly generalNet?: number;
		readonly specific: readonly { readonly businessLine: string; readonly net?: number }[];
	}[];
	readonly staff: {
		readonly yearlyAverages: readonly { readonly year: number; readonly average?: number }[];
	};
	readonly certificates: readonly { readonly standard: string; readonly validUntil?: string }[];
}

export interface LotContext {
	readonly legalBasis: string;
	// The lot's displayed deadline as an instant, or null when the notice dates none.
	readonly deadline: string | null;
	readonly now: string;
	readonly coverage: LotCoverageInput;
	readonly cancelIntent: boolean;
	readonly reserved: string | undefined;
}

export type OutcomeWhy =
	| 'met'
	| 'short'
	| 'short-restricted'
	| 'route-by-law'
	| 'firm-judges'
	| 'empty-field'
	| 'fewer-years'
	| 'net-below-gross-floor'
	| 'no-comparator'
	| 'no-profile'
	| 'not-named'
	| 'not-held'
	| 'expired'
	| 'undated'
	| 'no-deadline'
	| 'not-assessed'
	| 'request-without-minimum'
	| 'quote-rejected'
	| 'no-amount'
	| 'several-amounts'
	| 'model-number-differs'
	| 'nothing-read'
	| 'insurance'
	| 'kind-disagrees'
	| 'period-disagrees'
	| 'family'
	| 'reserved';

export interface RequirementOutcome {
	// Absent when the family alone decides, whatever the model returned.
	readonly item?: ModelItem;
	readonly state?: CriterionState;
	readonly notCompared: boolean;
	readonly why: OutcomeWhy;
}

export interface CriterionOutcome {
	readonly state?: CriterionState;
	readonly notCompared: boolean;
	readonly requirements: readonly RequirementOutcome[];
}

export interface ReadLotDecision {
	readonly decision: LotDecision;
	readonly criteria: readonly CriterionOutcome[];
}

const decided = (state: CriterionState, why: OutcomeWhy, item?: ModelItem): RequirementOutcome => ({
	...(item && { item }),
	state,
	notCompared: false,
	why
});

const withheld = (why: OutcomeWhy, item?: ModelItem): RequirementOutcome => ({
	...(item && { item }),
	notCompared: true,
	why
});

// The kind the model must give a quote before code compares it under that family's code.
const FAMILY_KINDS: Partial<Record<CriterionFamily, string>> = {
	'turnover-general': 'turnover-general',
	'turnover-specific': 'turnover-specific',
	'staff-average': 'staff-count'
};

function periodDisagrees(code: string, quote: PeriodReading, model: PeriodReading): boolean {
	const coded = codePeriodOf(code);
	if (quote.mode === 'sum') return true;
	if (coded === 'yearly' && quote.mode === 'average') return true;
	if (coded === 'average' && (quote.mode === 'each' || quote.mode === 'any-one')) return true;
	return model.mode !== 'unstated' && model.mode !== quote.mode;
}

function decideFigure(
	reading: CriterionReading,
	requirement: VerifiedRequirement
): RequirementOutcome {
	const { item } = requirement;
	if (item.kind !== FAMILY_KINDS[reading.family]) return withheld('kind-disagrees', item);
	if (periodDisagrees(reading.code, requirement.period, requirement.modelPeriod)) {
		return withheld('period-disagrees', item);
	}
	return decided('NOT_READ', 'nothing-read', item);
}

function decideCertificate(requirement: VerifiedRequirement): RequirementOutcome {
	return decided('SHORT_ROUTE_UNSETTLED', 'not-named', requirement.item);
}

function decideRequirement(
	reading: CriterionReading,
	requirement: VerifiedRequirement
): RequirementOutcome {
	return reading.family === 'certificate'
		? decideCertificate(requirement)
		: decideFigure(reading, requirement);
}

// Families whose state the code alone sets, whatever the model said about the clause.
function familyOutcome(family: CriterionFamily): RequirementOutcome | undefined {
	switch (family) {
		case 'firm-judges':
			return decided('PROFILE_GAP', 'firm-judges');
		case 'insurance':
			return withheld('insurance');
		case 'not-assessed':
			return decided('INFO', 'not-assessed');
		case 'not-compared':
			return withheld('family');
		default:
			return undefined;
	}
}

function outcomeOf(requirements: readonly RequirementOutcome[]): CriterionOutcome {
	const states = requirements.flatMap((each) => (each.state ? [each.state] : []));
	return {
		...(states.length > 0 && { state: combineAll(states) }),
		notCompared: requirements.some((each) => each.notCompared),
		requirements
	};
}

export function decideCriterion(reading: CriterionReading): CriterionOutcome {
	const byFamily = familyOutcome(reading.family);
	if (byFamily) return outcomeOf([byFamily]);
	return outcomeOf(reading.verified.map((requirement) => decideRequirement(reading, requirement)));
}

export function decideReadLot(
	reading: LotReading,
	firm: FirmFacts | null,
	context: LotContext
): ReadLotDecision {
	const criteria = reading.criteria.map((criterion) => decideCriterion(criterion));
	const states = criteria.flatMap((outcome) => (outcome.state ? [outcome.state] : []));
	const notCompared = criteria.some((outcome) => outcome.notCompared);
	return {
		decision: decideLot({ ...toLotInput(context.coverage, states), notCompared }),
		criteria
	};
}

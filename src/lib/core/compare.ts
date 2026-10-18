// The one place a criterion meets a firm's figures (SPEC R5, VERD-02). The state comes from the
// criterion code's family, the figures code read from the verified quote and the firm's own
// figures; the model's kind, number, period and mandatory flag can only withhold a comparison,
// never choose its result. Profile-shaped by structure only: no module here imports src/lib/profile.
import type { LotCoverageInput } from './coverage-facts.ts';
import { SERVER_TIME_ZONE, cetDayEnd, formatDay } from './deadline.ts';
import { codePeriodOf, type CriterionFamily } from './families.ts';
import type { CountReading, MoneyReading, PeriodReading } from './figures.ts';
import type {
	CriterionReading,
	LotReading,
	LotStatus,
	ModelItem,
	VerifiedRequirement
} from './lot-reading.ts';
import { toLotInput } from './reading.ts';
import {
	combineAll,
	combineAny,
	decideLot,
	type CriterionState,
	type LotDecision
} from './verdict.ts';

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
	| 'period-unstated'
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
	| 'mixed-standards'
	| 'model-number-differs'
	| 'nothing-read'
	| 'insurance'
	| 'kind-disagrees'
	| 'period-disagrees'
	| 'family'
	| 'optional'
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
	readonly reservation: RequirementOutcome | null;
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
	'staff-average': 'staff-count',
	certificate: 'certificate'
};

function periodDisagrees(code: string, quote: PeriodReading, model: PeriodReading): boolean {
	const coded = codePeriodOf(code);
	if (quote.mode === 'sum') return true;
	if (coded === 'yearly' && quote.mode === 'average') return true;
	if (coded === 'average' && (quote.mode === 'each' || quote.mode === 'any-one')) return true;
	return model.mode !== 'unstated' && model.mode !== quote.mode;
}

type OneMoney = Extract<MoneyReading, { kind: 'one' }>;
type OneCount = Extract<CountReading, { kind: 'one' }>;

type Check =
	'pass' | 'fail' | 'missing' | 'no-comparator' | 'net-below-gross-floor' | 'period-unstated';

// One principle behind every MET and every certain shortfall: MET only when the figure meets the
// floor under every reading the text allows, a certain shortfall only when it fails under every
// reading, and anything between is PROFILE_GAP. A profile figure is net, so it settles a gross or
// unstated floor only from above; equality settles only an "at least" floor, or a "more than" one
// against the firm.
function checkMoney(figure: bigint, floor: bigint, money: OneMoney): Check {
	if (figure > floor || (figure === floor && money.comparator === 'at-least')) return 'pass';
	if (money.basis === 'net' && (figure < floor || money.comparator === 'more-than')) return 'fail';
	return figure === floor && money.comparator === 'unstated'
		? 'no-comparator'
		: 'net-below-gross-floor';
}

// figures.ts reads no comparator for a count, so a headcount equal to its floor is never settled.
// Yearly averages are fractions summed as floats; a sum within a billionth of the floor counts as
// equal, far wider than the rounding of a few additions and far narrower than any real headcount.
function checkCount(figure: number, floor: number): Check {
	const slack = 1e-9 * Math.max(1, floor);
	if (figure > floor + slack) return 'pass';
	if (figure < floor - slack) return 'fail';
	return 'no-comparator';
}

interface Scale<T> {
	add(left: T, right: T): T;
	times(floor: T, years: number): T;
	check(figure: T, floor: T): Check;
}

const moneyScale = (money: OneMoney): Scale<bigint> => ({
	add: (left, right) => left + right,
	times: (floor, years) => floor * BigInt(years),
	check: (figure, floor) => checkMoney(figure, floor, money)
});

const COUNT_SCALE: Scale<number> = {
	add: (left, right) => left + right,
	times: (floor, years) => floor * years,
	check: checkCount
};

const gapOf = (checks: readonly Check[]): Check =>
	checks.includes('missing')
		? 'missing'
		: (checks.find((check) => check !== 'pass' && check !== 'fail') ?? 'period-unstated');

// An average is never divided: the sum of the years is compared with the floor times the years,
// so no rounding can carry a figure over the floor.
function checkYears<T>(
	mode: PeriodReading['mode'],
	figures: readonly (T | undefined)[],
	floor: T,
	scale: Scale<T>
): Check {
	const known = figures.filter((figure): figure is T => figure !== undefined);
	if (mode === 'average') {
		if (known.length < figures.length) return 'missing';
		return scale.check(known.reduce(scale.add), scale.times(floor, figures.length));
	}
	const checks = figures.map((figure) =>
		figure === undefined ? 'missing' : scale.check(figure, floor)
	);
	const passed = checks.filter((check) => check === 'pass').length;
	const failed = checks.filter((check) => check === 'fail').length;
	if (mode === 'each') {
		if (failed > 0) return 'fail';
		return passed === checks.length ? 'pass' : gapOf(checks);
	}
	if (mode === 'any-one' && passed > 0) return 'pass';
	if (passed === checks.length) return 'pass';
	return failed === checks.length ? 'fail' : gapOf(checks);
}

const yearOf = (instant: string): number => Number(formatDay(instant, SERVER_TIME_ZONE).slice(-4));

// The years a floor covers: those the quote names, else the last N completed years before the
// year of the lot's deadline, ending at the latest year the firm holds a figure for. N is the
// quote's count, or 3 when the text states none: Directive 2014/24/EU Annex XII Part I point (c)
// reads a turnover statement over at most the last three financial years available.
function windowOf(
	period: PeriodReading,
	held: readonly number[],
	context: LotContext
): number[] | undefined {
	if (period.named.length > 0) return [...new Set(period.named)];
	const before = yearOf(context.deadline ?? context.now);
	const latest = Math.max(...held.filter((year) => year < before));
	if (!Number.isFinite(latest)) return undefined;
	return Array.from({ length: period.years || 3 }, (_, index) => latest - index);
}

function shortfall(item: ModelItem, context: LotContext, restricted: boolean): RequirementOutcome {
	// Article 63 of Directive 2014/24/EU lets a firm meet a turnover or staff floor through another
	// firm; the other directives' routes are not settled for this version (REQUIREMENTS.md
	// "Partner route by legal basis"), so the one Article 63 line shows only under 2014/24/EU.
	if (context.legalBasis !== '32014L0024')
		return decided('SHORT_ROUTE_UNSETTLED', 'route-by-law', item);
	return restricted
		? decided('SHORT_ROUTE_UNSETTLED', 'short-restricted', item)
		: decided('SHORT_BORROWABLE', 'short', item);
}

function fromCheck(
	check: Check,
	item: ModelItem,
	context: LotContext,
	restricted: boolean
): RequirementOutcome {
	if (check === 'pass') return decided('MET', 'met', item);
	if (check === 'fail') return shortfall(item, context, restricted);
	return decided('PROFILE_GAP', check === 'missing' ? 'empty-field' : check, item);
}

function turnoverCheck(
	requirement: VerifiedRequirement,
	money: OneMoney,
	firm: FirmFacts,
	context: LotContext,
	code: string
): Check | 'fewer-years' {
	const held = new Map(
		firm.turnover.flatMap((row) =>
			row.generalNet === undefined ? [] : [[row.year, BigInt(row.generalNet) * 100n] as const]
		)
	);
	const window = windowOf(requirement.period, [...held.keys()], context);
	if (window === undefined) return 'missing';
	const completed = firm.completedFinancialYears;
	if (completed !== undefined && completed < window.length) return 'fewer-years';
	const mode = codePeriodOf(code) === 'average' ? 'average' : requirement.period.mode;
	const figures = window.map((year) => held.get(year));
	return checkYears(mode, figures, BigInt(money.cents), moneyScale(money));
}

function staffCheck(
	requirement: VerifiedRequirement,
	count: number,
	firm: FirmFacts,
	context: LotContext
): Check {
	const held = new Map(
		firm.staff.yearlyAverages.flatMap((row) =>
			row.average === undefined ? [] : [[row.year, row.average] as const]
		)
	);
	const window = windowOf(requirement.period, [...held.keys()], context);
	if (window === undefined) return 'missing';
	const figures = window.map((year) => held.get(year));
	return checkYears(requirement.period.mode, figures, count, COUNT_SCALE);
}

// The amount, and the model's agreement with it, before any figure of the firm is read.
function readFigure(
	reading: CriterionReading,
	requirement: VerifiedRequirement
): RequirementOutcome | undefined {
	const { item } = requirement;
	if (item.kind !== FAMILY_KINDS[reading.family]) return withheld('kind-disagrees', item);
	if (periodDisagrees(reading.code, requirement.period, requirement.modelPeriod)) {
		return withheld('period-disagrees', item);
	}
	const staff = reading.family === 'staff-average';
	const amount = staff ? requirement.count : requirement.money;
	if (amount.kind === 'several') return decided('NOT_READ', 'several-amounts', item);
	if (amount.kind === 'none') {
		return reading.textHasAmount
			? decided('NOT_READ', 'no-amount', item)
			: decided('INFO', 'request-without-minimum', item);
	}
	const agrees = staff ? requirement.modelNumber.count : requirement.modelNumber.money;
	return agrees ? undefined : decided('NOT_READ', 'model-number-differs', item);
}

function decideFigure(
	reading: CriterionReading,
	requirement: VerifiedRequirement,
	firm: FirmFacts | null,
	context: LotContext,
	restricted: boolean
): RequirementOutcome {
	const { item, money, count } = requirement;
	const unread = readFigure(reading, requirement);
	if (unread) return unread;
	if (firm === null) return decided('PROFILE_GAP', 'no-profile', item);
	// readFigure has returned for every amount that is not a single one.
	if (reading.family === 'staff-average') {
		const floor = (count as OneCount).count;
		return fromCheck(staffCheck(requirement, floor, firm, context), item, context, restricted);
	}
	const check = turnoverCheck(requirement, money as OneMoney, firm, context, reading.code);
	if (check === 'fewer-years') return decided('PROFILE_GAP', 'fewer-years', item);
	// Specific turnover is at most general turnover, so a general figure can prove a shortfall but
	// never a pass: only the firm can tell which business line fits the buyer's field.
	if (check === 'pass' && reading.family === 'turnover-specific') {
		return decided('PROFILE_GAP', 'firm-judges', item);
	}
	return fromCheck(check, item, context, restricted);
}

// Names are folded for case and whitespace only: "ISO 27001" is not "ISO/IEC 27001:2022".
const foldName = (name: string) => name.toLowerCase().replace(/\s+/gu, ' ').trim();

function certificateState(
	standard: string,
	firm: FirmFacts,
	context: LotContext
): { state: CriterionState; why: OutcomeWhy } {
	const held = firm.certificates.find((each) => foldName(each.standard) === foldName(standard));
	if (held === undefined) return { state: 'SHORT_ROUTE_UNSETTLED', why: 'not-held' };
	if (held.validUntil === undefined) return { state: 'PROFILE_GAP', why: 'undated' };
	if (context.deadline === null) return { state: 'PROFILE_GAP', why: 'no-deadline' };
	// Valid through its last day in the zone the deadlines are shown in, so a deadline late on that
	// day's evening, already the next day in UTC terms or not, is judged by the Amsterdam day.
	return Date.parse(context.deadline) <= cetDayEnd(held.validUntil).getTime()
		? { state: 'MET', why: 'met' }
		: { state: 'SHORT_ROUTE_UNSETTLED', why: 'expired' };
}

function decideCertificate(
	requirement: VerifiedRequirement,
	firm: FirmFacts | null,
	context: LotContext
): RequirementOutcome {
	const { item } = requirement;
	// As readFigure does for a figure: a quote the model read as another kind may name a standard
	// in passing ("references from ISO 27001 projects"), so it is never compared as a certificate.
	if (item.kind !== FAMILY_KINDS.certificate) return withheld('kind-disagrees', item);
	if (firm === null) return decided('PROFILE_GAP', 'no-profile', item);
	if (firm.certificates.length === 0) return decided('PROFILE_GAP', 'empty-field', item);
	const { standards, join } = requirement.standards;
	if (standards.length === 0) return decided('SHORT_ROUTE_UNSETTLED', 'not-named', item);
	if (join === 'mixed') return decided('NOT_READ', 'mixed-standards', item);
	const each = standards.map((standard) => certificateState(standard, firm, context));
	const states = each.map((outcome) => outcome.state);
	const state = (join === 'any' ? combineAny : combineAll)(states);
	return decided(state, each[states.indexOf(state)].why, item);
}

// Families whose state the code alone sets, whatever the model said about the clause.
function familyOutcome(
	family: CriterionFamily,
	firm: FirmFacts | null
): RequirementOutcome | undefined {
	switch (family) {
		case 'firm-judges':
			return decided('PROFILE_GAP', firm === null ? 'no-profile' : 'firm-judges');
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

export function decideCriterion(
	reading: CriterionReading,
	firm: FirmFacts | null,
	context: LotContext,
	restricted: boolean
): CriterionOutcome {
	const byFamily = familyOutcome(reading.family, firm);
	if (byFamily) return outcomeOf([byFamily]);
	const requirements = [
		...reading.verified.map((requirement) => {
			// The model marks an item optional, scored or a request for information (the prompt in
			// token-factory.ts), so such an item is never compared and cannot set a shortfall.
			if (requirement.item.mandatory !== true) return withheld('optional', requirement.item);
			return reading.family === 'certificate'
				? decideCertificate(requirement, firm, context)
				: decideFigure(reading, requirement, firm, context, restricted);
		}),
		...reading.rejected.map(({ item }) => decided('NOT_READ', 'quote-rejected', item))
	];
	return outcomeOf(requirements.length > 0 ? requirements : [decided('NOT_READ', 'nothing-read')]);
}

const UNREAD_LOT = { criteria: [], reservation: null } as const;

// The one per-lot dispatch the browser verdict and the home figure share. A lot with no stored
// reading keeps the phase 1 view (null), except that a buyer's intent to cancel still asks first;
// a lot the readings do not list at all was never sent, so it stays the phase 1 view regardless.
export function decideLotStatus(
	status: LotStatus,
	firm: FirmFacts | null,
	context: LotContext
): ReadLotDecision | null {
	switch (status.status) {
		case 'read':
			return decideReadLot(status.reading, firm, context);
		case 'no-criteria': {
			const input = { ...toLotInput(context.coverage, []), cancelIntent: context.cancelIntent };
			return { decision: decideLot(input), ...UNREAD_LOT };
		}
		case 'not-read':
			return context.cancelIntent
				? { decision: { verdict: 'ASK FIRST', reason: 'cancel-intent' }, ...UNREAD_LOT }
				: null;
		case 'unlisted':
			return null;
	}
}

export function decideReadLot(
	reading: LotReading,
	firm: FirmFacts | null,
	context: LotContext
): ReadLotDecision {
	const criteria = reading.criteria.map((criterion) =>
		decideCriterion(criterion, firm, context, reading.relianceRestricted)
	);
	const states = criteria.flatMap((outcome) => (outcome.state ? [outcome.state] : []));
	// An item naming a criterion the lot lacks was not read: it withholds the lot's GO as a rejected
	// quote withholds its criterion's, with no clause of the lot to show it under.
	const unplaced: CriterionState[] = reading.unplaced.length > 0 ? ['NOT_READ'] : [];
	// A reserved lot (BT-71) is open only to firms the profile does not describe, and a lot that
	// declares no code at all is unknown, never read as "none".
	const reservation = context.reserved === 'none' ? null : withheld('reserved');
	const notCompared = reservation !== null || criteria.some((outcome) => outcome.notCompared);
	return {
		decision: decideLot({
			...toLotInput(context.coverage, [...states, ...unplaced]),
			notCompared,
			cancelIntent: context.cancelIntent
		}),
		criteria,
		reservation
	};
}

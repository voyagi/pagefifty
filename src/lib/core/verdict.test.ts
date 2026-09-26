import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
	ASK_FIRST_REASONS,
	ASK_FIRST_REASON_LABELS,
	COVERAGE_FACTS,
	CRITERION_STATES,
	LOT_VERDICTS,
	STATE_SEVERITY,
	VERDICT_LABELS,
	combineAll,
	combineAny,
	decideLot,
	isCriterionState,
	type AskFirstReason,
	type CoverageFact,
	type CriterionState,
	type LotDecision,
	type LotInput,
	type LotVerdict
} from './verdict';

// Written out here rather than read from the module, so a reordered export fails a test instead
// of silently moving the oracle along with the code.
const MOST_SEVERE_FIRST = ['NO-GO', 'PARTNER NEEDED', 'ASK FIRST', 'GO'] as const;
const REASON_PRECEDENCE = [
	'route-unsettled',
	'profile-field-missing',
	'not-read',
	'criteria-in-documents',
	'no-criteria-in-notice'
] as const;
const READ_AND_MET: readonly CriterionState[] = ['MET', 'MET_WITH_TASK', 'INFO'];

function lot(
	states: readonly CriterionState[],
	source: Partial<Omit<LotInput, 'states'>> = {}
): LotInput {
	return { states, facts: [], noticeIsOnlySource: true, pointsToDocuments: false, ...source };
}

const rank = (verdict: LotVerdict): number => MOST_SEVERE_FIRST.indexOf(verdict);

function multisets(size: number, from = 0): CriterionState[][] {
	if (size === 0) return [[]];
	const found: CriterionState[][] = [];
	for (let index = from; index < CRITERION_STATES.length; index++) {
		for (const rest of multisets(size - 1, index)) found.push([CRITERION_STATES[index], ...rest]);
	}
	return found;
}

const STATE_MULTISETS = [0, 1, 2, 3].flatMap((size) => multisets(size));
const FACT_SUBSETS = COVERAGE_FACTS.reduce<CoverageFact[][]>(
	(subsets, fact) => [...subsets, ...subsets.map((subset) => [...subset, fact])],
	[[]]
);
const SOURCE_FLAGS = [
	{ noticeIsOnlySource: true, pointsToDocuments: false },
	{ noticeIsOnlySource: true, pointsToDocuments: true },
	{ noticeIsOnlySource: false, pointsToDocuments: false },
	{ noticeIsOnlySource: false, pointsToDocuments: true }
] as const;

function everyLotAround(states: readonly CriterionState[]): LotInput[] {
	return FACT_SUBSETS.flatMap((facts) =>
		SOURCE_FLAGS.map((flags) => lot(states, { facts, ...flags }))
	);
}

// The lot verdict table, one row per verdict and one entry per ASK FIRST reason, each clause as the
// table states it. The code decides by a chain of checks; this reads every row and keeps the most
// severe that applies, so the enumeration compares two readings of the verdict rows. The reason
// entries are written the same way as the module's, so they check only the precedence between
// reasons: each reason's own clause is pinned by the hand-written cases further down.
function tableDecision(input: LotInput): LotDecision {
	const any = (state: CriterionState) => input.states.includes(state);
	const fact = (name: CoverageFact) => input.facts.includes(name);
	const reasons: Record<AskFirstReason, boolean> = {
		'route-unsettled': any('SHORT_ROUTE_UNSETTLED'),
		'profile-field-missing': any('PROFILE_GAP'),
		'not-read': any('NOT_READ'),
		'criteria-in-documents':
			fact('SOURCE_UNREAD') || !input.noticeIsOnlySource || input.pointsToDocuments,
		'no-criteria-in-notice': fact('NO_CRITERIA') || input.states.length === 0
	};
	const rows: Record<LotVerdict, boolean> = {
		'NO-GO': any('SHORT_FIXED'),
		'PARTNER NEEDED': any('SHORT_BORROWABLE') && !any('SHORT_FIXED'),
		'ASK FIRST': Object.values(reasons).some(Boolean),
		GO:
			input.noticeIsOnlySource &&
			input.states.length > 0 &&
			input.states.every((state) => READ_AND_MET.includes(state)) &&
			!input.pointsToDocuments &&
			input.facts.length === 0
	};
	const verdict = MOST_SEVERE_FIRST.find((candidate) => rows[candidate]);
	if (verdict === undefined)
		throw new Error(`no row of the table applies to ${JSON.stringify(input)}`);
	if (verdict !== 'ASK FIRST') return { verdict };
	const reason = REASON_PRECEDENCE.find((candidate) => reasons[candidate]) as AskFirstReason;
	return { verdict, reason };
}

describe('closed names', () => {
	it('lists the eight criterion states and the two coverage facts', () => {
		expect([...CRITERION_STATES]).toEqual([
			'MET',
			'MET_WITH_TASK',
			'INFO',
			'SHORT_BORROWABLE',
			'SHORT_FIXED',
			'SHORT_ROUTE_UNSETTLED',
			'PROFILE_GAP',
			'NOT_READ'
		]);
		expect([...COVERAGE_FACTS]).toEqual(['NO_CRITERIA', 'SOURCE_UNREAD']);
	});

	it('orders the verdicts most severe first and the reasons by precedence', () => {
		expect([...LOT_VERDICTS]).toEqual([...MOST_SEVERE_FIRST]);
		expect([...ASK_FIRST_REASONS]).toEqual([...REASON_PRECEDENCE]);
	});

	it('ranks every criterion state exactly once, shortfalls first and INFO last', () => {
		expect([...STATE_SEVERITY]).toEqual([
			'SHORT_FIXED',
			'SHORT_BORROWABLE',
			'SHORT_ROUTE_UNSETTLED',
			'PROFILE_GAP',
			'NOT_READ',
			'MET_WITH_TASK',
			'MET',
			'INFO'
		]);
		expect([...STATE_SEVERITY].sort()).toEqual([...CRITERION_STATES].sort());
	});

	it('isCriterionState accepts exactly the eight state names', () => {
		for (const state of CRITERION_STATES) expect(isCriterionState(state), state).toBe(true);
	});

	// No normalisation path exists: a lookup is by exact key or it fails.
	it.each(['met', 'MET ', 'Met', ' MET', 'not_read', 'NO-GO', 'NO_CRITERIA', '', 'toString'])(
		'isCriterionState refuses %j',
		(value) => {
			expect(isCriterionState(value)).toBe(false);
		}
	);

	it.each([undefined, null, 1, true, {}, ['MET']])(
		'isCriterionState refuses the non-string %j',
		(value) => {
			expect(isCriterionState(value)).toBe(false);
		}
	);

	it('VERDICT_LABELS has exactly the four verdict keys, each with its display words', () => {
		expect(Object.keys(VERDICT_LABELS).sort()).toEqual([...MOST_SEVERE_FIRST].sort());
		expect(VERDICT_LABELS).toEqual({
			GO: 'Go',
			'PARTNER NEEDED': 'Not met alone',
			'ASK FIRST': 'Ask first',
			'NO-GO': 'No-go'
		});
	});

	it('ASK_FIRST_REASON_LABELS has exactly the five reasons, each with its display words', () => {
		expect(Object.keys(ASK_FIRST_REASON_LABELS).sort()).toEqual([...REASON_PRECEDENCE].sort());
		expect(ASK_FIRST_REASON_LABELS).toEqual({
			'route-unsettled': 'Route not settled',
			'profile-field-missing': 'A profile field is missing',
			'not-read': 'Not read',
			'criteria-in-documents': 'Criteria in the ESPD or the documents',
			'no-criteria-in-notice': 'No criteria in the notice'
		});
	});

	it('labels are looked up by exact key only', () => {
		const labels: Record<string, string> = VERDICT_LABELS;
		expect(labels['go']).toBeUndefined();
		expect(labels['GO ']).toBeUndefined();
		expect(Object.hasOwn(ASK_FIRST_REASON_LABELS, 'Not read')).toBe(false);
	});
});

describe('decideLot', () => {
	it('matches the verdict table on every lot of up to three criteria, every coverage fact and both source flags', () => {
		expect(STATE_MULTISETS).toHaveLength(165);
		expect(FACT_SUBSETS).toHaveLength(4);
		let cases = 0;
		for (const states of STATE_MULTISETS) {
			for (const input of everyLotAround(states)) {
				expect(decideLot(input), JSON.stringify(input)).toEqual(tableDecision(input));
				cases++;
			}
		}
		expect(cases).toBe(2640);
	});

	it('any SHORT_FIXED gives NO-GO', () => {
		const withFixed = STATE_MULTISETS.filter((states) => states.includes('SHORT_FIXED'));
		expect(withFixed.length).toBeGreaterThan(0);
		for (const states of withFixed) {
			for (const input of everyLotAround(states)) {
				expect(decideLot(input), JSON.stringify(input)).toEqual({ verdict: 'NO-GO' });
			}
		}
	});

	it('NO-GO wins over PARTNER NEEDED', () => {
		for (const states of [
			['SHORT_FIXED', 'SHORT_BORROWABLE'],
			['SHORT_BORROWABLE', 'SHORT_FIXED'],
			['MET', 'SHORT_BORROWABLE', 'SHORT_FIXED']
		] as const) {
			expect(decideLot(lot(states)), states.join()).toEqual({ verdict: 'NO-GO' });
		}
	});

	it('any SHORT_BORROWABLE without SHORT_FIXED gives PARTNER NEEDED, whatever else is open', () => {
		for (const states of STATE_MULTISETS) {
			if (!states.includes('SHORT_BORROWABLE') || states.includes('SHORT_FIXED')) continue;
			for (const input of everyLotAround(states)) {
				expect(decideLot(input), JSON.stringify(input)).toEqual({ verdict: 'PARTNER NEEDED' });
			}
		}
	});

	it('INFO never makes a lot worse than GO', () => {
		for (const states of STATE_MULTISETS) {
			if (states.length === 0 || states.length > 2) continue;
			for (const input of everyLotAround(states)) {
				const withInfo = { ...input, states: [...input.states, 'INFO' as const] };
				expect(decideLot(withInfo), JSON.stringify(withInfo)).toEqual(decideLot(input));
			}
		}
		expect(decideLot(lot(['MET', 'INFO']))).toEqual({ verdict: 'GO' });
	});

	it('a lot with one MET and one INFO and nothing else, BT-821 notice, reads GO', () => {
		expect(decideLot(lot(['MET', 'INFO']))).toEqual({ verdict: 'GO' });
		expect(decideLot(lot(['INFO', 'MET']))).toEqual({ verdict: 'GO' });
	});

	// The GO row counts INFO as read and met, so a lot whose only criteria carry no threshold reads
	// GO. That is how the table reads today; phase 2 may decide such a lot should ask first instead.
	it.each([[['INFO']], [['INFO', 'INFO']], [['INFO', 'INFO', 'INFO']]] as const)(
		'a lot whose only criteria are INFO reads GO under the notice-only source: %j',
		(states) => {
			expect(decideLot(lot(states))).toEqual({ verdict: 'GO' });
		}
	);

	it('an empty lot with BT-821 notice is ASK FIRST, no criteria in the notice', () => {
		expect(decideLot(lot([]))).toEqual({ verdict: 'ASK FIRST', reason: 'no-criteria-in-notice' });
	});

	it('a NO_CRITERIA fact asks first even beside a met criterion', () => {
		expect(decideLot(lot(['MET'], { facts: ['NO_CRITERIA'] }))).toEqual({
			verdict: 'ASK FIRST',
			reason: 'no-criteria-in-notice'
		});
	});

	it('the empty lot is the named exception to monotonicity: one met criterion turns it into GO', () => {
		expect(decideLot(lot([])).verdict).toBe('ASK FIRST');
		expect(decideLot(lot(['MET'])).verdict).toBe('GO');
	});

	it('SOURCE_UNREAD blocks GO', () => {
		for (const states of [['MET'], ['MET_WITH_TASK', 'INFO'], ['INFO']] as const) {
			expect(decideLot(lot(states, { facts: ['SOURCE_UNREAD'] })), states.join()).toEqual({
				verdict: 'ASK FIRST',
				reason: 'criteria-in-documents'
			});
		}
	});

	it('a criterion pointing to the documents blocks GO', () => {
		for (const states of [['MET'], ['MET_WITH_TASK', 'INFO'], ['INFO']] as const) {
			expect(decideLot(lot(states, { pointsToDocuments: true })), states.join()).toEqual({
				verdict: 'ASK FIRST',
				reason: 'criteria-in-documents'
			});
		}
	});

	it('a lot whose BT-821 names more than the notice is not GO', () => {
		expect(decideLot(lot(['MET'], { noticeIsOnlySource: false }))).toEqual({
			verdict: 'ASK FIRST',
			reason: 'criteria-in-documents'
		});
	});

	it('GO is returned only when every part of the GO rule holds', () => {
		for (const states of STATE_MULTISETS) {
			for (const input of everyLotAround(states)) {
				const go =
					input.noticeIsOnlySource &&
					input.states.length > 0 &&
					input.states.every((state) => READ_AND_MET.includes(state)) &&
					!input.pointsToDocuments &&
					input.facts.length === 0;
				expect(decideLot(input).verdict === 'GO', JSON.stringify(input)).toBe(go);
			}
		}
	});

	it.each([
		[['SHORT_ROUTE_UNSETTLED', 'PROFILE_GAP', 'NOT_READ'], 'route-unsettled'],
		[['PROFILE_GAP', 'NOT_READ'], 'profile-field-missing'],
		[['NOT_READ'], 'not-read'],
		[['MET'], 'criteria-in-documents']
	] as const)('picks the first reason that applies: %j reads %s', (states, reason) => {
		const input = lot(states, {
			facts: ['NO_CRITERIA', 'SOURCE_UNREAD'],
			noticeIsOnlySource: false,
			pointsToDocuments: true
		});
		expect(decideLot(input)).toEqual({ verdict: 'ASK FIRST', reason });
	});

	it("severity ties: two criteria of equal state give that state's verdict once", () => {
		let cases = 0;
		for (const state of CRITERION_STATES) {
			for (const input of everyLotAround([state])) {
				const once = decideLot(input);
				expect(decideLot({ ...input, states: [state, state] }), JSON.stringify(input)).toEqual(
					once
				);
				expect(
					decideLot({ ...input, states: [state, state, state] }),
					JSON.stringify(input)
				).toEqual(once);
				cases++;
			}
		}
		expect(cases).toBe(128);
	});

	const stateArb = fc.constantFrom(...CRITERION_STATES);
	const sourceArb = fc.record({
		facts: fc.subarray([...COVERAGE_FACTS]),
		noticeIsOnlySource: fc.boolean(),
		pointsToDocuments: fc.boolean()
	});

	test.prop([fc.array(stateArb, { minLength: 1, maxLength: 6 }), stateArb, sourceArb])(
		'adding a criterion to a lot that already has one never makes it less severe',
		(states, added, source) => {
			const before = decideLot(lot(states, source));
			const after = decideLot(lot([...states, added], source));
			expect(rank(after.verdict)).toBeLessThanOrEqual(rank(before.verdict));
		}
	);

	test.prop([
		fc
			.array(stateArb, { maxLength: 6 })
			.chain((states) =>
				fc.tuple(fc.constant(states), fc.shuffledSubarray(states, { minLength: states.length }))
			),
		sourceArb
	])(
		'gives the same decision, reason included, for any order of the same criteria',
		([states, shuffled], source) => {
			expect(decideLot(lot(shuffled, source))).toEqual(decideLot(lot(states, source)));
		}
	);
});

describe('combineAll and combineAny', () => {
	const stateArb = fc.constantFrom(...CRITERION_STATES);
	const nonEmpty = fc.array(stateArb, { minLength: 1, maxLength: 6 });
	const severity = (state: CriterionState) => STATE_SEVERITY.indexOf(state);

	it('an empty clause was not read', () => {
		expect(combineAll([])).toBe('NOT_READ');
		expect(combineAny([])).toBe('NOT_READ');
	});

	it('"and" takes the worst and alternatives take the best', () => {
		expect(combineAll(['MET', 'SHORT_BORROWABLE', 'PROFILE_GAP'])).toBe('SHORT_BORROWABLE');
		expect(combineAny(['SHORT_FIXED', 'MET_WITH_TASK', 'NOT_READ'])).toBe('MET_WITH_TASK');
		expect(combineAll(['MET', 'INFO'])).toBe('MET');
		expect(combineAny(['MET', 'INFO'])).toBe('INFO');
	});

	test.prop([nonEmpty])('combineAll returns the most severe member', (states) => {
		const worst = combineAll(states);
		expect(states).toContain(worst);
		for (const state of states) expect(severity(state)).toBeGreaterThanOrEqual(severity(worst));
	});

	test.prop([nonEmpty])('combineAny returns the least severe member', (states) => {
		const best = combineAny(states);
		expect(states).toContain(best);
		for (const state of states) expect(severity(state)).toBeLessThanOrEqual(severity(best));
	});

	for (const [name, combine] of [
		['combineAll', combineAll],
		['combineAny', combineAny]
	] as const) {
		test.prop([stateArb, stateArb])(`${name} is commutative`, (left, right) => {
			expect(combine([left, right])).toBe(combine([right, left]));
		});

		test.prop([nonEmpty, nonEmpty])(`${name} is associative`, (left, right) => {
			expect(combine([...left, ...right])).toBe(combine([combine(left), combine(right)]));
		});

		test.prop([stateArb])(`${name} is idempotent`, (state) => {
			expect(combine([state, state])).toBe(state);
		});
	}
});

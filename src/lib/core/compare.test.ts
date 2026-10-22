import { readFileSync } from 'node:fs';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { DEMO_PROFILE } from '../profile/demo-firm';
import { emptyProfile } from '../profile/schema';
import { readNotice } from '../ingest/read-notice';
import type { LotRecord, NoticeRecord } from '../ingest/record';
import { capturePath } from '../../test/fixtures/node';
import { replyRequirements } from '../../test/fixtures/replies';
import { summarizeLot } from './coverage-facts';
import { displayedDeadline } from './deadline';
import { familyOf, type CriterionFamily } from './families';
import {
	readLot,
	type LotCriterion,
	type LotReading,
	type LotStatus,
	type ModelItem
} from './lot-reading';
import {
	decideCriterion,
	decideLotStatus,
	decideReadLot,
	type CriterionOutcome,
	type FirmFacts,
	type LotContext,
	type OutcomeWhy,
	type RequirementOutcome
} from './compare';
import type { CriterionState } from './verdict';

const CAPTURE_NOW = '2026-09-15T12:00:00Z';

function trackedLot(notice: string, lotId: string): { record: NoticeRecord; lot: LotRecord } {
	const result = readNotice(new Uint8Array(readFileSync(capturePath(notice))), {
		noticeNumber: notice
	});
	if (!result.ok) throw new Error(`${notice} did not read: ${result.kind}, ${result.detail}`);
	const lot = result.record.lots.find((each) => each.id === lotId);
	if (!lot) throw new Error(`${notice} has no ${lotId}`);
	return { record: result.record, lot };
}

function contextOf(record: NoticeRecord, lot: LotRecord): LotContext {
	const shown = displayedDeadline(lot);
	return {
		legalBasis: record.legalBasis,
		deadline: shown.kind === 'in-notice' ? null : shown.instant,
		now: CAPTURE_NOW,
		coverage: summarizeLot(lot),
		cancelIntent: record.cancelIntent === true,
		reserved: lot.reserved
	};
}

const outline = (outcome: CriterionOutcome) => ({
	state: outcome.state,
	notCompared: outcome.notCompared,
	why: outcome.requirements.map((requirement: RequirementOutcome) => requirement.why)
});

describe('the two lots spike 004 read, decided for the demo firm', () => {
	it('the German lot spike 004 read decides ASK FIRST profile-field-missing for the demo firm', () => {
		const { record, lot } = trackedLot('610242-2026', 'LOT-0000');
		expect(lot.criteria.map((criterion) => criterion.code)).toEqual([
			'slc-suit-reg-trade',
			'slc-suit-reg-prof',
			'slc-stand-to-spec',
			'slc-stand-ins',
			'slc-abil-staff-qual',
			'slc-abil-ref-services'
		]);
		const reading = readLot({
			criteria: lot.criteria,
			items: replyRequirements('de-610242-thinking-off')
		});
		const decided = decideReadLot(reading, DEMO_PROFILE, contextOf(record, lot));
		expect(decided.criteria.map(outline)).toEqual([
			{ state: 'INFO', notCompared: false, why: ['not-assessed'] },
			{ state: 'INFO', notCompared: false, why: ['not-assessed'] },
			{ state: undefined, notCompared: true, why: ['period-disagrees'] },
			{ state: undefined, notCompared: true, why: ['insurance'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] }
		]);
		expect(decided.decision).toEqual({ verdict: 'ASK FIRST', reason: 'profile-field-missing' });
	});

	it('the Dutch lot spike 004 read decides ASK FIRST route-unsettled for the demo firm', () => {
		const { record, lot } = trackedLot('634398-2026', 'LOT-0001');
		expect(lot.criteria.map((criterion) => criterion.code)).toEqual([
			'slc-stand-to-gen',
			'slc-abil-ref-services',
			'slc-abil-staff-qual',
			'slc-sche-qu-cert-indep',
			'slc-stand-other'
		]);
		const reading = readLot({
			criteria: lot.criteria,
			items: replyRequirements('nl-634398-super')
		});
		const decided = decideReadLot(reading, DEMO_PROFILE, contextOf(record, lot));
		expect(decided.criteria.map(outline)).toEqual([
			{ state: undefined, notCompared: true, why: ['kind-disagrees'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] },
			{ state: 'PROFILE_GAP', notCompared: false, why: ['firm-judges'] },
			{ state: 'SHORT_ROUTE_UNSETTLED', notCompared: false, why: ['not-named'] },
			{ state: undefined, notCompared: true, why: ['family'] }
		]);
		expect(decided.decision).toEqual({ verdict: 'ASK FIRST', reason: 'route-unsettled' });
	});
});

describe('the buyer intent to cancel and the lot reading status', () => {
	const { record, lot } = trackedLot('610242-2026', 'LOT-0000');
	const reading = readLot({
		criteria: lot.criteria,
		items: replyRequirements('de-610242-thinking-off')
	});
	const context = contextOf(record, lot);
	const cancelled = { ...context, cancelIntent: true };
	const askCancel = { verdict: 'ASK FIRST', reason: 'cancel-intent' };

	it('a cancel-intent lot read for the demo firm is ASK FIRST cancel-intent', () => {
		expect(decideReadLot(reading, DEMO_PROFILE, context).decision.verdict).toBe('ASK FIRST');
		const decidedLot = decideReadLot(reading, DEMO_PROFILE, cancelled);
		expect(decidedLot.decision).toEqual(askCancel);
		expect(decidedLot.criteria).toEqual(decideReadLot(reading, DEMO_PROFILE, context).criteria);
	});

	it('decideLotStatus decides each reading status', () => {
		const read: LotStatus = { status: 'read', reading };
		expect(decideLotStatus(read, DEMO_PROFILE, context)).toEqual(
			decideReadLot(reading, DEMO_PROFILE, context)
		);
		expect(decideLotStatus(read, null, cancelled)?.decision).toEqual(askCancel);

		const empty = { criteriaCount: 0, sources: ['epo-notice'], pointsToDocuments: false };
		const noCriteria: LotStatus = { status: 'no-criteria' };
		expect(decideLotStatus(noCriteria, DEMO_PROFILE, { ...context, coverage: empty })).toEqual({
			decision: { verdict: 'ASK FIRST', reason: 'no-criteria-in-notice' },
			criteria: [],
			reservation: null
		});
		const inDocuments = { ...empty, sources: ['epo-procurement-document'] };
		expect(
			decideLotStatus(noCriteria, DEMO_PROFILE, { ...context, coverage: inDocuments })?.decision
		).toEqual({ verdict: 'ASK FIRST', reason: 'criteria-in-documents' });
		expect(
			decideLotStatus(noCriteria, DEMO_PROFILE, { ...cancelled, coverage: empty })?.decision
		).toEqual(askCancel);

		const notRead: LotStatus = { status: 'not-read' };
		expect(decideLotStatus(notRead, DEMO_PROFILE, context)).toBeNull();
		expect(decideLotStatus(notRead, DEMO_PROFILE, cancelled)).toEqual({
			decision: askCancel,
			criteria: [],
			reservation: null
		});

		const unlisted: LotStatus = { status: 'unlisted' };
		expect(decideLotStatus(unlisted, DEMO_PROFILE, context)).toBeNull();
		expect(decideLotStatus(unlisted, DEMO_PROFILE, cancelled)).toBeNull();
	});
});

// A lot whose deadline falls in 2026, so its last three completed years are 2023, 2024 and 2025.
const CONTEXT: LotContext = {
	legalBasis: '32014L0024',
	deadline: '2026-10-30T17:00:00Z',
	now: '2026-10-17T12:00:00Z',
	coverage: { criteriaCount: 1, sources: ['epo-notice'], pointsToDocuments: false },
	cancelIntent: false,
	reserved: 'none'
};

// The kind a model that agrees with the code gives each family's quote.
const FAMILY_KIND: Readonly<Record<CriterionFamily, string>> = {
	'turnover-general': 'turnover-general',
	'turnover-specific': 'turnover-specific',
	'staff-average': 'staff-count',
	certificate: 'certificate',
	'firm-judges': 'references',
	insurance: 'insurance',
	'not-assessed': 'registration',
	'not-compared': 'other'
};

const GENERAL = 'slc-stand-to-gen';
const AVERAGE = 'slc-stand-to-avg';
const SPECIFIC = 'slc-stand-to-spec';
const MANPOWER = 'slc-abil-staff-yrly-avg-mp';
const CERTIFICATE = 'slc-sche-qu-cert-indep';
const INSURANCE = 'slc-stand-ins';

const EACH = 'Jährlich mindestens 1.000.000 EUR netto Umsatz in den letzten drei Geschäftsjahren.';
const MORE = 'Jährlich mehr als 1.000.000 EUR netto Umsatz in den letzten drei Geschäftsjahren.';
const BARE = 'Jährlich 1.000.000 EUR netto Umsatz in den letzten drei Geschäftsjahren.';
const GROSS =
	'Jährlich mindestens 1.000.000 EUR brutto Umsatz in den letzten drei Geschäftsjahren.';
const NO_BASIS = 'Jährlich mindestens 1.000.000 EUR Umsatz in den letzten drei Geschäftsjahren.';
const CENTS =
	'Jährlich mindestens 1.000.000,01 EUR netto Umsatz in den letzten drei Geschäftsjahren.';
const FIVE = 'Jährlich mindestens 1.000.000 EUR netto Umsatz in den letzten fünf Geschäftsjahren.';
const TWO_FULL =
	'Jährlich mindestens 1.000.000 EUR netto Umsatz in den letzten zwei vollständig abgeschlossenen Geschäftsjahren.';
const TWO_UNREAD =
	'Jährlich mindestens 1.000.000 EUR netto Umsatz in den letzten zwei abgeschlossenen und testierten Geschäftsjahren.';
const TWO_UNREAD_NAMED =
	'Jährlich mindestens 1.000.000 EUR netto Umsatz in den zwei abgeschlossenen und testierten Geschäftsjahren 2024 und 2025.';
const RANGE_EACH =
	'Jährlich mindestens 1.000.000 EUR netto Umsatz in den letzten drei Geschäftsjahren (2023-2025).';
const RANGE_BACKWARDS =
	'Jährlich mindestens 1.000.000 EUR netto Umsatz in den Geschäftsjahren 2025-2023.';
const STRAY_YEAR =
	'Jährlich mindestens 1.000.000 EUR netto Umsatz in den letzten drei Geschäftsjahren; bei Neugründung ab 2024 genügt der Umsatz seit Gründung.';
const FLOOR_ONLY = 'Jährlich mindestens 1.000.000 EUR netto Umsatz';
const YEARS_APART = `${FLOOR_ONLY}. Maßgeblich sind die letzten zwei Geschäftsjahre.`;
const STAFF_NOUN_FIRST = 'Mindestmitarbeiterzahl: mindestens 25.';
const SAME_FLOOR_TWICE = `${EACH} Insgesamt mindestens 1.000.000 EUR netto Umsatz im Tätigkeitsbereich.`;
const NAMED_AVERAGE =
	'Durchschnittlicher Jahresumsatz der Geschäftsjahre 2023, 2024 und 2025 von mindestens 1.000.000,67 EUR netto.';
const LAST_THREE_AVERAGE =
	'Durchschnittlicher Jahresumsatz der letzten drei Geschäftsjahre von mindestens 1.000.000 EUR netto.';
const ANY_ONE = 'In einem der letzten drei Geschäftsjahre mindestens 1.000.000 EUR netto Umsatz.';
const UNSTATED = 'Mindestumsatz von 1.000.000 EUR netto in den letzten drei Geschäftsjahren.';
const SUM = 'Insgesamt mindestens 3.000.000 EUR netto Umsatz in den letzten drei Geschäftsjahren.';
const SEVERAL = 'Jährlich mindestens 1.000.000 EUR netto, für Los 2 mindestens 500.000 EUR netto.';
const NO_AMOUNT_QUOTE = 'Jährlicher Umsatz der letzten drei Geschäftsjahre ist nachzuweisen.';
const NO_AMOUNT = `${NO_AMOUNT_QUOTE} Mindestens 1.000.000 EUR netto.`;
const NO_MINIMUM = 'Angabe des Umsatzes der letzten drei Geschäftsjahre.';
const SPECIFIC_EACH =
	'Jährlich mindestens 1.000.000 EUR netto Umsatz im Tätigkeitsbereich des Auftrags in den letzten drei Geschäftsjahren.';
const STAFF_EACH = 'Jährlich mindestens 10 Mitarbeiter in den letzten drei Jahren.';
const STAFF_AVERAGE = 'Durchschnittlich mindestens 10 Mitarbeiter in den letzten drei Jahren.';
const STAFF_AVERAGE_IN_EACH =
	'Durchschnittliche jährliche Beschäftigtenzahl von mindestens 10 Mitarbeitern in jedem der letzten drei Jahre.';
const STAFF_ANNUAL_AVERAGE =
	'Die durchschnittliche jährliche Beschäftigtenzahl muss in den letzten drei Jahren mindestens 10 Mitarbeiter betragen.';
const STAFF_SUM = 'Insgesamt mindestens 30 Mitarbeiter in den letzten drei Jahren.';
const STAFF_TWO = 'Mindestens 10 Mitarbeiter und 2 Beschäftigte in den letzten drei Jahren.';
const STAFF_NO_COUNT_QUOTE = 'Das Personal ist nachzuweisen.';
const STAFF_NO_COUNT = `${STAFF_NO_COUNT_QUOTE} ${STAFF_EACH}`;
const CERT = 'Zertifizierung nach ISO/IEC 27001:2022.';
const CERT_EITHER = 'Zertifizierung nach ISO 9001 oder ISO/IEC 27001:2022.';
const CERT_BOTH = 'Zertifizierung nach ISO 9001 und ISO/IEC 27001:2022.';
const CERT_UNNAMED = 'Gültige Attestierung der zuständigen Behörde.';
const RESTRICTING =
	'Bei Bietergemeinschaften muss jedes einzelne Mitglied über eine Berufshaftpflichtversicherung verfügen.';

function modelItem(
	code: string,
	criterion: number,
	quote: string,
	fields: Partial<ModelItem> = {}
): ModelItem {
	return {
		criterion,
		kind: FAMILY_KIND[familyOf(code)],
		quote,
		reading: 'A reading.',
		numberText: quote,
		period: '',
		mandatory: true,
		...fields
	};
}

interface Clause {
	code: string;
	text: string;
	quote?: string;
	fields?: Partial<ModelItem>;
}

function lotOf(clauses: readonly Clause[]): LotReading {
	return readLot({
		criteria: clauses.map(({ code, text }) => ({ code, descriptions: [{ text, lang: 'de' }] })),
		items: clauses.map((clause, index) =>
			modelItem(clause.code, index + 1, clause.quote ?? clause.text, clause.fields)
		)
	});
}

function decideClause(clause: Clause, firm: FirmFacts | null, context: LotContext = CONTEXT) {
	const reading = lotOf([clause]);
	return outline(decideCriterion(reading.criteria[0], firm, context, reading.relianceRestricted));
}

type Figures = Readonly<Record<number, number | undefined>>;

function firmOf(turnover: Figures, extra: Partial<FirmFacts> = {}): FirmFacts {
	return {
		completedFinancialYears: 6,
		turnover: Object.entries(turnover).map(([year, generalNet]) => ({
			year: Number(year),
			...(generalNet !== undefined && { generalNet }),
			specific: []
		})),
		staff: { yearlyAverages: [] },
		certificates: [],
		...extra
	};
}

const yearly = (euros: number) => firmOf({ 2023: euros, 2024: euros, 2025: euros });

const staffFirm = (averages: Figures) =>
	firmOf(
		{},
		{
			staff: {
				yearlyAverages: Object.entries(averages).map(([year, average]) => ({
					year: Number(year),
					average
				}))
			}
		}
	);

const certFirm = (certificates: FirmFacts['certificates']) => firmOf({}, { certificates });

const decided = (state: CriterionState, why: OutcomeWhy) => ({
	state,
	notCompared: false,
	why: [why]
});
const notCompared = (why: OutcomeWhy) => ({ state: undefined, notCompared: true, why: [why] });

interface Row {
	name: string;
	clause: Clause;
	firm: FirmFacts | null;
	expected: ReturnType<typeof decided> | ReturnType<typeof notCompared>;
	context?: Partial<LotContext>;
}

const row = (
	name: string,
	clause: Clause,
	firm: FirmFacts | null,
	expected: Row['expected'],
	context?: Partial<LotContext>
): Row => ({ name, clause, firm, expected, ...(context && { context }) });

const g = (text: string, fields?: Partial<ModelItem>, quote?: string): Clause => ({
	code: GENERAL,
	text,
	...(fields && { fields }),
	...(quote && { quote })
});

const ROWS: readonly Row[] = [
	row(
		'a figure equal to an at least net floor is MET',
		g(EACH),
		yearly(1e6),
		decided('MET', 'met')
	),
	row(
		'a figure equal to a more than net floor is a certain shortfall',
		g(MORE),
		yearly(1e6),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'a figure equal to a floor with no comparator word is PROFILE_GAP',
		g(BARE),
		yearly(1e6),
		decided('PROFILE_GAP', 'no-comparator')
	),
	row(
		'a figure above a floor with no comparator word is MET',
		g(BARE),
		yearly(1_000_001),
		decided('MET', 'met')
	),
	row('a net figure at a gross floor is MET', g(GROSS), yearly(1e6), decided('MET', 'met')),
	row(
		'a net figure below a gross floor is PROFILE_GAP',
		g(GROSS),
		yearly(999_999),
		decided('PROFILE_GAP', 'net-below-gross-floor')
	),
	row(
		'an unstated basis is read like a gross floor',
		g(NO_BASIS),
		yearly(999_999),
		decided('PROFILE_GAP', 'net-below-gross-floor')
	),
	row(
		'a three-year average one cent short of a floor with cents is a certain shortfall',
		{ code: AVERAGE, text: NAMED_AVERAGE },
		firmOf({ 2023: 1_000_000, 2024: 1_000_001, 2025: 1_000_001 }),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'a three-year average above a floor with cents is MET',
		{ code: AVERAGE, text: NAMED_AVERAGE },
		firmOf({ 2023: 1_000_001, 2024: 1_000_001, 2025: 1_000_001 }),
		decided('MET', 'met')
	),
	row(
		'a floor with cents is never rounded in the firm favour',
		g(CENTS),
		yearly(1e6),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'each of the last three years: one year below a net floor is a certain shortfall',
		g(EACH),
		firmOf({ 2023: 999_999, 2024: 1e6, 2025: 1e6 }),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'each of the last three years: one year missing with the others met is PROFILE_GAP',
		g(EACH),
		firmOf({ 2023: 1e6, 2025: 1e6 }),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'each of the last three years: an empty figure in one year is PROFILE_GAP',
		g(EACH),
		firmOf({ 2023: undefined, 2024: 1e6, 2025: 1e6 }),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'any one year at the floor is MET',
		g(ANY_ONE),
		firmOf({ 2023: 1e6, 2024: 1, 2025: 1 }),
		decided('MET', 'met')
	),
	row(
		'any one year: every year below a net floor is a certain shortfall',
		g(ANY_ONE),
		yearly(999_999),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'any one year: two years below and one missing is PROFILE_GAP',
		g(ANY_ONE),
		firmOf({ 2024: 1, 2025: 1 }),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'an unstated period is MET when each of the last three years meets the floor',
		g(UNSTATED),
		yearly(1e6),
		decided('MET', 'met')
	),
	row(
		'an unstated period is a certain shortfall when all three years fall below',
		g(UNSTATED),
		yearly(999_999),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'an unstated period with one year below and the others above is PROFILE_GAP',
		g(UNSTATED),
		firmOf({ 2023: 999_999, 2024: 2e6, 2025: 2e6 }),
		decided('PROFILE_GAP', 'period-unstated')
	),
	row(
		'an unstated period with one year missing is PROFILE_GAP',
		g(UNSTATED),
		firmOf({ 2024: 1e6, 2025: 1e6 }),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'the last three years end before the year of the lot deadline',
		g(EACH),
		firmOf({ 2022: 1, 2023: 1e6, 2024: 1e6, 2025: 1e6, 2026: 1 }),
		decided('MET', 'met')
	),
	row(
		'the last three years end before the year of now when the lot has no deadline',
		g(EACH),
		firmOf({ 2023: 1, 2024: 1e6, 2025: 1e6, 2026: 1e6 }),
		decided('MET', 'met'),
		{ deadline: null, now: '2027-02-01T10:00:00Z' }
	),
	row(
		'a quote naming five years compares the last five',
		g(FIVE),
		firmOf({ 2021: 999_999, 2022: 1e6, 2023: 1e6, 2024: 1e6, 2025: 1e6 }),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'a quote naming two years with two words before the noun compares the last two',
		g(TWO_FULL),
		firmOf({ 2023: 999_999, 2024: 1e6, 2025: 1e6 }),
		decided('MET', 'met')
	),
	row(
		'a count of years code cannot settle is NOT_READ, never the default three',
		g(TWO_UNREAD),
		yearly(2e6),
		decided('NOT_READ', 'years-unread')
	),
	row(
		'the years a quote names settle its window when its count of years is unread',
		g(TWO_UNREAD_NAMED),
		firmOf({ 2023: 1, 2024: 1e6, 2025: 1e6 }),
		decided('MET', 'met')
	),
	row(
		'a yearly floor over a named range compares the years between its ends',
		g(RANGE_EACH),
		firmOf({ 2023: 1e6, 2024: 999_999, 2025: 1e6 }),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'a range of years code cannot settle is NOT_READ, never its two ends',
		g(RANGE_BACKWARDS),
		yearly(2e6),
		decided('NOT_READ', 'years-unread')
	),
	row(
		'a stray year beside a stated count of years is NOT_READ, never a one-year window',
		g(STRAY_YEAR),
		firmOf({ 2023: 1, 2024: 1e6, 2025: 1 }),
		decided('NOT_READ', 'years-unread')
	),
	row(
		'fewer completed financial years than demanded is PROFILE_GAP',
		g(EACH),
		firmOf({ 2023: 1e6, 2024: 1e6, 2025: 1e6 }, { completedFinancialYears: 2 }),
		decided('PROFILE_GAP', 'fewer-years')
	),
	row(
		'an empty turnover list is PROFILE_GAP',
		g(EACH),
		firmOf({}),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'no stored profile is PROFILE_GAP with the no-profile reason',
		g(EACH),
		null,
		decided('PROFILE_GAP', 'no-profile')
	),
	row(
		'demanded specific turnover with only a general figure at the floor is PROFILE_GAP',
		{ code: SPECIFIC, text: SPECIFIC_EACH },
		yearly(1e6),
		decided('PROFILE_GAP', 'firm-judges')
	),
	row(
		'a general figure below a specific floor is a certain shortfall',
		{ code: SPECIFIC, text: SPECIFIC_EACH },
		yearly(999_999),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'specific turnover with an empty general figure is PROFILE_GAP',
		{ code: SPECIFIC, text: SPECIFIC_EACH },
		firmOf({}),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'average yearly manpower above the floor each year is MET',
		{ code: MANPOWER, text: STAFF_EACH },
		staffFirm({ 2023: 12, 2024: 11.5, 2025: 10.5 }),
		decided('MET', 'met')
	),
	row(
		'average yearly manpower below the floor in one year is a certain shortfall',
		{ code: MANPOWER, text: STAFF_EACH },
		staffFirm({ 2023: 9.5, 2024: 12, 2025: 12 }),
		decided('SHORT_BORROWABLE', 'short')
	),
	row(
		'average yearly manpower equal to the floor is PROFILE_GAP',
		{ code: MANPOWER, text: STAFF_EACH },
		staffFirm({ 2023: 10, 2024: 12, 2025: 12 }),
		decided('PROFILE_GAP', 'no-comparator')
	),
	row(
		'a three-year staff average below the floor is a certain shortfall',
		{ code: MANPOWER, text: STAFF_AVERAGE },
		staffFirm({ 2023: 10.1, 2024: 10.2, 2025: 9.6 }),
		decided('SHORT_BORROWABLE', 'short')
	),
	// The measure is itself an average ("average annual manpower"), so an average word alone may
	// name the measure, not the period: MET only when every year meets the floor.
	row(
		'a staff average above the floor with one year below it is PROFILE_GAP',
		{ code: MANPOWER, text: STAFF_AVERAGE },
		staffFirm({ 2023: 10.1, 2024: 10.2, 2025: 9.8 }),
		decided('PROFILE_GAP', 'period-unstated')
	),
	row(
		'a staff average with every year above the floor is MET',
		{ code: MANPOWER, text: STAFF_AVERAGE },
		staffFirm({ 2023: 10.1, 2024: 10.2, 2025: 10.5 }),
		decided('MET', 'met')
	),
	row(
		'average annual manpower floored in each of the years, one year short, is never MET',
		{ code: MANPOWER, text: STAFF_AVERAGE_IN_EACH },
		staffFirm({ 2023: 15, 2024: 15, 2025: 5 }),
		decided('PROFILE_GAP', 'period-unstated')
	),
	row(
		'average annual manpower over three years, one year short, is never MET',
		{ code: MANPOWER, text: STAFF_ANNUAL_AVERAGE },
		staffFirm({ 2023: 15, 2024: 15, 2025: 5 }),
		decided('PROFILE_GAP', 'period-unstated')
	),
	row(
		'average yearly manpower with an empty figure in one year is PROFILE_GAP',
		{ code: MANPOWER, text: STAFF_EACH },
		staffFirm({ 2023: undefined, 2024: 12, 2025: 12 }),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'an empty yearly average list is PROFILE_GAP',
		{ code: MANPOWER, text: STAFF_EACH },
		firmOf({}),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'a blank turnover figure in the newest recorded year keeps that year in the window',
		g(EACH),
		firmOf({ 2022: 1e6, 2023: 1e6, 2024: 1e6, 2025: undefined }),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'a blank staff figure in the newest recorded year keeps that year in the window',
		{ code: MANPOWER, text: STAFF_EACH },
		staffFirm({ 2022: 12, 2023: 12, 2024: 12, 2025: undefined }),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'a general code on a quote the model read as specific turnover is not compared',
		g(EACH, { kind: 'turnover-specific' }),
		yearly(1e6),
		notCompared('kind-disagrees')
	),
	row(
		'a specific code on a quote the model read as general turnover is not compared',
		{ code: SPECIFIC, text: SPECIFIC_EACH, fields: { kind: 'turnover-general' } },
		yearly(999_999),
		notCompared('kind-disagrees')
	),
	row(
		'the manpower code on a quote the model read as references is not compared',
		{ code: MANPOWER, text: STAFF_EACH, fields: { kind: 'references' } },
		staffFirm({ 2023: 12, 2024: 12, 2025: 12 }),
		notCompared('kind-disagrees')
	),
	row(
		'a certificate code on a quote the model read as references is not compared',
		{ code: CERTIFICATE, text: CERT, fields: { kind: 'references' } },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2030-01-01' }]),
		notCompared('kind-disagrees')
	),
	row(
		'a certificate code on a quote the model read as references is not compared without a profile',
		{ code: CERTIFICATE, text: CERT, fields: { kind: 'references' } },
		null,
		notCompared('kind-disagrees')
	),
	row(
		'an average quote under a yearly code is not compared',
		g(LAST_THREE_AVERAGE),
		yearly(1e6),
		notCompared('period-disagrees')
	),
	row(
		'a yearly quote under an average code is not compared',
		{ code: AVERAGE, text: EACH },
		yearly(1e6),
		notCompared('period-disagrees')
	),
	row(
		'an any-one-year quote under an average code is not compared',
		{ code: AVERAGE, text: ANY_ONE },
		yearly(1e6),
		notCompared('period-disagrees')
	),
	row(
		'a sum of years under a turnover code is not compared',
		g(SUM),
		yearly(1e6),
		notCompared('period-disagrees')
	),
	row(
		'a sum of years under the manpower code is not compared',
		{ code: MANPOWER, text: STAFF_SUM },
		staffFirm({ 2023: 12, 2024: 12, 2025: 12 }),
		notCompared('period-disagrees')
	),
	row(
		'a model period that disagrees with the quote is not compared',
		{ code: AVERAGE, text: NAMED_AVERAGE, fields: { period: 'jährlich' } },
		yearly(2e6),
		notCompared('period-disagrees')
	),
	row(
		'a model period that agrees with the quote leaves the comparison to code',
		{ code: AVERAGE, text: NAMED_AVERAGE, fields: { period: 'durchschnittlich über drei Jahre' } },
		yearly(2e6),
		decided('MET', 'met')
	),
	row(
		'a turnover floor under slc-stand-other is not compared',
		{ code: 'slc-stand-other', text: EACH },
		yearly(1e6),
		notCompared('family')
	),
	row(
		'a quote with two amounts reads NOT_READ',
		g(SEVERAL),
		yearly(2e6),
		decided('NOT_READ', 'several-amounts')
	),
	row(
		'a quote with no amount while its criterion holds one reads NOT_READ',
		g(NO_AMOUNT, undefined, NO_AMOUNT_QUOTE),
		yearly(2e6),
		{ state: 'NOT_READ', notCompared: false, why: ['no-amount', 'amount-not-quoted'] }
	),
	row(
		'a criterion with no amount anywhere is a request to state figures and reads INFO',
		g(NO_MINIMUM, { numberText: '' }),
		yearly(2e6),
		decided('INFO', 'request-without-minimum')
	),
	row(
		'a staff floor code cannot read while the model names one reads NOT_READ, never INFO',
		{ code: MANPOWER, text: STAFF_NOUN_FIRST, fields: { numberText: '25' } },
		staffFirm({ 2023: 12, 2024: 12, 2025: 12 }),
		decided('NOT_READ', 'model-number-differs')
	),
	row(
		'a model count of years beside a quote that states none is not compared',
		g(YEARS_APART, { period: 'die letzten zwei Geschäftsjahre' }, FLOOR_ONLY),
		yearly(2e6),
		notCompared('period-disagrees')
	),
	row(
		'a model count of three years beside a quote that states none leaves the comparison to code',
		g(YEARS_APART, { period: 'die letzten drei Geschäftsjahre' }, FLOOR_ONLY),
		yearly(2e6),
		decided('MET', 'met')
	),
	row(
		'a model number one digit off reads NOT_READ',
		g(EACH, { numberText: '1.000.001 EUR' }),
		yearly(2e6),
		decided('NOT_READ', 'model-number-differs')
	),
	row(
		'an empty model number for a quote with an amount reads NOT_READ',
		g(EACH, { numberText: '' }),
		yearly(2e6),
		decided('NOT_READ', 'model-number-differs')
	),
	row(
		'a staff quote with no count while its criterion holds one reads NOT_READ',
		{ code: MANPOWER, text: STAFF_NO_COUNT, quote: STAFF_NO_COUNT_QUOTE },
		staffFirm({ 2023: 12, 2024: 12, 2025: 12 }),
		{ state: 'NOT_READ', notCompared: false, why: ['no-amount', 'amount-not-quoted'] }
	),
	row(
		'a staff quote with two counts reads NOT_READ',
		{ code: MANPOWER, text: STAFF_TWO },
		staffFirm({ 2023: 12, 2024: 12, 2025: 12 }),
		decided('NOT_READ', 'several-amounts')
	),
	row(
		'a staff model number one off reads NOT_READ',
		{ code: MANPOWER, text: STAFF_EACH, fields: { numberText: '11 Mitarbeiter' } },
		staffFirm({ 2023: 12, 2024: 12, 2025: 12 }),
		decided('NOT_READ', 'model-number-differs')
	),
	row(
		'a certificate named ISO/IEC 27001:2022 against a profile ISO 27001 is SHORT_ROUTE_UNSETTLED',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'ISO 27001', validUntil: '2027-05-31' }]),
		decided('SHORT_ROUTE_UNSETTLED', 'not-held')
	),
	row(
		'a certificate held as iso/iec 27001:2022 valid on the deadline day leaves its scope to the firm',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'iso/iec  27001:2022', validUntil: '2026-10-30' }]),
		decided('PROFILE_GAP', 'certificate-scope')
	),
	row(
		'a certificate valid until the day before the deadline day is SHORT_ROUTE_UNSETTLED',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2026-10-29' }]),
		decided('SHORT_ROUTE_UNSETTLED', 'expired')
	),
	row(
		'a certificate ends on the deadline day in Europe/Amsterdam, not in UTC',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2026-10-30' }]),
		decided('SHORT_ROUTE_UNSETTLED', 'expired'),
		{ deadline: '2026-10-30T23:30:00Z' }
	),
	row(
		'a certificate valid until the Amsterdam day of a late evening deadline is not expired',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2026-10-31' }]),
		decided('PROFILE_GAP', 'certificate-scope'),
		{ deadline: '2026-10-30T23:30:00Z' }
	),
	row(
		'a certificate with no valid-until date is PROFILE_GAP',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'ISO/IEC 27001:2022' }]),
		decided('PROFILE_GAP', 'undated')
	),
	row(
		'a certificate against a lot with no deadline is PROFILE_GAP',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2030-01-01' }]),
		decided('PROFILE_GAP', 'no-deadline'),
		{ deadline: null }
	),
	row(
		'two standards joined by oder take the best of the two',
		{ code: CERTIFICATE, text: CERT_EITHER },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2030-01-01' }]),
		decided('PROFILE_GAP', 'certificate-scope')
	),
	row(
		'two standards joined by und take the worst of the two',
		{ code: CERTIFICATE, text: CERT_BOTH },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2030-01-01' }]),
		decided('SHORT_ROUTE_UNSETTLED', 'not-held')
	),
	row(
		'an empty certificate list is PROFILE_GAP',
		{ code: CERTIFICATE, text: CERT },
		certFirm([]),
		decided('PROFILE_GAP', 'empty-field')
	),
	row(
		'a quote naming no standard code can read is SHORT_ROUTE_UNSETTLED for a firm with certificates',
		{ code: CERTIFICATE, text: CERT_UNNAMED },
		certFirm(DEMO_PROFILE.certificates),
		decided('SHORT_ROUTE_UNSETTLED', 'not-named')
	),
	row(
		'a certificate criterion with no stored profile is PROFILE_GAP',
		{ code: CERTIFICATE, text: CERT },
		null,
		decided('PROFILE_GAP', 'no-profile')
	)
];

describe('decideCriterion, one row per state the code decides', () => {
	for (const { name, clause, firm, expected, context } of ROWS) {
		it(name, () => {
			expect(decideClause(clause, firm, { ...CONTEXT, ...context })).toEqual(expected);
		});
	}

	it.each(['32014L0025', '32014L0023', '32009L0081', '32024R2509', 'another-code'])(
		'a certain shortfall under the legal basis %s is SHORT_ROUTE_UNSETTLED',
		(legalBasis) => {
			expect(decideClause(g(MORE), yearly(1e6), { ...CONTEXT, legalBasis })).toEqual(
				decided('SHORT_ROUTE_UNSETTLED', 'route-by-law')
			);
		}
	);

	it('a certain shortfall beside a clause restricting reliance on other firms is SHORT_ROUTE_UNSETTLED', () => {
		const reading = lotOf([g(MORE), { code: INSURANCE, text: RESTRICTING }]);
		expect(reading.relianceRestricted).toBe(true);
		const decidedLot = decideReadLot(reading, yearly(1e6), {
			...CONTEXT,
			coverage: { ...CONTEXT.coverage, criteriaCount: 2 }
		});
		expect(outline(decidedLot.criteria[0])).toEqual(
			decided('SHORT_ROUTE_UNSETTLED', 'short-restricted')
		);
		expect(decidedLot.decision).toEqual({ verdict: 'ASK FIRST', reason: 'route-unsettled' });
	});

	it.each([
		'slc-abil-ref-services',
		'slc-abil-ref-supply',
		'slc-abil-ref-work',
		'slc-abil-staff-qual',
		'slc-abil-staff-tech-ctrl',
		'slc-abil-staff-tech-work',
		'slc-abil-staff-yrly-no-mgmt'
	])('the firm-judges code %s reads PROFILE_GAP whatever the model said', (code) => {
		const clause = { code, text: EACH, fields: { kind: 'turnover-general' } };
		expect(decideClause(clause, yearly(2e6))).toEqual(decided('PROFILE_GAP', 'firm-judges'));
	});

	it('insurance reads not compared and never names a missing profile field', () => {
		const clause = { code: INSURANCE, text: RESTRICTING };
		for (const firm of [DEMO_PROFILE, emptyProfile(), null]) {
			expect(decideClause(clause, firm)).toEqual(notCompared('insurance'));
		}
	});

	it.each(['slc-suit-reg-prof', 'slc-suit-reg-trade', 'slc-suit-auth-mbrshp'])(
		'the registration or authorisation code %s reads INFO, not assessed',
		(code) => {
			const clause = { code, text: 'Eintragung in das Berufs- oder Handelsregister.' };
			expect(decideClause(clause, null)).toEqual(decided('INFO', 'not-assessed'));
		}
	);

	it('a compared-family criterion with nothing read is NOT_READ', () => {
		const reading = readLot({
			criteria: [{ code: GENERAL, descriptions: [{ text: EACH, lang: 'de' }] }],
			items: []
		});
		expect(outline(decideCriterion(reading.criteria[0], yearly(2e6), CONTEXT, false))).toEqual(
			decided('NOT_READ', 'nothing-read')
		);
	});

	it('each rejected requirement adds NOT_READ to its criterion', () => {
		const reading = readLot({
			criteria: [{ code: GENERAL, descriptions: [{ text: EACH, lang: 'de' }] }],
			items: [modelItem(GENERAL, 1, EACH), modelItem(GENERAL, 1, 'Mindestens zwei Millionen Euro')]
		});
		expect(outline(decideCriterion(reading.criteria[0], yearly(2e6), CONTEXT, false))).toEqual({
			state: 'NOT_READ',
			notCompared: false,
			why: ['met', 'quote-rejected']
		});
	});

	it('a floor in the clause that no verified quote names keeps the criterion from MET', () => {
		const higher = MORE.replace('1.000.000', '2.000.000');
		const text = `${EACH} ${higher}`;
		const criteria = [{ code: GENERAL, descriptions: [{ text, lang: 'de' }] }];
		const partial = readLot({ criteria, items: [modelItem(GENERAL, 1, EACH)] });
		expect(
			outline(decideCriterion(partial.criteria[0], yearly(1_500_000), CONTEXT, false))
		).toEqual({ state: 'NOT_READ', notCompared: false, why: ['met', 'amount-not-quoted'] });
		expect(decideReadLot(partial, yearly(1_500_000), CONTEXT).decision).toEqual({
			verdict: 'ASK FIRST',
			reason: 'not-read'
		});
		const whole = readLot({
			criteria,
			items: [modelItem(GENERAL, 1, EACH), modelItem(GENERAL, 1, higher)]
		});
		expect(outline(decideCriterion(whole.criteria[0], yearly(2_500_000), CONTEXT, false))).toEqual({
			state: 'MET',
			notCompared: false,
			why: ['met', 'met']
		});
	});

	it('a headcount in the clause that no verified quote names keeps the criterion from MET', () => {
		const text = `${STAFF_EACH} Davon mindestens 4 Beschäftigte im Projektteam.`;
		const reading = readLot({
			criteria: [{ code: MANPOWER, descriptions: [{ text, lang: 'de' }] }],
			items: [modelItem(MANPOWER, 1, STAFF_EACH)]
		});
		const firm = staffFirm({ 2023: 12, 2024: 12, 2025: 12 });
		expect(outline(decideCriterion(reading.criteria[0], firm, CONTEXT, false))).toEqual({
			state: 'NOT_READ',
			notCompared: false,
			why: ['met', 'amount-not-quoted']
		});
	});

	it('an amount code cannot read in the clause keeps the criterion from MET or INFO', () => {
		const text = 'Jährlich mindestens 2 Mrd. EUR netto Umsatz in den letzten drei Geschäftsjahren.';
		const clause = g(text, { numberText: '2 Mrd. EUR' });
		expect(
			outline(decideCriterion(lotOf([clause]).criteria[0], yearly(1e6), CONTEXT, false))
		).toEqual({
			state: 'NOT_READ',
			notCompared: false,
			why: ['model-number-differs', 'amount-not-quoted']
		});
	});

	it('a floor the clause states twice is quoted only when both are', () => {
		const reading = lotOf([g(SAME_FLOOR_TWICE, undefined, EACH)]);
		expect(outline(decideCriterion(reading.criteria[0], yearly(2e6), CONTEXT, false))).toEqual({
			state: 'NOT_READ',
			notCompared: false,
			why: ['met', 'amount-not-quoted']
		});
	});

	it('one quote returned twice quotes a floor the clause states twice only once', () => {
		const readTwice = (quotes: readonly string[]) =>
			readLot({
				criteria: [{ code: GENERAL, descriptions: [{ text: SAME_FLOOR_TWICE, lang: 'de' }] }],
				items: quotes.map((quote) => modelItem(GENERAL, 1, quote))
			}).criteria[0];
		expect(outline(decideCriterion(readTwice([EACH, EACH]), yearly(2e6), CONTEXT, false))).toEqual({
			state: 'NOT_READ',
			notCompared: false,
			why: ['met', 'met', 'amount-not-quoted']
		});
		// The same quote with other spacing is found at the same place, so it is the same row.
		expect(readTwice([EACH, EACH.replace(' EUR ', '  EUR ')]).everyAmountQuoted).toBe(false);
		const total = 'Insgesamt mindestens 1.000.000 EUR netto Umsatz im Tätigkeitsbereich.';
		expect(readTwice([EACH, total]).everyAmountQuoted).toBe(true);
	});

	it('the same floor in a second language is quoted once it is quoted in the first', () => {
		const english =
			'At least EUR 1,000,000 net turnover each year in the last three financial years.';
		const reading = readLot({
			criteria: [
				{
					code: GENERAL,
					descriptions: [
						{ text: EACH, lang: 'de' },
						{ text: english, lang: 'en' }
					]
				}
			],
			items: [modelItem(GENERAL, 1, EACH)]
		});
		expect(outline(decideCriterion(reading.criteria[0], yearly(1e6), CONTEXT, false))).toEqual(
			decided('MET', 'met')
		);
	});

	it('every requirement of a criterion joins with combineAll', () => {
		const text = `${EACH} ${MORE.replace('1.000.000', '2.000.000')}`;
		const reading = readLot({
			criteria: [{ code: GENERAL, descriptions: [{ text, lang: 'de' }] }],
			items: [
				modelItem(GENERAL, 1, EACH),
				modelItem(GENERAL, 1, MORE.replace('1.000.000', '2.000.000'))
			]
		});
		expect(
			outline(decideCriterion(reading.criteria[0], yearly(1_500_000), CONTEXT, false))
		).toEqual({
			state: 'SHORT_BORROWABLE',
			notCompared: false,
			why: ['met', 'short']
		});
	});
});

describe('decideReadLot', () => {
	const twoCriteria = { ...CONTEXT, coverage: { ...CONTEXT.coverage, criteriaCount: 2 } };

	it('a lot whose only open criterion is insurance reads ASK FIRST not-compared', () => {
		const reading = lotOf([g(EACH), { code: INSURANCE, text: 'Berufshaftpflichtversicherung.' }]);
		const decidedLot = decideReadLot(reading, yearly(1e6), twoCriteria);
		expect(decidedLot.criteria.map(outline)).toEqual([
			decided('MET', 'met'),
			notCompared('insurance')
		]);
		expect(decidedLot.decision).toEqual({ verdict: 'ASK FIRST', reason: 'not-compared' });
	});

	it('an optional turnover floor the firm misses reads not compared, never a shortfall', () => {
		const firm = yearly(500_000);
		expect(decideReadLot(lotOf([g(EACH)]), firm, CONTEXT).decision).toEqual({
			verdict: 'PARTNER NEEDED'
		});
		const decidedLot = decideReadLot(lotOf([g(EACH, { mandatory: false })]), firm, CONTEXT);
		expect(decidedLot.criteria.map(outline)).toEqual([notCompared('optional')]);
		expect(decidedLot.decision).toEqual({ verdict: 'ASK FIRST', reason: 'not-compared' });
	});

	it.each([
		['a turnover floor', g(EACH), yearly(500_000)],
		[
			'a staff floor',
			{ code: MANPOWER, text: STAFF_EACH },
			staffFirm({ 2023: 1, 2024: 1, 2025: 1 })
		],
		['a certificate', { code: CERTIFICATE, text: CERT }, certFirm([])]
	] as const)(
		'%s its reading marks optional is withheld before any comparison',
		(_, clause, firm) => {
			const optional = { ...clause, fields: { mandatory: false } };
			expect(decideClause(clause, firm).notCompared).toBe(false);
			expect(decideClause(optional, firm)).toEqual(notCompared('optional'));
			expect(decideClause(optional, null)).toEqual(notCompared('optional'));
		}
	);

	it('a certificate clause mixing and with or reads NOT_READ, never met by one certificate', () => {
		const text = 'Zertifizierung nach ISO 9001 und entweder ISO 14001 oder ISO/IEC 27001:2022.';
		const firm = certFirm([{ standard: 'ISO 9001', validUntil: '2030-01-01' }]);
		expect(decideClause({ code: CERTIFICATE, text }, firm)).toEqual(
			decided('NOT_READ', 'mixed-standards')
		);
	});

	it('a certificate held as named never makes its lot GO, whatever scope its quote leaves out', () => {
		// An ISO 9001 certificate scoped to manufacturing carries the name of one the buyer asks for
		// software development; code cannot compare the two scopes, with or without the quote.
		const text = 'Zertifizierung nach ISO 9001 für den Bereich Softwareentwicklung.';
		const firm = certFirm([{ standard: 'ISO 9001', validUntil: '2030-01-01' }]);
		for (const quote of [text, 'Zertifizierung nach ISO 9001']) {
			const decidedLot = decideReadLot(lotOf([{ code: CERTIFICATE, text, quote }]), firm, CONTEXT);
			expect(decidedLot.criteria.map(outline), quote).toEqual([
				decided('PROFILE_GAP', 'certificate-scope')
			]);
			expect(decidedLot.decision).toEqual({
				verdict: 'ASK FIRST',
				reason: 'profile-field-missing'
			});
		}
	});

	it('an optional item under a code the family alone decides keeps the family state', () => {
		const clause = { code: 'slc-abil-ref-services', text: EACH, fields: { mandatory: false } };
		expect(decideClause(clause, yearly(2e6))).toEqual(decided('PROFILE_GAP', 'firm-judges'));
	});

	it('an item naming a criterion the lot lacks keeps a met lot from GO', () => {
		const firm = yearly(1e6);
		expect(decideReadLot(lotOf([g(EACH)]), firm, CONTEXT).decision).toEqual({ verdict: 'GO' });
		const reading = readLot({
			criteria: [{ code: GENERAL, descriptions: [{ text: EACH, lang: 'de' }] }],
			items: [modelItem(GENERAL, 1, EACH), modelItem(GENERAL, 2, EACH)]
		});
		expect(reading.unplaced).toHaveLength(1);
		const decidedLot = decideReadLot(reading, firm, CONTEXT);
		expect(decidedLot.criteria.map(outline)).toEqual([decided('MET', 'met')]);
		expect(decidedLot.decision).toEqual({ verdict: 'ASK FIRST', reason: 'not-read' });
	});

	it('an item naming a criterion the lot lacks never softens a shortfall', () => {
		const reading = readLot({
			criteria: [{ code: GENERAL, descriptions: [{ text: EACH, lang: 'de' }] }],
			items: [modelItem(GENERAL, 1, EACH), modelItem(GENERAL, 0, EACH)]
		});
		expect(reading.unplaced).toHaveLength(1);
		expect(decideReadLot(reading, yearly(500_000), CONTEXT).decision).toEqual({
			verdict: 'PARTNER NEEDED'
		});
	});

	const everyComparison: Clause[] = [
		g(EACH),
		{ code: MANPOWER, text: STAFF_EACH },
		{ code: CERTIFICATE, text: CERT },
		{ code: 'slc-abil-ref-services', text: 'Mindestens zwei Referenzen.' }
	];
	const fourCriteria = { ...CONTEXT, coverage: { ...CONTEXT.coverage, criteriaCount: 4 } };

	it('an empty profile makes every comparison PROFILE_GAP and the lot ASK FIRST', () => {
		const decidedLot = decideReadLot(lotOf(everyComparison), emptyProfile(), fourCriteria);
		expect(decidedLot.criteria.map(outline)).toEqual([
			decided('PROFILE_GAP', 'empty-field'),
			decided('PROFILE_GAP', 'empty-field'),
			decided('PROFILE_GAP', 'empty-field'),
			decided('PROFILE_GAP', 'firm-judges')
		]);
		expect(decidedLot.decision).toEqual({ verdict: 'ASK FIRST', reason: 'profile-field-missing' });
	});

	it('no stored profile makes every comparison PROFILE_GAP with the no-profile reason', () => {
		const decidedLot = decideReadLot(lotOf(everyComparison), null, fourCriteria);
		expect(decidedLot.criteria.map(outline)).toEqual(
			everyComparison.map(() => decided('PROFILE_GAP', 'no-profile'))
		);
		expect(decidedLot.decision).toEqual({ verdict: 'ASK FIRST', reason: 'profile-field-missing' });
	});

	it.each([
		['sheltered-program', { verdict: 'ASK FIRST', reason: 'not-compared' }, true],
		[undefined, { verdict: 'ASK FIRST', reason: 'not-compared' }, true],
		['none', { verdict: 'GO' }, false]
	] as const)('a lot reserved %j decides %j', (reserved, decision, withheld) => {
		const decidedLot = decideReadLot(lotOf([g(EACH)]), yearly(1e6), { ...CONTEXT, reserved });
		expect(decidedLot.decision).toEqual(decision);
		expect(decidedLot.reservation).toEqual(
			withheld ? { notCompared: true, why: 'reserved' } : null
		);
	});
});

// The model kinds spike 004's schema allows, and period words of each mode in each language.
const MODEL_KINDS = [
	'turnover-general',
	'turnover-specific',
	'staff-count',
	'references',
	'certificate',
	'insurance',
	'registration',
	'points-to-documents',
	'other'
];
const PERIOD_WORDS = [
	'jährlich',
	'durchschnittlich',
	'insgesamt',
	'in einem der',
	'gemiddeld',
	'jaarlijks',
	'par an',
	'moyenne',
	'average',
	'each year',
	'in total',
	''
];

interface Case {
	name: string;
	criteria: readonly LotCriterion[];
	item: ModelItem;
	context: LotContext;
}

const FIXTURE_LOTS = [
	['de-610242-default', '610242-2026', 'LOT-0000'],
	['de-610242-thinking-off', '610242-2026', 'LOT-0000'],
	['fr-629755-default-tab', '629755-2026', 'LOT-0001'],
	['fr-629755-probe', '629755-2026', 'LOT-0001'],
	['nl-634398-super', '634398-2026', 'LOT-0001']
] as const;

const FIXTURE_CASES: Case[] = FIXTURE_LOTS.flatMap(([name, notice, lotId]) => {
	const { record, lot } = trackedLot(notice, lotId);
	const reading = readLot({ criteria: lot.criteria, items: replyRequirements(name) });
	return reading.criteria.flatMap((criterion) =>
		criterion.verified.map((requirement, index) => ({
			name: `${name} criterion ${requirement.item.criterion} item ${index + 1}`,
			criteria: lot.criteria,
			item: requirement.item,
			context: contextOf(record, lot)
		}))
	);
});

const SYNTHETIC_CASES: Case[] = [
	[GENERAL, EACH],
	[GENERAL, BARE],
	[GENERAL, ANY_ONE],
	[GENERAL, UNSTATED],
	[AVERAGE, NAMED_AVERAGE],
	[SPECIFIC, SPECIFIC_EACH],
	[MANPOWER, STAFF_EACH],
	[MANPOWER, STAFF_AVERAGE],
	[CERTIFICATE, CERT],
	[CERTIFICATE, CERT_EITHER]
].map(([code, text]) => ({
	name: `${code}: ${text}`,
	criteria: [{ code, descriptions: [{ text, lang: 'de' }] }],
	item: modelItem(code, 1, text),
	context: CONTEXT
}));

function everyFigure(value: number): FirmFacts {
	const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
	return {
		completedFinancialYears: 7,
		turnover: years.map((year) => ({
			year,
			generalNet: value,
			specific: [{ businessLine: 'Software', net: value }]
		})),
		staff: { yearlyAverages: years.map((year) => ({ year, average: value })) },
		certificates: [
			{ standard: 'ISO/IEC 27001:2022', validUntil: '2030-01-01' },
			{ standard: 'ISO 9001', validUntil: '2030-01-01' }
		]
	};
}

// The leading digit of one digit group of the quote set to another digit, so the change moves an
// amount by a whole group ("1.000.000 EUR" to "1.900.000 EUR"), enough to cross a firm's figure.
function oneDigitChanged(text: string, at: number, to: number): string {
	const leading = [...text].flatMap((char, index) =>
		/\d/u.test(char) && !/\d/u.test(text[index - 1] ?? '') ? [index] : []
	);
	if (leading.length === 0) return `${text} 1`;
	const index = leading[at % leading.length];
	const digit = String(to) === text[index] ? (to + 1) % 10 : to;
	return `${text.slice(0, index)}${digit}${text.slice(index + 1)}`;
}

function decideCase(testCase: Case, item: ModelItem, firm: FirmFacts | null) {
	const reading = readLot({ criteria: testCase.criteria, items: [item] });
	const criterion = reading.criteria[item.criterion - 1];
	return outline(decideCriterion(criterion, firm, testCase.context, reading.relianceRestricted));
}

const MUTATION_RUNS = 500;

describe('the model can only withhold a comparison', () => {
	it('draws its requirements from every recorded chat reply and from synthetic clauses', () => {
		expect(FIXTURE_CASES.length).toBeGreaterThanOrEqual(40);
		expect(SYNTHETIC_CASES).toHaveLength(10);
	});

	test.prop(
		[
			fc.oneof(fc.constantFrom(...FIXTURE_CASES), fc.constantFrom(...SYNTHETIC_CASES)),
			fc.constantFrom(
				['the demo firm', DEMO_PROFILE] as const,
				['an empty profile', emptyProfile()] as const,
				['a firm with every figure 0', everyFigure(0)] as const,
				['a firm with every figure 10^12', everyFigure(1e12)] as const
			),
			fc.oneof(
				fc.string().map((value) => ({ field: 'numberText', value })),
				{
					arbitrary: fc
						.tuple(fc.nat(), fc.nat({ max: 9 }))
						.map((digit) => ({ field: 'numberText', value: digit })),
					weight: 3
				},
				fc.constantFrom(...MODEL_KINDS).map((value) => ({ field: 'kind', value })),
				fc
					.oneof(fc.string(), fc.constantFrom(...PERIOD_WORDS))
					.map((value) => ({ field: 'period', value })),
				fc.boolean().map((value) => ({ field: 'mandatory', value }))
			)
		],
		{ numRuns: MUTATION_RUNS }
	)(
		'a model field can only withhold a comparison, never choose its result',
		(testCase, [firmName, firm], change) => {
			const family = familyOf(testCase.criteria[testCase.item.criterion - 1].code);
			const agreeing: ModelItem = {
				...testCase.item,
				kind: FAMILY_KIND[family],
				numberText: testCase.item.quote,
				period: ''
			};
			const value = Array.isArray(change.value)
				? oneDigitChanged(agreeing.quote, change.value[0], change.value[1])
				: change.value;
			const mutated: ModelItem = { ...agreeing, [change.field]: value };
			const base = decideCase(testCase, agreeing, firm);
			const result = decideCase(testCase, mutated, firm);
			if (result.state === 'NOT_READ' || result.notCompared) return;
			expect(
				result,
				`${testCase.name}, ${firmName}, ${change.field} ${JSON.stringify(value)}`
			).toEqual(base);
		}
	);
});

const ROW_ORDER = [
	{ year: 2021, generalNet: 5_000_000, specific: [] },
	{ year: 2022, generalNet: 500_000, specific: [] },
	{ year: 2023, generalNet: 1_000_000, specific: [] },
	{ year: 2024, generalNet: 999_999, specific: [] },
	{ year: 2025, generalNet: 1_200_000, specific: [] }
];

describe('backstops', () => {
	test.prop([fc.shuffledSubarray(ROW_ORDER, { minLength: ROW_ORDER.length })])(
		'each of the last three years is checked whatever the profile row order',
		(rows) => {
			for (const clause of [
				g(EACH),
				g(ANY_ONE),
				g(UNSTATED),
				{ code: AVERAGE, text: LAST_THREE_AVERAGE }
			]) {
				const shuffled = decideClause(clause, { ...firmOf({}), turnover: rows });
				expect(shuffled, clause.text).toEqual(
					decideClause(clause, { ...firmOf({}), turnover: ROW_ORDER })
				);
			}
			expect(decideClause(g(EACH), { ...firmOf({}), turnover: rows })).toEqual(
				decided('SHORT_BORROWABLE', 'short')
			);
		}
	);

	const SENTENCES = [
		'Jährlich mindestens 1.000.000 EUR netto Umsatz.',
		'Jährlich mehr als 2.000.000 EUR netto Umsatz.',
		'Jährlich mindestens 1.500.000 EUR brutto Umsatz.'
	];
	const STANDARDS = ['ISO 9001', 'ISO/IEC 27001:2022', 'ISO 14001'];
	const holder = certFirm([{ standard: 'ISO 14001', validUntil: '2030-01-01' }]);

	test.prop([
		fc.shuffledSubarray(SENTENCES, { minLength: SENTENCES.length }),
		fc.shuffledSubarray(STANDARDS, { minLength: STANDARDS.length })
	])('the and and or combinations give the same state in any order', (sentences, standards) => {
		const text = sentences.join(' ');
		const reading = readLot({
			criteria: [{ code: GENERAL, descriptions: [{ text, lang: 'de' }] }],
			items: sentences.map((sentence) => modelItem(GENERAL, 1, sentence))
		});
		expect(decideCriterion(reading.criteria[0], yearly(1_500_000), CONTEXT, false).state).toBe(
			'SHORT_BORROWABLE'
		);
		const either = `Zertifizierung nach ${standards.join(' oder ')}.`;
		const both = `Zertifizierung nach ${standards.join(' und ')}.`;
		expect(decideClause({ code: CERTIFICATE, text: either }, holder).state).toBe('PROFILE_GAP');
		expect(decideClause({ code: CERTIFICATE, text: both }, holder).state).toBe(
			'SHORT_ROUTE_UNSETTLED'
		);
	});
});

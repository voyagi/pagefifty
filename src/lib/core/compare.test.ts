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
import { readLot, type LotCriterion, type LotReading, type ModelItem } from './lot-reading';
import {
	decideCriterion,
	decideReadLot,
	type CriterionOutcome,
	type FirmFacts,
	type LotContext,
	type OutcomeWhy
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
	why: outcome.requirements.map((requirement) => requirement.why)
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
	row(
		'a three-year staff average above the floor is MET',
		{ code: MANPOWER, text: STAFF_AVERAGE },
		staffFirm({ 2023: 10.1, 2024: 10.2, 2025: 9.8 }),
		decided('MET', 'met')
	),
	row(
		'an empty yearly average list is PROFILE_GAP',
		{ code: MANPOWER, text: STAFF_EACH },
		firmOf({}),
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
		decided('NOT_READ', 'no-amount')
	),
	row(
		'a criterion with no amount anywhere is a request to state figures and reads INFO',
		g(NO_MINIMUM),
		yearly(2e6),
		decided('INFO', 'request-without-minimum')
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
		decided('NOT_READ', 'no-amount')
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
		'a certificate held as iso/iec 27001:2022 valid on the deadline day is MET',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'iso/iec  27001:2022', validUntil: '2026-10-30' }]),
		decided('MET', 'met')
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
		'a certificate valid until the Amsterdam day of a late evening deadline is MET',
		{ code: CERTIFICATE, text: CERT },
		certFirm([{ standard: 'ISO/IEC 27001:2022', validUntil: '2026-10-31' }]),
		decided('MET', 'met'),
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
		decided('MET', 'met')
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

function oneDigitChanged(text: string, at: number): string {
	const digits = [...text].flatMap((char, index) => (/\d/u.test(char) ? [index] : []));
	if (digits.length === 0) return `${text} 1`;
	const index = digits[at % digits.length];
	return `${text.slice(0, index)}${(Number(text[index]) + 1) % 10}${text.slice(index + 1)}`;
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
			fc.constantFrom(...FIXTURE_CASES, ...SYNTHETIC_CASES),
			fc.constantFrom(
				['the demo firm', DEMO_PROFILE] as const,
				['an empty profile', emptyProfile()] as const,
				['a firm with every figure 0', everyFigure(0)] as const,
				['a firm with every figure 10^12', everyFigure(1e12)] as const
			),
			fc.oneof(
				fc.string().map((value) => ({ field: 'numberText', value })),
				fc.nat().map((at) => ({ field: 'numberText', value: at })),
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
			const value =
				typeof change.value === 'number'
					? oneDigitChanged(agreeing.quote, change.value)
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
		expect(decideClause({ code: CERTIFICATE, text: either }, holder).state).toBe('MET');
		expect(decideClause({ code: CERTIFICATE, text: both }, holder).state).toBe(
			'SHORT_ROUTE_UNSETTLED'
		);
	});
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNotice } from '../ingest/read-notice';
import type { LotRecord } from '../ingest/record';
import { replyRequirements } from '../../test/fixtures/replies';
import { normalizeCriterionText } from './document-pointer';
import { criterionText } from './quote';
import {
	RELIANCE_PHRASES,
	lotStatusOf,
	readLot,
	relianceRestricted,
	type ModelItem,
	type NoticeReadingsLike,
	type RejectedItem
} from './lot-reading';

function capturedLot(capture: string, notice: string, lotId: string): LotRecord {
	const bytes = readFileSync(join('examples', capture, 'xml', `${notice}.xml`));
	const result = readNotice(new Uint8Array(bytes), { noticeNumber: notice });
	if (!result.ok) throw new Error(`${notice} did not read: ${result.kind}, ${result.detail}`);
	const lot = result.record.lots.find((each) => each.id === lotId);
	if (!lot) throw new Error(`${notice} has no ${lotId}`);
	return lot;
}

function capturedText(capture: string, notice: string, lotId: string, criterion: number): string {
	return criterionText(capturedLot(capture, notice, lotId).criteria[criterion - 1].descriptions);
}

const item = (criterion: number, quote: string, fields: Partial<ModelItem> = {}): ModelItem => ({
	criterion,
	kind: 'turnover-general',
	quote,
	reading: 'A reading.',
	numberText: quote,
	period: '',
	mandatory: true,
	...fields
});

describe('readLot', () => {
	const german = capturedLot('2026-09-15', '610242-2026', 'LOT-0000');
	const reading = readLot({
		criteria: german.criteria,
		items: replyRequirements('de-610242-thinking-off')
	});

	it('places each verified item of the German reply on the criterion it names', () => {
		expect(reading.criteria.map((criterion) => criterion.verified.length)).toEqual([
			1, 1, 1, 3, 5, 3
		]);
		expect(reading.criteria.every((criterion) => criterion.rejected.length === 0)).toBe(true);
		expect(reading.unplaced).toEqual([]);
	});

	it('keeps each criterion code, family, text and language as the record holds them', () => {
		const third = reading.criteria[2];
		expect(third.code).toBe('slc-stand-to-spec');
		expect(third.family).toBe('turnover-specific');
		expect(third.text).toBe(criterionText(german.criteria[2].descriptions));
		expect(third.lang).toBe('de');
	});

	it('reads the German floor, its period and the model fields by code from the quote', () => {
		const [floor] = reading.criteria[2].verified;
		expect(floor.money).toEqual({
			kind: 'one',
			cents: 10_000_000,
			basis: 'net',
			comparator: 'at-least'
		});
		expect(floor.count).toEqual({ kind: 'none' });
		expect(floor.period).toEqual({ mode: 'average', years: 3, named: [2023, 2024, 2025] });
		expect(floor.standards).toEqual({ standards: [], join: 'all' });
		expect(floor.modelPeriod.mode).toBe('unstated');
		expect(floor.modelNumber).toEqual({ money: true, count: false });
		expect(floor.start).toBeGreaterThan(0);
	});

	it('keeps a rejected item on its criterion and an item naming no criterion apart', () => {
		const text =
			'Jährlich mindestens 1.000.000 EUR netto Umsatz in den letzten drei Geschäftsjahren.';
		const read = readLot({
			criteria: [{ code: 'slc-stand-to-gen', descriptions: [{ text, lang: 'de' }] }],
			items: [
				item(1, 'Umsatz'),
				item(1, 'Mindestens zwei Millionen Euro im Jahr'),
				item(2, text),
				item(1, text)
			]
		});
		const [criterion] = read.criteria;
		expect(criterion.rejected.map((each) => each.reason)).toEqual(['too-short', 'not-found']);
		expect(criterion.verified).toHaveLength(1);
		const unplaced: RejectedItem = { item: item(2, text), reason: 'no-such-criterion' };
		expect(read.unplaced).toEqual([unplaced]);
	});

	it.each([
		['slc-stand-to-gen', 'Mindestumsatz von 1.000.000 EUR netto im Jahr.', true],
		['slc-stand-to-gen', 'Angabe des Umsatzes der letzten drei Geschäftsjahre.', false],
		['slc-stand-to-gen', 'Mindestens 10 Mitarbeiter in den letzten drei Jahren.', false],
		['slc-abil-staff-yrly-avg-mp', 'Mindestens 10 Mitarbeiter in den letzten drei Jahren.', true],
		['slc-abil-staff-yrly-avg-mp', 'Mindestumsatz von 1.000.000 EUR netto im Jahr.', false]
	] as const)('textHasAmount under %s reads %j as %s', (code, text, expected) => {
		const read = readLot({ criteria: [{ code, descriptions: [{ text, lang: 'de' }] }], items: [] });
		expect(read.criteria[0].textHasAmount).toBe(expected);
	});

	it('reads a lot with no description language as undefined', () => {
		const read = readLot({
			criteria: [{ code: 'slc-stand-to-gen', descriptions: [] }],
			items: []
		});
		expect(read.criteria[0]).toMatchObject({ text: '', lang: undefined, verified: [] });
	});

	it('reads the German lot as restricting reliance, from its insurance clause', () => {
		expect(reading.relianceRestricted).toBe(true);
	});
});

describe('relianceRestricted', () => {
	// Each phrase found in the tracked captures, pinned on the first criterion text that holds it.
	it.each([
		['2026-09-15', '610242-2026', 'LOT-0000', 4, 'jedes einzelne mitglied'],
		[
			'2026-09-15',
			'612755-2026',
			'LOT-0001',
			7,
			'für alle mitglieder der bewerbergemeinschaft nachgewiesen'
		],
		['2026-10-16', '679903-2026', 'LOT-0001', 2, 'eignungsleihe ist für'],
		['2026-10-16', '710233-2026', 'LOT-0000', 1, 'von jedem bewerbergemeinschaftspartner'],
		['2026-10-16', '687130-2026', 'LOT-0001', 1, 'gesondert nachzuweisen'],
		['2026-10-16', '709047-2026', 'LOT-0000', 3, 'für alle mitglieder in voller höhe'],
		['2026-10-16', '705149-2026', 'LOT-0000', 6, 'wenn jedes mitglied die anforderung erfüllt']
	] as const)(
		'the %s capture: %s %s criterion %i holds "%s"',
		(capture, notice, lot, index, phrase) => {
			const text = capturedText(capture, notice, lot, index);
			expect(normalizeCriterionText(text)).toContain(phrase);
			expect(relianceRestricted([text])).toBe(true);
		}
	);

	const everyPhrase = Object.entries(RELIANCE_PHRASES).flatMap(([lang, phrases]) =>
		phrases.map((phrase) => [lang, phrase] as const)
	);

	it.each(everyPhrase)(
		'reads the %s phrase "%s" in any case and across a line break',
		(_, phrase) => {
			const spaced = phrase.replace(' ', '\n').toUpperCase();
			expect(relianceRestricted(['Erste Klausel.', `Vorher ${spaced} danach.`])).toBe(true);
		}
	);

	it('holds every phrase in the normalised form it is matched in', () => {
		expect(Object.keys(RELIANCE_PHRASES).sort()).toEqual(['de', 'en', 'fr', 'nl']);
		for (const [, phrase] of everyPhrase) expect(normalizeCriterionText(phrase)).toBe(phrase);
	});

	it('reads a phrase split by a hyphen at a line end', () => {
		expect(relianceRestricted(['Dies gilt für jedes einzelne Mit-\nglied der Gemeinschaft.'])).toBe(
			true
		);
	});

	it('does not read a clause that allows relying on other firms as a restriction', () => {
		const allowing = 'Die Mitarbeitenden können auch per Eignungsleihe nachgewiesen werden.';
		expect(relianceRestricted([allowing])).toBe(false);
		expect(relianceRestricted([])).toBe(false);
	});
});

describe('lotStatusOf', () => {
	it('lotStatusOf reads a lot status from its notice readings', () => {
		const german = capturedLot('2026-09-15', '610242-2026', 'LOT-0000');
		const items = replyRequirements('de-610242-thinking-off');
		const readings = (lot: NoticeReadingsLike['lots'][number]): NoticeReadingsLike => ({
			lots: [{ lot: 'LOT-0009', status: 'no-criteria' }, lot],
			readings: [
				{ textSha256: 'other', items: [] },
				{ textSha256: 'sha-of-lot', items }
			]
		});

		expect(lotStatusOf(german, undefined)).toEqual({ status: 'unlisted' });
		expect(lotStatusOf(german, readings({ lot: 'LOT-0001', status: 'no-criteria' }))).toEqual({
			status: 'unlisted'
		});
		expect(
			lotStatusOf(german, readings({ lot: 'LOT-0000', status: 'read', textSha256: 'sha-of-lot' }))
		).toEqual({ status: 'read', reading: readLot({ criteria: german.criteria, items }) });
		expect(
			lotStatusOf(german, readings({ lot: 'LOT-0000', status: 'read', textSha256: 'no-such-sha' }))
		).toEqual({ status: 'not-read' });
		expect(lotStatusOf(german, readings({ lot: 'LOT-0000', status: 'no-criteria' }))).toEqual({
			status: 'no-criteria'
		});
		expect(
			lotStatusOf(german, readings({ lot: 'LOT-0000', status: 'not-read', reason: 'cap reached' }))
		).toEqual({ status: 'not-read' });
	});
});

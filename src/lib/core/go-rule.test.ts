import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { CAPTURE_ID, FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '../ingest/read-notice';
import type { LotRecord } from '../ingest/record';
import { NoticeRecordSchema } from '../snapshot/index-row';
import { summarizeLot, type LotCoverageInput } from './coverage-facts';
import { DOCUMENT_POINTERS, normalizeCriterionText } from './document-pointer';
import { readingStatus, toLotInput } from './reading';
import { decideLot, type CriterionState } from './verdict';

// Phase 1 decides no criterion, so every one is set MET: the most favourable profile there is. A
// lot that is not GO under it is not GO for any firm.
const everyMet = (count: number): CriterionState[] => Array.from({ length: count }, () => 'MET');

function onlyLotOf(role: RoleName, which = 0): LotRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	expect(result.record.lots).toHaveLength(1);
	return result.record.lots[0];
}

const decide = (input: LotCoverageInput, states: CriterionState[]) =>
	decideLot(toLotInput(input, states));

const mostFavourable = (lot: LotRecord) => decide(summarizeLot(lot), everyMet(lot.criteria.length));

const germanPhrasesIn = (lot: LotRecord, criterion: number) =>
	DOCUMENT_POINTERS.de.filter((phrase) =>
		lot.criteria[criterion].descriptions.some((each) =>
			normalizeCriterionText(each.text).includes(phrase)
		)
	);

const ASK_FIRST_DOCUMENTS = { verdict: 'ASK FIRST', reason: 'criteria-in-documents' };

describe('the GO rule on real notices, every criterion MET', () => {
	it('reads 609955-2026 ASK FIRST with the reason criteria-in-documents', () => {
		const lot = onlyLotOf('go-rule', 1);
		expect(FIXTURE_ROLES['go-rule'].notices[1].notice).toBe('609955-2026');
		expect(summarizeLot(lot)).toEqual({
			criteriaCount: 6,
			sources: ['epo-notice'],
			pointsToDocuments: true
		});
		expect(lot.criteria.map((criterion) => criterion.pointsToDocuments)).toEqual(
			Array.from({ length: 6 }, () => true)
		);
		expect(germanPhrasesIn(lot, 1)).toEqual(['vergabeunterlage']);
		expect(mostFavourable(lot)).toEqual(ASK_FIRST_DOCUMENTS);
	});

	it('reads 607074-2026 ASK FIRST with the reason criteria-in-documents', () => {
		const lot = onlyLotOf('go-rule', 0);
		expect(FIXTURE_ROLES['go-rule'].notices[0].notice).toBe('607074-2026');
		expect(summarizeLot(lot)).toEqual({
			criteriaCount: 9,
			sources: ['epo-notice'],
			pointsToDocuments: true
		});
		for (const criterion of lot.criteria.keys()) {
			expect(germanPhrasesIn(lot, criterion)).toEqual(
				expect.arrayContaining(['folgendem link', 'eignungskriterien finden', 'https://'])
			);
		}
		expect(germanPhrasesIn(lot, 5)).toContain('vergabeunterlage');
		expect(mostFavourable(lot)).toEqual(ASK_FIRST_DOCUMENTS);
	});

	it('reads 630477-2026 ASK FIRST, decided by criterion 3 and its enclosed reference form', () => {
		const lot = onlyLotOf('go-rule', 2);
		expect(FIXTURE_ROLES['go-rule'].notices[2].notice).toBe('630477-2026');
		expect(lot.criteria.map((criterion) => criterion.pointsToDocuments)).toEqual([
			false,
			false,
			false,
			true
		]);
		expect(lot.criteria[3].code).toBe('slc-abil-ref-supply');
		expect(lot.criteria[3].descriptions[0].text).toContain(
			'das den Vergabeunterlagen beiliegende Formblatt (Anlage A10 Referenzen)'
		);
		expect(germanPhrasesIn(lot, 3)).toEqual([
			'vergabeunterlage',
			'formblatt',
			'auszufüllen',
			'(anlage',
			'beiliegend'
		]);
		expect(mostFavourable(lot)).toEqual(ASK_FIRST_DOCUMENTS);
	});

	it('lets the pointer alone decide each of the three: without it the same lot would be GO', () => {
		for (const which of [0, 1, 2]) {
			const lot = onlyLotOf('go-rule', which);
			expect(lot.reserved).toBe('none');
			const unpointed = { ...summarizeLot(lot), pointsToDocuments: false };
			expect(decide(unpointed, everyMet(lot.criteria.length))).toEqual({ verdict: 'GO' });
		}
	});
});

describe('the GO rule on shaped lots', () => {
	it('reads a notice-only lot with one MET and one INFO criterion and no pointer GO', () => {
		const input = { criteriaCount: 2, sources: ['epo-notice'], pointsToDocuments: false };
		expect(decide(input, ['MET', 'INFO'])).toEqual({ verdict: 'GO' });
	});

	it('reads a notice-source lot with no criteria ASK FIRST with the reason no-criteria-in-notice', () => {
		const lot = onlyLotOf('notice-source-no-criteria');
		expect(lot.criteriaSources).toEqual(['epo-notice']);
		expect(mostFavourable(lot)).toEqual({ verdict: 'ASK FIRST', reason: 'no-criteria-in-notice' });
	});

	// Any lot, not only the capture's: under every criterion MET the list tag and the verdict tell
	// one story, whatever sources the lot names, known or not, and whether a criterion points out.
	const REASON_OF_TAG = {
		'criteria-in-documents': 'criteria-in-documents',
		'no-criteria-in-notice': 'no-criteria-in-notice',
		'criteria-not-read': 'GO'
	} as const;

	test.prop([
		fc.nat({ max: 6 }),
		fc.subarray(['epo-notice', 'epo-procurement-document', 'epo-sub-espd', 'epo-unknown']),
		fc.boolean()
	])('gives every lot the tag its verdict implies', (count, sources, pointing) => {
		const input = { criteriaCount: count, sources, pointsToDocuments: pointing && count > 0 };
		const decision = decide(input, everyMet(count));
		const outcome = decision.verdict === 'ASK FIRST' ? decision.reason : decision.verdict;
		expect(outcome).toBe(REASON_OF_TAG[readingStatus([input]).tag]);
	});

	it('never reads a lot that declares no BT-821 source GO', () => {
		const lot = onlyLotOf('one-lot');
		const declared = { ...summarizeLot(lot), criteriaCount: 2, pointsToDocuments: false };
		expect(decide(declared, ['MET', 'MET'])).toEqual({ verdict: 'GO' });
		const undeclared = { ...declared, sources: [] };
		expect(decide(undeclared, ['MET', 'MET'])).toEqual(ASK_FIRST_DOCUMENTS);
	});
});

describe(`every lot of the ${CAPTURE_ID} capture under the most favourable profile`, () => {
	const folder = join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID, 'records');
	const builtRecord = (notice: string) =>
		NoticeRecordSchema.parse(JSON.parse(readFileSync(join(folder, `${notice}.json`), 'utf8')));

	// Each names a buyer's form by its number or its title, a file by its title, the buyer's
	// questionnaire or a form to fill in, and nothing else points to the documents, so without those
	// rules the lot would read GO.
	it.each([
		['625582-2026', 'LOT-0000', 'in der anlage b-09'],
		['630068-2026', 'LOT-0000', 'die anlage 6a'],
		['635431-2026', 'LOT-0001', 'im dokument eigenerklärungen'],
		['624240-2026', 'LOT-0000', 's.fragebogen zur eignung'],
		['633195-2026', 'LOT-0001', 'dateien "a 08 referenzen los 1"'],
		['629099-2026', 'LOT-0002', 'eine vollständig ausgefüllte eigenerklärung'],
		['630265-2026', 'LOT-0000', 'ausgefüllte "eigenerklärung zur eignung"'],
		['603341-2026', 'LOT-0000', 'eigenerklärung russland, ausgefüllt und unterschrieben'],
		['600779-2026', 'LOT-0002', 'vorlage der befüllten referenzliste'],
		['619892-2026', 'LOT-0001', 'siehe geforderte nachweise']
	])('reads %s %s ASK FIRST: "%s" holds part of its criteria', (notice, id, evidence) => {
		const lot = builtRecord(notice).lots.find((each) => each.id === id);
		if (!lot) throw new Error(`${notice} has no ${id}`);
		const texts = lot.criteria.flatMap((each) => each.descriptions.map((one) => one.text));
		expect(texts.some((text) => normalizeCriterionText(text).includes(evidence))).toBe(true);
		expect(mostFavourable(lot)).toEqual(ASK_FIRST_DOCUMENTS);
		const unpointed = { ...summarizeLot(lot), pointsToDocuments: false };
		expect(decide(unpointed, everyMet(lot.criteria.length))).toEqual({ verdict: 'GO' });
	});

	// The list tag and the verdict input read one coverage() and agree by construction; the census
	// re-checks that on every real lot, so a later change to either side cannot split them unseen.
	it('reads GO only where the lot declares a reserved-procurement code, and never contradicts the tag', () => {
		const unknownReserved: string[] = [];
		const tagHidesDocuments: string[] = [];
		let go = 0;
		for (const file of readdirSync(folder)) {
			const record = NoticeRecordSchema.parse(JSON.parse(readFileSync(join(folder, file), 'utf8')));
			for (const lot of record.lots) {
				const decision = mostFavourable(lot);
				const inDocuments =
					decision.verdict === 'ASK FIRST' && decision.reason === 'criteria-in-documents';
				if (inDocuments && readingStatus([summarizeLot(lot)]).tag !== 'criteria-in-documents') {
					tagHidesDocuments.push(`${record.noticeNumber} ${lot.id}`);
				}
				if (decision.verdict !== 'GO') continue;
				go += 1;
				if (lot.reserved === undefined) unknownReserved.push(`${record.noticeNumber} ${lot.id}`);
			}
		}
		// The count the build spec and the pitch quote. Eighteen distinct listed phrases and both German
		// patterns each decide at least one lot here, so one dropped or narrowed changes it: update it
		// only on purpose.
		expect(go).toBe(64);
		expect(unknownReserved).toEqual([]);
		expect(tagHidesDocuments).toEqual([]);
	}, 30_000);
});

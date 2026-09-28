import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fc, test } from '@fast-check/vitest';
import { describe, expect, it, vi } from 'vitest';
import { readFixture } from '../../test/fixtures/node';
import { CAPTURE_ID, FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { readNotice } from '../ingest/read-notice';
import type { DocumentsLink, NoticeRecord } from '../ingest/record';
import { NoticeRecordSchema, SnapshotIndexSchema } from '../snapshot/index-row';
import { coverage, summarizeLot, type LotCoverageInput } from './coverage-facts';
import { pointsToDocuments } from './document-pointer';
import { coverageLines, readingStatus, toLotInput, type CoverageLine } from './reading';
import { LOT_VERDICTS, VERDICT_LABELS } from './verdict';

vi.mock('./coverage-facts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./coverage-facts')>();
	return { ...actual, coverage: vi.fn(actual.coverage) };
});

const CRITERIA_IN_DOCUMENTS = 'Criteria in the documents';
const CRITERIA_IN_DOCUMENTS_REASON =
	'Part of the criteria sit in the procurement documents or the ESPD, which this version does not read yet.';
const ONE_CRITERION = '1 criterion, not read yet';
const ONE_CRITERION_REASON =
	'1 selection criterion is published in the notice, shown as published and not compared with your firm yet.';
const NO_CRITERIA = 'No criteria in the notice';
const NO_CRITERIA_REASON =
	'No lot in this notice publishes selection criteria in the notice itself.';

const READ_NONE = 'Read: the notice, which publishes no selection criteria for this lot.';
const READ_ONE = 'Read: 1 selection criterion published in the notice for this lot.';
const NOT_READ_DOCUMENTS =
	'Not read: the procurement documents, which the buyer names as a source of criteria.';
const NOT_READ_ESPD = 'Not read: the ESPD, which the buyer names as a source of criteria.';
const NOT_READ_POINTER = 'Not read: the documents a criterion refers to.';
const NOT_READ_UNNAMED =
	'Not read: any criteria outside the notice, which names no source of criteria this version can read for this lot.';
const UNKNOWN_SOURCE = 'epo-unknown';
const NOT_ASSESSED =
	"Not assessed: exclusion grounds, registration or authorisation, declarations the notice demands, and the buyer's shortlisting.";
const NOT_COMPARED = 'Not compared: your firm profile. This version shows criteria as published.';

const NOTICE = 'epo-notice';
const DOCUMENTS = 'epo-procurement-document';
const ESPD = 'epo-sub-espd';

const readN = (count: number) =>
	`Read: ${count} selection criteria published in the notice for this lot.`;
const plural = (count: number) => `${count} criteria, not read yet`;
const pluralReason = (count: number) =>
	`${count} selection criteria are published in the notice, shown as published and not compared with your firm yet.`;
const fullLine = (line: CoverageLine) => `${line.status}: ${line.text}`;
const fullLines = (lines: CoverageLine[]) => lines.map(fullLine);

const lotInput = (
	criteriaCount: number,
	sources: string[],
	pointing = false
): LotCoverageInput => ({ criteriaCount, sources, pointsToDocuments: pointing });

function recordOf(role: RoleName, which = 0): NoticeRecord {
	const entry = FIXTURE_ROLES[role];
	const noticeNumber = entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
	const result = readNotice(new TextEncoder().encode(readFixture(role, which)), { noticeNumber });
	if (!result.ok) throw new Error(`${role} did not read: ${result.detail}`);
	return result.record;
}

const inputsOf = (record: NoticeRecord) => record.lots.map(summarizeLot);

describe('summarizeLot and coverage', () => {
	it('reads documents-only 600367-2026 as no criteria and a source not read', () => {
		const [input] = inputsOf(recordOf('documents-only', 0));
		expect(input).toEqual(lotInput(0, [DOCUMENTS]));
		const facts = coverage(input);
		expect(facts.facts).toEqual(['NO_CRITERIA', 'SOURCE_UNREAD']);
		expect(facts).toMatchObject({ namesNotice: false, namesDocuments: true, namesEspd: false });
		expect(facts.criteriaInNotice).toBe(0);
	});

	it('reads espd-only 601156-2026 as naming the ESPD, a source not read', () => {
		const facts = coverage(inputsOf(recordOf('espd-only'))[0]);
		expect(facts).toMatchObject({ namesNotice: false, namesDocuments: false, namesEspd: true });
		expect(facts.facts).toContain('SOURCE_UNREAD');
	});

	it('reads one-lot 609955-2026 as six criteria in the notice that point to the documents', () => {
		const [input] = inputsOf(recordOf('one-lot'));
		expect(input).toEqual(lotInput(6, [NOTICE], true));
		const facts = coverage(input);
		expect(facts).toMatchObject({
			namesNotice: true,
			namesDocuments: false,
			namesEspd: false,
			criteriaInNotice: 6,
			pointsToDocuments: true
		});
		expect(facts.facts).toEqual(['SOURCE_UNREAD']);
	});

	it('reads a notice-source lot with no criteria as NO_CRITERIA alone', () => {
		const facts = coverage(inputsOf(recordOf('notice-source-no-criteria'))[0]);
		expect(facts).toMatchObject({ namesNotice: true, criteriaInNotice: 0 });
		expect(facts.facts).toEqual(['NO_CRITERIA']);
	});

	it('gives a notice-only lot with read criteria and no pointer no fact at all', () => {
		expect(coverage(lotInput(2, [NOTICE])).facts).toEqual([]);
	});

	it('reads a lot that names no source, or one this version does not know, as a source not read', () => {
		for (const sources of [[], [UNKNOWN_SOURCE], [NOTICE, UNKNOWN_SOURCE]]) {
			const facts = coverage(lotInput(2, sources));
			expect(facts, JSON.stringify(sources)).toMatchObject({
				sourceUnnamed: true,
				noticeIsOnlySource: false
			});
			expect(facts.facts).toEqual(['SOURCE_UNREAD']);
		}
	});

	it('reads each known source as named, and the notice alone as the only source', () => {
		expect(coverage(lotInput(2, [NOTICE]))).toMatchObject({
			sourceUnnamed: false,
			noticeIsOnlySource: true
		});
		for (const source of [DOCUMENTS, ESPD]) {
			expect(coverage(lotInput(2, [source])), source).toMatchObject({
				sourceUnnamed: false,
				noticeIsOnlySource: false
			});
		}
	});

	it('keeps the sources as declared, a repeat included, without sharing the array', () => {
		const lot = { criteria: [], criteriaSources: [NOTICE, NOTICE] };
		const input = summarizeLot(lot);
		expect(input.sources).toEqual([NOTICE, NOTICE]);
		expect(input.sources).not.toBe(lot.criteriaSources);
	});
});

describe('readingStatus', () => {
	it('tags 609955-2026 "Criteria in the documents" because its criteria point there', () => {
		expect(readingStatus(inputsOf(recordOf('one-lot')))).toEqual({
			tag: 'criteria-in-documents',
			count: 6,
			text: CRITERIA_IN_DOCUMENTS,
			reason: CRITERIA_IN_DOCUMENTS_REASON
		});
	});

	it('tags a notice whose lots name the documents or the ESPD "Criteria in the documents"', () => {
		for (const record of [recordOf('documents-only', 1), recordOf('espd-only')]) {
			expect(readingStatus(inputsOf(record)).text).toBe(CRITERIA_IN_DOCUMENTS);
		}
	});

	it('counts criteria across every lot of a notice-only notice without pointers', () => {
		expect(readingStatus([lotInput(2, [NOTICE]), lotInput(3, [NOTICE])])).toEqual({
			tag: 'criteria-not-read',
			count: 5,
			text: plural(5),
			reason: pluralReason(5)
		});
	});

	it('says "1 criterion, not read yet" for exactly one criterion', () => {
		expect(readingStatus([lotInput(1, [NOTICE]), lotInput(0, [NOTICE])])).toEqual({
			tag: 'criteria-not-read',
			count: 1,
			text: ONE_CRITERION,
			reason: ONE_CRITERION_REASON
		});
	});

	it('tags the notice-source-no-criteria fixture "No criteria in the notice"', () => {
		expect(readingStatus(inputsOf(recordOf('notice-source-no-criteria')))).toEqual({
			tag: 'no-criteria-in-notice',
			count: 0,
			text: NO_CRITERIA,
			reason: NO_CRITERIA_REASON
		});
	});

	it('gives "Criteria in the documents" to a lot that names no source or an unknown one', () => {
		for (const sources of [[], [UNKNOWN_SOURCE]]) {
			expect(readingStatus([lotInput(3, sources)]).tag, JSON.stringify(sources)).toBe(
				'criteria-in-documents'
			);
		}
	});

	it('gives "Criteria in the documents" to criteria in the notice with one pointing criterion', () => {
		const status = readingStatus([lotInput(3, [NOTICE]), lotInput(4, [NOTICE], true)]);
		expect(status.text).toBe(CRITERIA_IN_DOCUMENTS);
		expect(status.count).toBe(7);
	});

	const lotArb = fc.record({
		criteria: fc.array(fc.record({ pointsToDocuments: fc.boolean() }), { maxLength: 5 }),
		criteriaSources: fc.subarray([NOTICE, DOCUMENTS, ESPD])
	});
	const shuffled = <T>(items: T[]) =>
		fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length });

	test.prop([
		fc.array(lotArb, { minLength: 1, maxLength: 4 }).chain((lots) =>
			fc.tuple(
				fc.constant(lots),
				shuffled(lots).chain((order) =>
					fc.tuple(
						...order.map((lot) => shuffled(lot.criteria).map((criteria) => ({ ...lot, criteria })))
					)
				)
			)
		)
	])('is identical for any order of the lots and of their criteria', ([lots, reordered]) => {
		expect(readingStatus(reordered.map(summarizeLot))).toEqual(
			readingStatus(lots.map(summarizeLot))
		);
	});

	const verdictWord = new RegExp(
		`\\b(${[...LOT_VERDICTS, ...Object.values(VERDICT_LABELS), 'Partner needed', 'Out alone'].join('|')})\\b`
	);

	test.prop([fc.array(lotArb, { minLength: 1, maxLength: 4 })])(
		'never words the tag, the reason or a coverage line as a verdict',
		(lots) => {
			const inputs = lots.map(summarizeLot);
			const status = readingStatus(inputs);
			const lines = inputs.flatMap((input) => fullLines(coverageLines(input)));
			for (const text of [status.text, status.reason, ...lines]) {
				expect(text).not.toMatch(verdictWord);
			}
		}
	);
});

describe('coverageLines', () => {
	it('lists what was read and the named documents for 600017-2026, whose lot names both', () => {
		const record = recordOf('escaped-text');
		const [lot] = record.lots;
		expect(lot.criteriaSources).toEqual([NOTICE, DOCUMENTS]);
		const documents = lot.documents ?? record.documents;
		expect(documents?.href).toBeDefined();
		const lines = coverageLines(summarizeLot(lot), documents);
		expect(fullLines(lines)).toEqual([
			readN(4),
			NOT_READ_DOCUMENTS,
			NOT_READ_POINTER,
			NOT_ASSESSED,
			NOT_COMPARED
		]);
		expect(lines[1].link).toEqual(documents);
	});

	it('shows both a Read line and the documents line for a lot naming notice and documents', () => {
		const link: DocumentsLink = {
			published: 'https://example.org/docs',
			href: 'https://example.org/docs'
		};
		expect(fullLines(coverageLines(lotInput(4, [NOTICE, DOCUMENTS]), link))).toEqual([
			readN(4),
			NOT_READ_DOCUMENTS,
			NOT_ASSESSED,
			NOT_COMPARED
		]);
	});

	it('says the notice was read and publishes no criteria for a lot with none', () => {
		const [input] = inputsOf(recordOf('notice-source-no-criteria'));
		expect(fullLines(coverageLines(input))).toEqual([READ_NONE, NOT_ASSESSED, NOT_COMPARED]);
	});

	it('names the ESPD as not read for espd-only 601156-2026', () => {
		const [input] = inputsOf(recordOf('espd-only'));
		expect(fullLines(coverageLines(input))).toEqual([
			READ_NONE,
			NOT_READ_ESPD,
			NOT_ASSESSED,
			NOT_COMPARED
		]);
	});

	it('names the documents a criterion refers to for 609955-2026', () => {
		const [input] = inputsOf(recordOf('one-lot'));
		const lines = coverageLines(input);
		expect(fullLines(lines)).toEqual([readN(6), NOT_READ_POINTER, NOT_ASSESSED, NOT_COMPARED]);
		expect(lines.every((line) => line.link === undefined)).toBe(true);
	});

	it('says "1 selection criterion" for one', () => {
		expect(fullLines(coverageLines(lotInput(1, [NOTICE])))[0]).toBe(READ_ONE);
	});

	it('lists the documents, the ESPD and a pointing criterion together, in that order', () => {
		expect(fullLines(coverageLines(lotInput(2, [NOTICE, DOCUMENTS, ESPD], true)))).toEqual([
			readN(2),
			NOT_READ_DOCUMENTS,
			NOT_READ_ESPD,
			NOT_READ_POINTER,
			NOT_ASSESSED,
			NOT_COMPARED
		]);
	});

	it('says criteria outside the notice were not read when the lot names no source it can read', () => {
		for (const sources of [[], [UNKNOWN_SOURCE]]) {
			expect(fullLines(coverageLines(lotInput(2, sources))), JSON.stringify(sources)).toEqual([
				readN(2),
				NOT_READ_UNNAMED,
				NOT_ASSESSED,
				NOT_COMPARED
			]);
		}
	});

	it('leaves the documents line without a link when the notice names none', () => {
		const [, documentsLine] = coverageLines(lotInput(0, [DOCUMENTS]));
		expect(fullLine(documentsLine)).toBe(NOT_READ_DOCUMENTS);
		expect(documentsLine).not.toHaveProperty('link');
	});

	it('passes a restricted documents link to its line with the flag intact', () => {
		const lot = recordOf('restricted-documents').lots[0];
		expect(lot.documents?.restricted).toBe(true);
		// Every restricted link in the capture sits on a lot whose BT-821 names only the notice, so the
		// lot's own sources never reach the documents line; the link is paired here with a documents source.
		const input = { ...summarizeLot(lot), sources: [NOTICE, DOCUMENTS] };
		const line = coverageLines(input, lot.documents).find(
			(each) => fullLine(each) === NOT_READ_DOCUMENTS
		);
		expect(line?.link).toEqual(lot.documents);
		expect(line?.link).toEqual({
			published: 'https://app.tenpu.eu/public/tender/dps/1167',
			href: 'https://app.tenpu.eu/public/tender/dps/1167',
			restricted: true
		});
	});

	test.prop([
		fc.record({
			criteriaCount: fc.nat({ max: 40 }),
			sources: fc.subarray([NOTICE, DOCUMENTS, ESPD]),
			pointsToDocuments: fc.boolean()
		})
	])('ends every lot with the Not assessed and Not compared lines', (input) => {
		const lines = coverageLines(input);
		expect(fullLines(lines).slice(-2)).toEqual([NOT_ASSESSED, NOT_COMPARED]);
		expect(lines[0].status).toBe('Read');
		for (const line of lines) {
			expect(['Read', 'Not read', 'Not assessed', 'Not compared']).toContain(line.status);
		}
	});
});

describe('one coverage function for the tag, the coverage list and the verdict input', () => {
	it('is called by readingStatus, by coverageLines and by toLotInput', () => {
		const counted = vi.mocked(coverage);
		const [input] = inputsOf(recordOf('one-lot'));
		counted.mockClear();
		readingStatus([input]);
		expect(counted).toHaveBeenCalledWith(input);
		counted.mockClear();
		coverageLines(input);
		expect(counted).toHaveBeenCalledTimes(1);
		expect(counted).toHaveBeenCalledWith(input);
		counted.mockClear();
		toLotInput(input, ['MET']);
		expect(counted).toHaveBeenCalledTimes(1);
		expect(counted).toHaveBeenCalledWith(input);
	});
});

describe('toLotInput', () => {
	it('passes the states and the coverage facts to the verdict input', () => {
		expect(toLotInput(lotInput(6, [NOTICE], true), ['MET', 'INFO'])).toEqual({
			states: ['MET', 'INFO'],
			facts: ['SOURCE_UNREAD'],
			noticeIsOnlySource: true,
			pointsToDocuments: true
		});
	});

	it('makes the notice the only source only when every declared source is the notice', () => {
		expect(toLotInput(lotInput(2, [NOTICE, NOTICE]), []).noticeIsOnlySource).toBe(true);
		expect(toLotInput(lotInput(2, [NOTICE, DOCUMENTS]), []).noticeIsOnlySource).toBe(false);
		expect(toLotInput(lotInput(2, [ESPD]), []).noticeIsOnlySource).toBe(false);
	});

	it('never makes the notice the only source of a lot that declares no source or an unknown one', () => {
		expect(toLotInput(lotInput(2, []), ['MET', 'MET']).noticeIsOnlySource).toBe(false);
		expect(
			toLotInput(lotInput(2, [NOTICE, UNKNOWN_SOURCE]), ['MET', 'MET']).noticeIsOnlySource
		).toBe(false);
	});
});

describe(`the records built from the ${CAPTURE_ID} capture`, () => {
	const CENSUS_MS = 30_000;
	const folder = join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID);

	it(
		'label every criterion and give every index row lot its coverage input',
		() => {
			const index = SnapshotIndexSchema.parse(
				JSON.parse(readFileSync(join(folder, 'index.json'), 'utf8'))
			);
			expect(index.rows).toHaveLength(363);
			const census: Record<string, { pointing: number; plain: number }> = {};
			const tags: Record<string, number> = {};
			for (const row of index.rows) {
				const { tag } = readingStatus(row.lots.map((lot) => lot.coverage));
				tags[tag] = (tags[tag] ?? 0) + 1;
				const record = NoticeRecordSchema.parse(
					JSON.parse(readFileSync(join(folder, 'records', `${row.noticeNumber}.json`), 'utf8'))
				);
				expect(row.lots.map((lot) => lot.coverage)).toEqual(record.lots.map(summarizeLot));
				for (const criterion of record.lots.flatMap((lot) => lot.criteria)) {
					expect(typeof criterion.pointsToDocuments).toBe('boolean');
					const labels = criterion.descriptions.map((each) => pointsToDocuments(each.text));
					expect(criterion.pointsToDocuments).toBe(labels.includes(true));
					for (const [position, each] of criterion.descriptions.entries()) {
						const tally = (census[each.lang ?? 'unknown'] ??= { pointing: 0, plain: 0 });
						if (labels[position]) tally.pointing += 1;
						else tally.plain += 1;
					}
				}
			}
			// The tag counts the build spec and the pitch quote.
			expect(tags).toEqual({ 'criteria-in-documents': 313, 'criteria-not-read': 50 });
			expect(Object.keys(census).sort()).toEqual(['de', 'fr', 'nl']);
			for (const tally of Object.values(census)) {
				expect(tally.pointing).toBeGreaterThan(0);
				expect(tally.plain).toBeGreaterThan(0);
			}
		},
		CENSUS_MS
	);
});

// The reading-status tag on the list and the coverage list on the tender page, both worded from
// coverage() over notice facts alone: no profile value reaches either, and neither string names a
// verdict (SPEC R3).
import type { DocumentsLink } from '../ingest/record.ts';
import { coverage, type LotCoverageInput } from './coverage-facts.ts';
import type { CriterionState, LotInput } from './verdict.ts';

export interface ReadingStatus {
	tag: 'criteria-in-documents' | 'criteria-not-read' | 'no-criteria-in-notice';
	count: number;
	text: string;
	reason: string;
}

export interface CoverageLine {
	status: 'Read' | 'Not read' | 'Not assessed' | 'Not compared';
	text: string;
	link?: DocumentsLink;
}

const NOT_ASSESSED: CoverageLine = {
	status: 'Not assessed',
	text: "exclusion grounds, registration or authorisation, declarations the notice demands, and the buyer's shortlisting."
};
const NOT_COMPARED: CoverageLine = {
	status: 'Not compared',
	text: 'your firm profile. This version shows criteria as published.'
};

const inNotice = (count: number) =>
	count === 1 ? '1 criterion in the notice' : `${count} criteria in the notice`;

// The documents tag wins whenever any lot names the documents or the ESPD, names no source this
// version can read, or has a criterion pointing there, even beside criteria in the notice (UI-SPEC
// section 4). That is the SOURCE_UNREAD fact the verdict input carries. Beside criteria in the
// notice it counts them first, so a notice whose clause the tender page quotes never reads as if
// it held none. The count says "more in the documents" only where a lot names the documents or the
// ESPD or a criterion points there: a notice that only names no readable source may hold more, and
// the tender page says no more than that.
export function readingStatus(lots: readonly LotCoverageInput[]): ReadingStatus {
	const facts = lots.map((lot) => coverage(lot));
	const count = facts.reduce((total, lot) => total + lot.criteriaInNotice, 0);
	if (facts.some((lot) => lot.facts.includes('SOURCE_UNREAD'))) {
		const named = facts.some((lot) => lot.namesDocuments || lot.namesEspd || lot.pointsToDocuments);
		if (count > 0 && !named) {
			return {
				tag: 'criteria-in-documents',
				count,
				text: `${inNotice(count)}, more may sit elsewhere`,
				reason:
					'The notice names no source of criteria this version can read, so more may sit outside it.'
			};
		}
		return {
			tag: 'criteria-in-documents',
			count,
			text: count === 0 ? 'Criteria in the documents' : `${inNotice(count)}, more in the documents`,
			reason:
				'Part of the criteria sit in the procurement documents or the ESPD, which this version does not read yet.'
		};
	}
	if (count === 0) {
		return {
			tag: 'no-criteria-in-notice',
			count,
			text: 'No criteria in the notice',
			reason: 'No lot in this notice publishes selection criteria in the notice itself.'
		};
	}
	// Worded from the notice alone, true whether or not a capture read the clauses: the tender page
	// is where a reading shows, and the list must never say the opposite of it.
	const one = count === 1;
	return {
		tag: 'criteria-not-read',
		count,
		text: inNotice(count),
		reason: one
			? '1 selection criterion is published in the notice itself. Open the tender to see how it reads.'
			: `${count} selection criteria are published in the notice itself. Open the tender to see how each one reads.`
	};
}

function readLine(criteria: number): CoverageLine {
	if (criteria === 0) {
		return {
			status: 'Read',
			text: 'the notice, which publishes no selection criteria for this lot.'
		};
	}
	const counted = criteria === 1 ? '1 selection criterion' : `${criteria} selection criteria`;
	return { status: 'Read', text: `${counted} published in the notice for this lot.` };
}

// The documents link goes on as the record holds it: a restricted one keeps its flag, so the page
// can word it as access on request rather than as the open documents.
export function coverageLines(input: LotCoverageInput, documents?: DocumentsLink): CoverageLine[] {
	const facts = coverage(input);
	const lines = [readLine(facts.criteriaInNotice)];
	if (facts.namesDocuments) {
		lines.push({
			status: 'Not read',
			text: 'the procurement documents, which the buyer names as a source of criteria.',
			...(documents && { link: documents })
		});
	}
	if (facts.namesEspd) {
		lines.push({
			status: 'Not read',
			text: 'the ESPD, which the buyer names as a source of criteria.'
		});
	}
	if (facts.sourceUnnamed) {
		lines.push({
			status: 'Not read',
			text: 'any criteria outside the notice, which names no source of criteria this version can read for this lot.'
		});
	}
	if (facts.pointsToDocuments) {
		lines.push({ status: 'Not read', text: 'the documents a criterion refers to.' });
	}
	return [...lines, NOT_ASSESSED, NOT_COMPARED];
}

// A lot that names no BT-821 source, or one this version does not know, is never notice-only, so it
// cannot reach GO. Its reason is criteria-in-documents, the cautious reading, because SPEC R2 fixes
// the ASK FIRST reasons at five; the list tag reads the same coverage() and says the same.
export function toLotInput(input: LotCoverageInput, states: readonly CriterionState[]): LotInput {
	const facts = coverage(input);
	return {
		states,
		facts: facts.facts,
		noticeIsOnlySource: facts.noticeIsOnlySource,
		pointsToDocuments: input.pointsToDocuments
	};
}

// The reading-status tag on the list and the coverage list on the tender page, both worded from
// coverage() over notice facts alone: no profile value reaches either, and neither string names a
// verdict (SPEC R3).
import type { DocumentsLink } from '../ingest/record.ts';
import { coverage, SOURCE_NOTICE, type LotCoverageInput } from './coverage-facts.ts';
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

// "Criteria in the documents" wins whenever any lot names the documents or the ESPD or any
// criterion points there, even beside criteria in the notice (UI-SPEC section 4).
export function readingStatus(lots: readonly LotCoverageInput[]): ReadingStatus {
	const facts = lots.map((lot) => coverage(lot));
	const count = facts.reduce((total, lot) => total + lot.criteriaInNotice, 0);
	if (facts.some((lot) => lot.namesDocuments || lot.namesEspd || lot.pointsToDocuments)) {
		return {
			tag: 'criteria-in-documents',
			count,
			text: 'Criteria in the documents',
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
	const one = count === 1;
	return {
		tag: 'criteria-not-read',
		count,
		text: one ? '1 criterion, not read yet' : `${count} criteria, not read yet`,
		reason: `${one ? '1 selection criterion is' : `${count} selection criteria are`} published in the notice, shown as published and not compared with your firm yet.`
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
	if (facts.pointsToDocuments) {
		lines.push({ status: 'Not read', text: 'the documents a criterion refers to.' });
	}
	return [...lines, NOT_ASSESSED, NOT_COMPARED];
}

// every() is true over an empty list, so a lot that declares no BT-821 source would otherwise
// count as notice-only and could reach GO. Its reason stays criteria-in-documents, the cautious
// reading, because SPEC R2 fixes the ASK FIRST reasons at five.
export function toLotInput(input: LotCoverageInput, states: readonly CriterionState[]): LotInput {
	return {
		states,
		facts: coverage(input).facts,
		noticeIsOnlySource:
			input.sources.length > 0 && input.sources.every((source) => source === SOURCE_NOTICE),
		pointsToDocuments: input.pointsToDocuments
	};
}

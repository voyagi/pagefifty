// What was read for a lot and what was not, decided once. The list's reading-status tag and the
// tender page's coverage list both call coverage(), so the two can never disagree.
// Imported by src/lib/snapshot/index-row.ts at build time under Node type stripping: erasable
// syntax only, relative imports with their .ts extension.
import type { CoverageFact } from './verdict.ts';

// BT-821 selection-criteria-source codes as published.
const SOURCE_NOTICE = 'epo-notice';
const SOURCE_DOCUMENTS = 'epo-procurement-document';
const SOURCE_ESPD = 'epo-sub-espd';
const KNOWN_SOURCES: ReadonlySet<string> = new Set([SOURCE_NOTICE, SOURCE_DOCUMENTS, SOURCE_ESPD]);

// Stored on every index row lot, so the list computes its tag without loading full records.
export interface LotCoverageInput {
	criteriaCount: number;
	sources: string[];
	pointsToDocuments: boolean;
}

export interface CoverageFacts {
	namesNotice: boolean;
	namesDocuments: boolean;
	namesEspd: boolean;
	// No source named, or a code this version does not know: part of the criteria may sit anywhere.
	sourceUnnamed: boolean;
	noticeIsOnlySource: boolean;
	criteriaInNotice: number;
	pointsToDocuments: boolean;
	facts: CoverageFact[];
}

export function summarizeLot(lot: {
	criteria: readonly { pointsToDocuments: boolean }[];
	criteriaSources: readonly string[];
}): LotCoverageInput {
	return {
		criteriaCount: lot.criteria.length,
		sources: [...lot.criteriaSources],
		pointsToDocuments: lot.criteria.some((criterion) => criterion.pointsToDocuments)
	};
}

// The tag, the coverage list and the verdict input all read this, so a lot that names no source
// cannot read "criteria in the notice" on the list while its verdict says criteria-in-documents.
export function coverage(input: LotCoverageInput): CoverageFacts {
	const namesDocuments = input.sources.includes(SOURCE_DOCUMENTS);
	const namesEspd = input.sources.includes(SOURCE_ESPD);
	const sourceUnnamed =
		input.sources.length === 0 || input.sources.some((source) => !KNOWN_SOURCES.has(source));
	const facts: CoverageFact[] = [];
	if (input.criteriaCount === 0) facts.push('NO_CRITERIA');
	if (namesDocuments || namesEspd || sourceUnnamed || input.pointsToDocuments) {
		facts.push('SOURCE_UNREAD');
	}
	return {
		namesNotice: input.sources.includes(SOURCE_NOTICE),
		namesDocuments,
		namesEspd,
		sourceUnnamed,
		// every() is true over an empty list, so a lot that names no source is never notice-only.
		noticeIsOnlySource:
			input.sources.length > 0 && input.sources.every((source) => source === SOURCE_NOTICE),
		criteriaInNotice: input.criteriaCount,
		pointsToDocuments: input.pointsToDocuments,
		facts
	};
}

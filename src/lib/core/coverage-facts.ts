// What was read for a lot and what was not, decided once. The list's reading-status tag and the
// tender page's coverage list both call coverage(), so the two can never disagree.
// Imported by src/lib/snapshot/index-row.ts at build time under Node type stripping: erasable
// syntax only, relative imports with their .ts extension.
import type { CoverageFact } from './verdict.ts';

// BT-821 selection-criteria-source codes as published.
export const SOURCE_NOTICE = 'epo-notice';
const SOURCE_DOCUMENTS = 'epo-procurement-document';
const SOURCE_ESPD = 'epo-sub-espd';

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

export function coverage(input: LotCoverageInput): CoverageFacts {
	const namesDocuments = input.sources.includes(SOURCE_DOCUMENTS);
	const namesEspd = input.sources.includes(SOURCE_ESPD);
	const facts: CoverageFact[] = [];
	if (input.criteriaCount === 0) facts.push('NO_CRITERIA');
	if (namesDocuments || namesEspd || input.pointsToDocuments) facts.push('SOURCE_UNREAD');
	return {
		namesNotice: input.sources.includes(SOURCE_NOTICE),
		namesDocuments,
		namesEspd,
		criteriaInNotice: input.criteriaCount,
		pointsToDocuments: input.pointsToDocuments,
		facts
	};
}

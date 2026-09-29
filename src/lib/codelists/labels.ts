// The official English label of each eForms selection-criterion code, from the tracked EU code list.
// A label names the kind of criterion; it is not a reading of what a clause demands (D-13).
import list from './selection-criterion.json';

const LABELS: ReadonlyMap<string, string> = new Map(
	list.codes.map(({ code, label }) => [code, label])
);

export function criterionLabel(code: string): string | undefined {
	return LABELS.get(code);
}

// The English names in the EU code lists for a criterion's parameters (eForms SDK codelists
// number-weight.gc and number-threshold.gc, read 2026-09-29). A name says what kind of number the
// buyer published beside the criterion, never what it means for a firm.
const PARAMETER_LABELS: ReadonlyMap<string, string> = new Map([
	['number-weight/dec-exa', 'Weight (decimal, exact)'],
	['number-weight/dec-mid', 'Weight (decimal, middle of a range)'],
	['number-weight/ord-imp', 'Order of importance'],
	['number-weight/per-exa', 'Weight (percentage, exact)'],
	['number-weight/per-mid', 'Weight (percentage, middle of a range)'],
	['number-weight/poi-exa', 'Weight (points, exact)'],
	['number-weight/poi-mid', 'Weight (points, middle of a range)'],
	['number-threshold/max-pass', 'Maximum number of tenders passing'],
	['number-threshold/min-score', 'Minimum score']
]);

export function parameterLabel(listName: string | undefined, code: string): string | undefined {
	return listName === undefined ? undefined : PARAMETER_LABELS.get(`${listName}/${code}`);
}

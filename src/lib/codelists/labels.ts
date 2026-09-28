// The official English label of each eForms selection-criterion code, from the tracked EU code list.
// A label names the kind of criterion; it is not a reading of what a clause demands (D-13).
import list from './selection-criterion.json';

const LABELS: ReadonlyMap<string, string> = new Map(
	list.codes.map(({ code, label }) => [code, label])
);

export function criterionLabel(code: string): string | undefined {
	return LABELS.get(code);
}

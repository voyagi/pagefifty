// A firm's own figure in whole euros, as every page that shows a profile writes it: "EUR 1,240,000".
// A floor read from a tender keeps its cents and has its own formatter in tenders/verdict-view.
export const wholeEuros = (value: number): string =>
	`EUR ${Math.round(value).toLocaleString('en-GB')}`;

// TED writes the language of every text as an EU ISO 639-3 code (DEU, NLD, FRA), which is not a
// valid BCP 47 tag, so screen readers and hyphenation would not recognise lang="DEU".
const BCP47_BY_TED_CODE: ReadonlyMap<string, string> = new Map([
	['BUL', 'bg'],
	['CES', 'cs'],
	['DAN', 'da'],
	['DEU', 'de'],
	['ELL', 'el'],
	['ENG', 'en'],
	['EST', 'et'],
	['FIN', 'fi'],
	['FRA', 'fr'],
	['GLE', 'ga'],
	['HRV', 'hr'],
	['HUN', 'hu'],
	['ITA', 'it'],
	['LAV', 'lv'],
	['LIT', 'lt'],
	['MLT', 'mt'],
	['NLD', 'nl'],
	['POL', 'pl'],
	['POR', 'pt'],
	['RON', 'ro'],
	['SLK', 'sk'],
	['SLV', 'sl'],
	['SPA', 'es'],
	['SWE', 'sv']
]);

export function toBcp47(code: string): string | undefined {
	return BCP47_BY_TED_CODE.get(code);
}

// Every amount, count, period and certificate name a comparison uses is read here, by code, from
// the verified quote; a number the model wrote is only ever compared with this reading (SPEC R4).
// Loaded by the capture command under Node type stripping: erasable syntax only, no imports.

type Basis = 'net' | 'gross' | 'unstated';
type Comparator = 'at-least' | 'more-than' | 'unstated';

export type MoneyReading =
	| { kind: 'none' }
	| { kind: 'several' }
	| { kind: 'one'; cents: number; basis: Basis; comparator: Comparator };

export type CountReading = { kind: 'none' } | { kind: 'several' } | { kind: 'one'; count: number };

export interface PeriodReading {
	mode: 'average' | 'each' | 'sum' | 'any-one' | 'unstated';
	years: number | null;
	// The text states a count of years, or a range of years, code cannot settle, so no default may
	// stand in for it.
	yearsUnread: boolean;
	named: number[];
}

export interface StandardsReading {
	standards: string[];
	// 'mixed' when the list is neither one plain choice nor one plain conjunction.
	join: 'any' | 'all' | 'mixed';
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// A phrase matches as whole words, case-insensitive, with any run of spaces between its words and
// either apostrophe; a prefix also matches the compounds it starts ("Mindestumsatz").
function phrases(words: readonly string[], prefixes: readonly string[] = []): RegExp {
	const exact = words.map((word) =>
		escape(word)
			.replace(/ /g, String.raw`\s+`)
			.replace(/'/g, `['\u2019]`)
	);
	const open = prefixes.map((prefix) => `${escape(prefix)}\\p{L}*`);
	return new RegExp(
		`(?<![\\p{L}\\p{N}])(?:${[...exact, ...open].join('|')})(?![\\p{L}\\p{N}])`,
		'iu'
	);
}

const SPACE = String.raw`[ \u00A0\u202F\u2009]`;
// Spaces join digit groups only before a group of exactly three, so "2024 3 Mio." stays two numbers.
const DIGITS = String.raw`\d+(?:(?:[.,]|${SPACE}(?=\d{3}(?!\d)))\d+)*`;
const NUMBER = new RegExp(String.raw`(?<![\p{L}\p{N}.,])${DIGITS}`, 'gu');
const LONE_THOUSANDS = new Set(['de', 'nl', 'fr']);

interface Numeral {
	whole: string;
	fraction: string;
}

// Whether the last mark is the decimal mark; undefined when only the language could say and none
// was given.
function lastMarkIsDecimal(
	marks: readonly string[],
	last: string,
	lang?: string
): boolean | undefined {
	const mark = marks.at(-1);
	if (mark === undefined || mark === ' ') return false;
	if (marks.filter((each) => each === mark).length > 1) return false;
	if (marks.some((each) => each !== mark && each !== ' ')) return true;
	if (last.length !== 3) return true;
	if (lang === 'en') return mark === '.';
	// The comma is the decimal mark in German, Dutch and French: "1,250 Mio. EUR" is 1.25 million,
	// and "1,500 EUR" (three decimals of a euro) is then refused by toCents.
	return lang !== undefined && LONE_THOUSANDS.has(lang) ? mark === ',' : undefined;
}

function groupedWhole(groups: readonly string[], marks: readonly string[]): string | undefined {
	const [first, ...rest] = groups;
	const oneKind = marks.every((mark) => mark === marks[0]);
	const shaped =
		rest.length === 0 || (first.length <= 3 && rest.every((group) => group.length === 3));
	return oneKind && shaped ? groups.join('') : undefined;
}

function readNumeral(raw: string, lang?: string): Numeral | undefined {
	const marks = (raw.match(/\D/gu) ?? []).map((mark) => (/\s/u.test(mark) ? ' ' : mark));
	const groups = raw.split(/\D/u);
	const decimal = lastMarkIsDecimal(marks, groups[groups.length - 1], lang);
	if (decimal === undefined) return undefined;
	const fraction = decimal ? (groups.pop() as string) : '';
	if (decimal) marks.pop();
	const whole = groupedWhole(groups, marks);
	return whole === undefined ? undefined : { whole, fraction };
}

// Cents are built from the digit strings, never through a floating-point value.
function toCents({ whole, fraction }: Numeral, power: number): number | undefined {
	const places = power + 2;
	if (fraction.length > places) return undefined;
	const cents = Number.parseInt(whole + fraction.padEnd(places, '0'), 10);
	return Number.isSafeInteger(cents) ? cents : undefined;
}

const CURRENCY = String.raw`(?:d['\u2019]${SPACE}*)?(?:EUR|euros?|€)(?![\p{L}\p{N}])`;
const FUSED = new RegExp(String.raw`^${SPACE}*(TEUR|T€|M€)(?![\p{L}\p{N}])`, 'iu');
const CURRENCY_NEXT = new RegExp(`^${SPACE}*${CURRENCY}`, 'iu');
const WORD_THEN_CURRENCY = new RegExp(
	String.raw`^${SPACE}*(\p{L}[\p{L}.]*)${SPACE}*${CURRENCY}`,
	'iu'
);
const CURRENCY_BEFORE = new RegExp(String.raw`(?<![\p{L}\p{N}])${CURRENCY}${SPACE}*$`, 'iu');
const WORD_NEXT = new RegExp(String.raw`^${SPACE}*(\p{L}[\p{L}.]*)`, 'u');
const MAGNITUDES: Readonly<Record<string, number>> = {
	teur: 3,
	't€': 3,
	'm€': 6,
	mio: 6,
	'mio.': 6,
	millionen: 6,
	mln: 6,
	'mln.': 6,
	miljoen: 6,
	million: 6,
	millions: 6
};
// A floor read without its multiplier would be met by every firm ("2 Mrd. EUR" as 2 euros), so a
// word that may be a multiplier this parser does not know refuses the amount instead. After a
// currency that comes first ("EUR 1 Mill.", "€1m", "EUR 2 Md") only this list stands between the
// word and a reading in euros, so it names the short forms too.
const UNKNOWN_MAGNITUDE =
	/^(?:mrd|milliarden?|mia|bn|bln|b|billions?|milliards?|miljard|mld|md|mds|m|mm|mn|mill|mil|k|tsd|tausend|duizend|mille|thousand)\.?$/iu;

type Candidate = { refused: true } | { refused: false; numeral: Numeral; power: number };

function powerAfter(rest: string): number | 'refused' | 'no currency' {
	const fused = FUSED.exec(rest);
	if (fused) return MAGNITUDES[fused[1].toLowerCase()];
	if (CURRENCY_NEXT.test(rest)) return 0;
	const worded = WORD_THEN_CURRENCY.exec(rest);
	if (!worded) return 'no currency';
	return MAGNITUDES[worded[1].toLowerCase()] ?? 'refused';
}

function powerWithCurrencyBefore(rest: string): number | 'refused' {
	const word = WORD_NEXT.exec(rest)?.[1] ?? '';
	if (UNKNOWN_MAGNITUDE.test(word)) return 'refused';
	return MAGNITUDES[word.toLowerCase()] ?? 0;
}

// ",-" or ",--" closes a whole amount ("3.000.000,- €"), so the currency after it still counts.
const ZERO_CENTS = /^,[-\u2013]{1,2}/u;

// Digits held to a number by a mark this reader does not join (an apostrophe, a figure space, two
// spaces) make it one piece of a longer number, as in "1'250'500 EUR", so the piece is refused
// rather than read as a smaller amount. One SPACE or a line break still parts two numbers.
const LOOSE_MARK = String.raw`(?:[^\p{L}\p{N}\s]|(?!${SPACE})[^\S\n]|\s{2,})`;
const GLUED_BEFORE = new RegExp(String.raw`\p{N}${LOOSE_MARK}$`, 'u');
const GLUED_AFTER = new RegExp(String.raw`^${LOOSE_MARK}\p{N}`, 'u');

function candidate(text: string, match: RegExpExecArray, lang?: string): Candidate | undefined {
	const before = text.slice(0, match.index);
	const rest = text.slice(match.index + match[0].length).replace(ZERO_CENTS, '');
	let power = powerAfter(rest);
	if (power === 'no currency') {
		if (!CURRENCY_BEFORE.test(before)) return undefined;
		power = powerWithCurrencyBefore(rest);
	}
	const glued = GLUED_BEFORE.test(before) || GLUED_AFTER.test(rest);
	const numeral = glued ? undefined : readNumeral(match[0], lang);
	return power === 'refused' || numeral === undefined
		? { refused: true }
		: { refused: false, numeral, power };
}

const NET = phrases([
	'netto',
	'ohne MwSt',
	'excl. btw',
	'exclusief btw',
	'hors TVA',
	'HTVA',
	'HT',
	'excl. VAT'
]);
const GROSS = phrases([
	'brutto',
	'inkl. MwSt',
	'incl. btw',
	'inclusief btw',
	'TVAC',
	'TTC',
	'TVA comprise',
	'incl. VAT',
	'gross'
]);
// "net" is also a Dutch adverb ("net als", just like), so it names a basis only outside Dutch.
const NET_WORD = phrases(['net']);
const AT_LEAST = phrases(
	[
		'mindestens',
		'mind.',
		'min.',
		'minimaal',
		'minimale',
		'minstens',
		'ten minste',
		'au minimum',
		'minimum',
		'minimal',
		'au moins',
		'at least',
		'not less than'
	],
	['Mindest']
);
// "über" is also the preposition of nearly every German declaration ("Eigenerklärung über den
// Umsatz"), so it names a comparator only directly before an amount.
const OVER_AMOUNT = new RegExp(
	String.raw`(?<![\p{L}\p{N}])über${SPACE}+(?:(?:EUR|€)${SPACE}*)?\d`,
	'iu'
);
const MORE_THAN = phrases([
	'mehr als',
	'meer dan',
	'plus de',
	'supérieur à',
	'more than',
	'exceeding'
]);

function oneOf<T extends string>(found: Partial<Record<T, boolean>>, otherwise: T): T {
	const named = (Object.keys(found) as T[]).filter((key) => found[key]);
	return named.length === 1 ? named[0] : otherwise;
}

function basisOf(text: string, lang?: string): Basis {
	const net = NET.test(text) || (lang !== 'nl' && NET_WORD.test(text));
	return oneOf<Basis>({ net, gross: GROSS.test(text) }, 'unstated');
}

function comparatorOf(text: string): Comparator {
	return oneOf<Comparator>(
		{
			'at-least': AT_LEAST.test(text),
			'more-than': MORE_THAN.test(text) || OVER_AMOUNT.test(text)
		},
		'unstated'
	);
}

// Each amount of money the text names, in cents, or undefined for one code refuses to read.
function centsIn(text: string, lang?: string): (number | undefined)[] {
	return [...text.matchAll(NUMBER)]
		.map((match) => candidate(text, match, lang))
		.filter((each) => each !== undefined)
		.map((each) => (each.refused ? undefined : toCents(each.numeral, each.power)));
}

export function parseMoney(text: string, lang?: string): MoneyReading {
	const found = centsIn(text, lang);
	if (found.length > 1) return { kind: 'several' };
	const [cents] = found;
	return cents === undefined
		? { kind: 'none' }
		: { kind: 'one', cents, basis: basisOf(text, lang), comparator: comparatorOf(text) };
}

const wordsFrom = (words: readonly string[], ...ones: string[]) =>
	Object.fromEntries([
		...ones.map((word) => [word, 1]),
		...words.map((word, index) => [word, index + 2])
	]);
const NUMBER_WORDS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
	de: wordsFrom(
		['zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'],
		'eins',
		'ein',
		'eine',
		'einen'
	),
	nl: wordsFrom(
		['twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf'],
		'een',
		'één'
	),
	fr: wordsFrom(
		['deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'],
		'un',
		'une'
	),
	en: wordsFrom(
		['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
		'one'
	)
};
const ANY_LANGUAGE: Readonly<Record<string, number>> = Object.assign(
	{},
	...Object.values(NUMBER_WORDS)
);
const WORDS = Object.keys(ANY_LANGUAGE)
	.sort((left, right) => right.length - left.length)
	.join('|');

function wordValue(word: string, lang?: string): number | undefined {
	const list = (lang !== undefined && NUMBER_WORDS[lang]) || ANY_LANGUAGE;
	return list[word.toLowerCase()];
}

const STAFF = String.raw`(?:mitarbeit(?:er|ende)\p{L}*|beschäftigte\p{L}*|vzä|medewerkers|werknemers|fte|personnes|salariés|employés|employees|staff)`;
const COUNT = new RegExp(
	String.raw`(?<![\p{L}\p{N}.,])(${DIGITS}|${WORDS})${SPACE}+${STAFF}(?![\p{L}\p{N}])`,
	'giu'
);

function countOf(raw: string, lang?: string): number | undefined {
	if (!/^\d/u.test(raw)) return wordValue(raw, lang);
	const numeral = readNumeral(raw, lang);
	return numeral?.fraction === '' ? Number.parseInt(numeral.whole, 10) : undefined;
}

const countsIn = (text: string, lang?: string) =>
	[...text.matchAll(COUNT)].map((match) =>
		GLUED_BEFORE.test(text.slice(0, match.index)) ? undefined : countOf(match[1], lang)
	);

export function parseCount(text: string, lang?: string): CountReading {
	const counts = countsIn(text, lang);
	if (counts.length > 1) return { kind: 'several' };
	const [count] = counts;
	return count === undefined ? { kind: 'none' } : { kind: 'one', count };
}

const MODES = {
	average: phrases(
		['Durchschnitt', 'gemiddeld', 'gemiddelde', 'moyen', 'moyenne', 'average'],
		['durchschnittlich']
	),
	each: phrases([
		'jährlich',
		'pro Jahr',
		'je Geschäftsjahr',
		'per jaar',
		'jaarlijks',
		'par an',
		'par année',
		'per year',
		'each year',
		'yearly',
		// "In each of the last three years": anchored on the period word, so "in each of the lots"
		// names no period.
		'in each of the last',
		'each of the last',
		'in jedem der letzten',
		'in jedem der vergangenen',
		'in elk van de laatste',
		'pour chacune des'
	]),
	sum: phrases(['insgesamt', 'kumuliert', 'samen', 'cumulé', 'in total', 'combined']),
	// Anchored on the period word as "each" is: "in einem der folgenden Dokumente" chooses a
	// document, not a year, and read as any-one it would pass a floor met in one year of three.
	'any-one': phrases([
		'in einem der letzten',
		'in einem der vergangenen',
		'in één van de laatste',
		'in één van de afgelopen',
		"au cours d'un des",
		'in any one of the last',
		'in any one of the past'
	])
} as const;
// Plural nouns only ("jahren?" is Jahre or Jahren): a singular follows "pro" or "je", never a count.
const YEAR_NOUN = String.raw`(?:geschäftsjahren?|kalenderjahren?|jahren?|boekjaren|jaar|exercices|années|years)`;
// A word between a count and its noun is never itself a count or a "per", so a match can neither
// swallow a second count nor read an amount per year ("1,5 mln per jaar") as a number of years.
const BETWEEN = String.raw`(?!(?:\d|(?:${WORDS}|pro|per|par|je)(?![\p{L}\p{N}])))\S+`;
const YEARS = new RegExp(
	String.raw`(?<![\p{L}\p{N}])(\d{1,2}|${WORDS})((?:\s+${BETWEEN}){0,3}?)\s+${YEAR_NOUN}(?![\p{L}\p{N}])`,
	'giu'
);
// The words that stand between a count and its noun in "the last two completed financial years"
// and its kin. One other word alone is read as it always was; two or more need these.
const PERIOD_WORDS: ReadonlySet<string> = new Set([
	'letzten',
	'vergangenen',
	'abgeschlossenen',
	'abgeschlossene',
	'abgelaufenen',
	'vollständig',
	'vollständigen',
	'vollen',
	'bilanzierten',
	'und',
	'laatste',
	'afgelopen',
	'afgesloten',
	'beschikbare',
	'voorgaande',
	'volledige',
	'en',
	'derniers',
	'dernières',
	'précédents',
	'précédentes',
	'clos',
	'clôturés',
	'comptables',
	'complets',
	'disponibles',
	'et',
	'last',
	'past',
	'previous',
	'preceding',
	'most',
	'recent',
	'completed',
	'full',
	'financial',
	'fiscal',
	'calendar',
	'business',
	'accounting',
	'consecutive',
	'available',
	'audited',
	'closed',
	'and'
]);
const NAMED_YEAR = /(?<!\d)20\d{2}(?!\d)/g;
// What joins the two ends of a range of years: a dash of any kind, or a range word.
const RANGE_JOIN = /^\s*[-‐-―−]\s*$|^\s+(?:bis|tot|tot\s+en\s+met|t\/m|à|to|through)\s+$/iu;
// A range whose end is not a whole year ("2023-25"), or a date such as "2025-12-31".
const SHORT_RANGE = /(?<!\d)20\d{2}\s*[-‐-―−]\s*\d{2}(?!\d)/u;
const LONGEST_RANGE = 10;

// The years a text names, in text order, a range ("2023-2025", "2023 bis 2025", "2023-2024-2025")
// read as every year in it. compare.ts compares exactly the years named, so a range read as its two
// ends would leave out the years between them; a range code cannot list (backwards, longer than
// LONGEST_RANGE years, or not ending in a whole year) gives null.
function namedYears(text: string): number[] | null {
	if (SHORT_RANGE.test(text)) return null;
	const years: number[] = [];
	let previous: { year: number; end: number } | undefined;
	for (const match of text.matchAll(NAMED_YEAR)) {
		const year = Number.parseInt(match[0], 10);
		if (previous && RANGE_JOIN.test(text.slice(previous.end, match.index))) {
			if (year <= previous.year || year - previous.year > LONGEST_RANGE) return null;
			for (let between = previous.year + 1; between < year; between += 1) years.push(between);
		}
		years.push(year);
		previous = { year, end: match.index + match[0].length };
	}
	return years;
}

// A word broken at a line end ("abgeschlosse- nen") is read joined, and a word is judged by its
// letters, so a kept hyphen or a count repeated in brackets ("three (3)") passes.
const LINE_END_BREAK = /(?<=\p{L})-\s+(?=\p{L})/gu;

function knownBetween(between: string): boolean {
	const words = between
		.replace(LINE_END_BREAK, '')
		.split(/\s+/u)
		.filter((word) => word !== '');
	return (
		words.length <= 1 ||
		words.every((word) => {
			const letters = word.toLowerCase().replace(/[^\p{L}]/gu, '');
			return letters === '' || PERIOD_WORDS.has(letters);
		})
	);
}

// compare.ts reads a period stating no count over three years, so a count code cannot settle (an
// unknown word before its noun, a count word of another language, two different counts) is marked
// unread and never left to read as unstated.
function yearsOf(text: string, lang?: string): Pick<PeriodReading, 'years' | 'yearsUnread'> {
	const counts = new Set(
		[...text.matchAll(YEARS)].map((match) =>
			knownBetween(match[2]) ? countOf(match[1], lang) : undefined
		)
	);
	if (counts.has(undefined) || counts.size > 1) return { years: null, yearsUnread: true };
	const [years = null] = counts;
	return { years, yearsUnread: false };
}

export function parsePeriod(text: string, lang?: string): PeriodReading {
	const found = Object.fromEntries(
		Object.entries(MODES).map(([mode, pattern]) => [mode, pattern.test(text)])
	) as Record<keyof typeof MODES, boolean>;
	const counted = yearsOf(text, lang);
	const named = namedYears(text);
	// A year the text names beside a count it states ("the last three years; for a new firm, from
	// 2024") would otherwise settle the window on its own, so a count of years the named ones do not
	// match leaves the years unread rather than compare a three-year floor on one year.
	const conflict =
		counted.years !== null &&
		named !== null &&
		named.length > 0 &&
		new Set(named).size !== counted.years;
	return {
		mode: oneOf<PeriodReading['mode']>(found, 'unstated'),
		years: counted.years,
		// A range code cannot list leaves no named years to settle the window, so it is unread too.
		yearsUnread: counted.yearsUnread || named === null || conflict,
		named: conflict ? [] : (named ?? [])
	};
}

const DESIGNATION =
	/(?<![\p{L}\p{N}])(?:ISO\/IEC|ISO|IEC|EN|DIN|NEN|BS)[- \u00A0\u202F]?\d+(?:-\d+)*(?::\d{4})?(?!\p{N})/gu;
const ALTERNATIVE_WORDS = ['oder', 'ou', 'or', 'bzw.', 'beziehungsweise'];
const ALTERNATIVE = phrases(ALTERNATIVE_WORDS);
const ALTERNATIVE_ALONE: ReadonlySet<string> = new Set(ALTERNATIVE_WORDS);
// "of" is Dutch for "or" but an English preposition ("ISO 9001 of the firm").
const OF = phrases(['of']);

// A list reads as a choice only when every gap between two standards is an alternative word and
// nothing else. A gap naming one beside other words ("or equivalent and", "and either ... or") or
// a list choosing in one gap only is mixed, so code never widens an "and" into a choice.
export function parseStandards(text: string, lang?: string): StandardsReading {
	const matches = [...text.matchAll(DESIGNATION)];
	const gaps = matches
		.slice(1)
		.map((match, index) =>
			text.slice(matches[index].index + matches[index][0].length, match.index)
		);
	const names = (gap: string) => ALTERNATIVE.test(gap) || (lang !== 'en' && OF.test(gap));
	const alone = (gap: string) => {
		const word = gap
			.replace(/[\s,;]+/gu, ' ')
			.trim()
			.toLowerCase();
		return ALTERNATIVE_ALONE.has(word) || (lang !== 'en' && word === 'of');
	};
	const join = gaps.length > 0 && gaps.every(alone) ? 'any' : gaps.some(names) ? 'mixed' : 'all';
	return { standards: matches.map((match) => match[0]), join };
}

// A turnover the text confines to comparable work or to a field of business ("vergleichbaren
// Leistungen", "im Tätigkeitsbereich des Auftrags", "similar services") is a specific turnover,
// whatever code the buyer gave the criterion, so a general figure can never prove it met.
const BUSINESS_FIELD = phrases(
	[
		'im Tätigkeitsbereich',
		'im Geschäftsbereich',
		'im Leistungsbereich',
		'im Bereich',
		'op het gebied van',
		'dans le domaine',
		'in the field of',
		'in the area of'
	],
	[
		'vergleichbar',
		'gleichartig',
		'bereichsspezifisch',
		'vergelijkba',
		'soortgelijk',
		'similaire',
		'comparable',
		'similar'
	]
);

export const namesBusinessField = (text: string): boolean => BUSINESS_FIELD.test(text);

// Every amount a text names, as cents or as headcounts, or null when code cannot read one of them,
// so a clause's amounts can be checked against the ones its verified quotes name.
export function amountsIn(text: string, staff: boolean, lang?: string): number[] | null {
	const found = staff ? countsIn(text, lang) : centsIn(text, lang);
	return found.every((each) => each !== undefined) ? found : null;
}

export function sameNumber(
	modelText: string,
	reading: MoneyReading | CountReading,
	lang?: string
): boolean {
	if (reading.kind !== 'one') return false;
	if ('cents' in reading) {
		const model = parseMoney(modelText, lang);
		return model.kind === 'one' && model.cents === reading.cents;
	}
	const model = parseCount(modelText, lang);
	return model.kind === 'one' && model.count === reading.count;
}

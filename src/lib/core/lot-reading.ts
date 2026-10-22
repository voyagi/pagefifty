// What a model's reply may be used for: each item is only a pointer into the notice. Its quote must
// be found in its own clause (quote.ts), and every figure a comparison uses is read here by code
// from that quote; the model's number and period are kept only to be checked against the code's
// reading. Erasable syntax and relative .ts imports, as the rest of src/lib/core. Nothing here may
// import verdict.ts or compare.ts at runtime: the tender page builds its lot statuses from this
// module and must not reach the verdict model.
import type { LangText } from '../ingest/record.ts';
import { normalizeCriterionText } from './document-pointer.ts';
import { familyOf, type CriterionFamily } from './families.ts';
import {
	amountsIn,
	lotsNamed,
	parseCount,
	parseMoney,
	parsePeriod,
	parseStandards,
	sameNumber,
	type CountReading,
	type MoneyReading,
	type PeriodReading,
	type StandardsReading
} from './figures.ts';
import {
	criterionText,
	findQuote,
	normalizeQuote,
	verifyRequirements,
	withoutHyphens
} from './quote.ts';

// The shape spike 004's reply schema returns for one requirement.
export interface ModelItem {
	readonly criterion: number;
	readonly kind: string;
	readonly quote: string;
	readonly reading: string;
	readonly numberText: string;
	readonly period: string;
	readonly mandatory: boolean;
}

export interface VerifiedRequirement {
	readonly item: ModelItem;
	readonly start: number;
	// The language the quote was read in, which the page also tags it with.
	readonly lang: string | undefined;
	readonly money: MoneyReading;
	readonly count: CountReading;
	readonly period: PeriodReading;
	readonly standards: StandardsReading;
	readonly modelPeriod: PeriodReading;
	readonly modelNumber: { readonly money: boolean; readonly count: boolean };
}

export interface RejectedItem {
	readonly item: ModelItem;
	readonly reason: 'no-such-criterion' | 'too-short' | 'not-found';
}

export interface CriterionReading {
	readonly code: string;
	readonly family: CriterionFamily;
	readonly text: string;
	readonly lang: string | undefined;
	readonly verified: readonly VerifiedRequirement[];
	readonly rejected: readonly RejectedItem[];
	readonly textHasAmount: boolean;
	// Every amount code reads in each description is one some verified quote names: a model can
	// return one floor of a clause and leave out another, and quote checks prove only what it returned.
	readonly everyAmountQuoted: boolean;
	// The lot numbers any description names, each read in its own language: a quote can leave out the
	// lot label its clause puts it under.
	readonly lots: readonly number[];
}

export interface LotReading {
	readonly criteria: readonly CriterionReading[];
	// Items naming a criterion the lot does not have: never compared, and any one of them makes the
	// lot's decision read a requirement as not read.
	readonly unplaced: readonly RejectedItem[];
	readonly relianceRestricted: boolean;
}

// Wordings that bar relying on other firms' capacities or make every member of a group meet a
// criterion itself. The German ones were measured on the criterion texts of both tracked captures
// (the counts are in the 02-02 summary); the rest are each language's usual wording, found in no
// capture yet. Under Article 63 such a clause is what decides whether a partner can cure a
// shortfall, so a doubtful phrase counts: it can only turn PARTNER NEEDED into ASK FIRST.
export const RELIANCE_PHRASES: Readonly<Record<'de' | 'nl' | 'fr' | 'en', readonly string[]>> = {
	de: [
		'jedes einzelne mitglied',
		'von jedem bewerbergemeinschaftspartner',
		'von jedem bietergemeinschaftspartner',
		'gesondert nachzuweisen',
		'für alle mitglieder in voller höhe',
		'für alle mitglieder der bewerbergemeinschaft nachgewiesen',
		'wenn jedes mitglied die anforderung erfüllt',
		'eignungsleihe ist für',
		'keine eignungsleihe',
		'eignungsleihe ist ausgeschlossen',
		'eignungsleihe nicht zulässig'
	],
	nl: ['elk lid van de combinatie', 'ieder lid van de combinatie', 'geen beroep doen op'],
	fr: [
		'chaque membre du groupement',
		'chacun des membres du groupement',
		'ne peut pas recourir aux capacités'
	],
	en: ['each member of the group', 'every member of the group', 'may not rely on the capacities']
};

// Every language's list is checked whatever a text is tagged with, as document-pointer.ts does.
const EVERY_RELIANCE_PHRASE: readonly string[] = Object.values(RELIANCE_PHRASES).flat();
// A word broken by a hyphen at a line end ("Mit-\nglied" reads "mit- glied" once normalised) is
// also read joined, so the break can add a match but never hide one.
const LINE_END_BREAK = /(?<=\p{L})- (?=\p{L})/gu;

export function relianceRestricted(texts: readonly string[]): boolean {
	return texts.some((text) => {
		const normalized = normalizeCriterionText(text);
		return [normalized, normalized.replace(LINE_END_BREAK, '')].some((reading) =>
			EVERY_RELIANCE_PHRASE.some((phrase) => reading.includes(phrase))
		);
	});
}

export type LotStatus =
	| { readonly status: 'read'; readonly reading: LotReading }
	| { readonly status: 'no-criteria' }
	| { readonly status: 'not-read' }
	| { readonly status: 'unlisted' };

export interface NoticeReadingsLike {
	readonly lots: readonly (
		| { readonly lot: string; readonly status: 'read'; readonly textSha256: string }
		| { readonly lot: string; readonly status: 'no-criteria' }
		| { readonly lot: string; readonly status: 'not-read'; readonly reason: string }
	)[];
	readonly readings: readonly {
		readonly textSha256: string;
		readonly items: readonly ModelItem[];
	}[];
}

// A lot listed as read whose text hash finds no stored reading reads as unread, never as read: a
// broken readings file can withhold a comparison but never supply one.
export function lotStatusOf(
	lot: { readonly id: string; readonly criteria: readonly LotCriterion[] },
	readings: NoticeReadingsLike | undefined
): LotStatus {
	const listed = readings?.lots.find((each) => each.lot === lot.id);
	if (readings === undefined || listed === undefined) return { status: 'unlisted' };
	if (listed.status !== 'read') return { status: listed.status };
	const stored = readings.readings.find((each) => each.textSha256 === listed.textSha256);
	return stored
		? { status: 'read', reading: readLot({ criteria: lot.criteria, items: stored.items }) }
		: { status: 'not-read' };
}

export interface LotCriterion {
	readonly code: string;
	readonly descriptions: readonly LangText[];
}

function readRequirement(
	item: ModelItem,
	start: number,
	lang: string | undefined
): VerifiedRequirement {
	const money = parseMoney(item.quote, lang);
	const count = parseCount(item.quote, lang);
	return {
		item,
		start,
		lang,
		money,
		count,
		period: parsePeriod(item.quote, lang),
		standards: parseStandards(item.quote, lang),
		modelPeriod: parsePeriod(item.period, lang),
		modelNumber: {
			money: sameNumber(item.numberText, money, lang),
			count: sameNumber(item.numberText, count, lang)
		}
	};
}

// A staff floor is a count of people, so its clause holds an amount when code finds a count in it.
// An amount code refuses to read ("EUR 1 Mill.", "1'000'000 EUR") is still one the clause states,
// and a registration clause can state either kind ("Zudem mindestens 20 Mitarbeiter").
function hasAmount(text: string, family: CriterionFamily, lang: string | undefined): boolean {
	const holds = (staff: boolean) => amountsIn(text, staff, lang)?.length !== 0;
	if (family === 'not-assessed') return holds(false) || holds(true);
	return holds(family === 'staff-average');
}

function tally(amounts: readonly number[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const amount of amounts) counts.set(amount, (counts.get(amount) ?? 0) + 1);
	return counts;
}

// An amount code cannot read in a description counts as one no quote names. Amounts are counted,
// not only matched: a clause stating the same floor twice ("EUR 1 million in each year" and "EUR 1
// million in total") holds two requirements, and one quote naming it once leaves the other unread.
// Each description is met on its own, since a second language restates the same floors. A quote
// counts once however often the model returns it: rows whose quotes read the same once normalised
// as quote.ts finds them (spacing, quote marks, hyphens) point at the same words of the clause.
function everyAmountQuoted(
	family: CriterionFamily,
	descriptions: readonly LangText[],
	verified: readonly VerifiedRequirement[]
): boolean {
	const staff = family === 'staff-average';
	const distinct = new Map(
		verified.map((each) => [withoutHyphens(normalizeQuote(each.item.quote)), each] as const)
	);
	const quoted = tally(
		[...distinct.values()].flatMap((each) => amountsIn(each.item.quote, staff, each.lang) ?? [])
	);
	return descriptions.every((description) => {
		const amounts = amountsIn(description.text, staff, description.lang);
		if (amounts === null) return false;
		return [...tally(amounts)].every(([amount, times]) => (quoted.get(amount) ?? 0) >= times);
	});
}

// Number words and the lone thousands mark depend on the language ("two" is no German number
// word), so a quote is read in the language of the description it was found in. A quote found only
// across two descriptions keeps the first description's language.
function quoteLang(
	quote: string,
	descriptions: readonly LangText[],
	firstLang: string | undefined
): string | undefined {
	const source = descriptions.find((description) => findQuote(quote, description.text).found);
	return source === undefined ? firstLang : source.lang;
}

export function readLot({
	criteria,
	items
}: {
	criteria: readonly LotCriterion[];
	items: readonly ModelItem[];
}): LotReading {
	const texts = criteria.map((criterion) => criterionText(criterion.descriptions));
	const langs = criteria.map((criterion) => criterion.descriptions[0]?.lang);
	const found = criteria.map(() => ({
		verified: [] as VerifiedRequirement[],
		rejected: [] as RejectedItem[]
	}));
	const unplaced: RejectedItem[] = [];
	verifyRequirements(texts, items).forEach((check, index) => {
		const item = items[index];
		if (check.status === 'verified') {
			const at = check.criterion - 1;
			const lang = quoteLang(item.quote, criteria[at].descriptions, langs[at]);
			found[at].verified.push(readRequirement(item, check.start, lang));
		} else if (check.reason === 'no-such-criterion') {
			unplaced.push({ item, reason: check.reason });
		} else {
			found[check.criterion - 1].rejected.push({ item, reason: check.reason });
		}
	});
	return {
		criteria: criteria.map((criterion, index) => {
			const family = familyOf(criterion.code);
			return {
				code: criterion.code,
				family,
				text: texts[index],
				lang: langs[index],
				...found[index],
				// Each description is also read in its own language, which can only add an amount: a
				// clause read as holding one turns a quote without an amount from INFO into NOT_READ.
				textHasAmount:
					hasAmount(texts[index], family, langs[index]) ||
					criterion.descriptions.some((description) =>
						hasAmount(description.text, family, description.lang)
					),
				everyAmountQuoted: everyAmountQuoted(family, criterion.descriptions, found[index].verified),
				lots: criterion.descriptions.flatMap((description) =>
					lotsNamed(description.text, description.lang)
				)
			};
		}),
		unplaced,
		relianceRestricted: relianceRestricted(texts)
	};
}

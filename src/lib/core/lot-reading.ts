// What a model's reply may be used for: each item is only a pointer into the notice. Its quote must
// be found in its own clause (quote.ts), and every figure a comparison uses is read here by code
// from that quote; the model's number and period are kept only to be checked against the code's
// reading. Erasable syntax and relative .ts imports, as the rest of src/lib/core. Nothing here may
// import verdict.ts or compare.ts at runtime: the tender page builds its lot statuses from this
// module and must not reach the verdict model.
import type { LangText } from '../ingest/record.ts';
import { familyOf, type CriterionFamily } from './families.ts';
import {
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
import { criterionText, verifyRequirements } from './quote.ts';

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
}

export interface LotReading {
	readonly criteria: readonly CriterionReading[];
	// Items naming a criterion the lot does not have: shown, never compared.
	readonly unplaced: readonly RejectedItem[];
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

// A staff floor is a count of people, so its clause holds an amount when code reads a count in it.
function hasAmount(text: string, family: CriterionFamily, lang: string | undefined): boolean {
	const reading = family === 'staff-average' ? parseCount(text, lang) : parseMoney(text, lang);
	return reading.kind !== 'none';
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
			found[check.criterion - 1].verified.push(
				readRequirement(item, check.start, langs[check.criterion - 1])
			);
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
				textHasAmount: hasAmount(texts[index], family, langs[index])
			};
		}),
		unplaced
	};
}

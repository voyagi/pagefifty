import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import { lotClauseTexts, replyContent, replyRequirements } from '../../test/fixtures/replies';
import {
	MIN_QUOTE_LENGTH,
	findQuote,
	normalizeQuote,
	quoteLocator,
	verifyRequirements,
	withoutHyphens,
	type QuoteResult,
	type RequirementCheck
} from './quote';

const char = (codePoint: number) => String.fromCodePoint(codePoint);
const NBSP = char(0x00a0);
const NARROW_NBSP = char(0x202f);
const TYPOGRAPHIC = [0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e].map(char);

// Letters, digits, every space kind the notices use, typographic quotes and hyphens, with line-end
// hyphens as their own units so they are drawn often.
const UNITS = [
	...'aeiouBDKMNRSTxyz0123456789.,:;()/',
	char(0x00e4),
	char(0x00df),
	char(0x00e9),
	' ',
	' ',
	NBSP,
	NARROW_NBSP,
	'\t',
	'\n',
	'-',
	'-\n',
	'- \n  ',
	...TYPOGRAPHIC
];
// Characters no generated source holds, inserted to break a quote. Each is its own NFKC form.
const ABSENT = ['Q', 'W', '#', '@', char(0x00a7), '%', '~', char(0x03a9)];

const SPIKE_CLAUSES = ['de-610242-thinking-off', 'fr-629755-probe', 'nl-634398-super'].flatMap(
	lotClauseTexts
);

const sourceArb = fc.oneof(
	fc.constantFrom(...SPIKE_CLAUSES),
	fc.string({ unit: fc.constantFrom(...UNITS), minLength: MIN_QUOTE_LENGTH, maxLength: 160 })
);
const codePoints = (text: string) => [...text].length;

function quotesOf(names: readonly string[]) {
	return names.flatMap((name) => {
		const sources = lotClauseTexts(name);
		const items = replyRequirements(name);
		return verifyRequirements(sources, items).map((result, index) => ({
			name,
			item: index + 1,
			result
		}));
	});
}

describe('findQuote properties', () => {
	test.prop([sourceArb, fc.nat(), fc.nat()], { numRuns: 400 })(
		'every substring of 12 or more characters of a source passes',
		(source, from, size) => {
			const normal = normalizeQuote(source);
			const start = from % normal.length;
			const piece = normal.slice(start, start + MIN_QUOTE_LENGTH + (size % 60));
			fc.pre(codePoints(normalizeQuote(piece)) >= MIN_QUOTE_LENGTH);
			expect(findQuote(piece, source)).toMatchObject({ found: true, pass: 'as-normalised' });
		}
	);

	test.prop([sourceArb, fc.nat(), fc.nat(), fc.constantFrom(...ABSENT)], { numRuns: 400 })(
		'one inserted character absent from the source fails',
		(source, from, at, inserted) => {
			const normal = normalizeQuote(source);
			fc.pre(!normal.includes(inserted));
			const start = from % normal.length;
			const piece = normal.slice(start, start + MIN_QUOTE_LENGTH);
			fc.pre(findQuote(piece, source).found);
			const cut = at % (piece.length + 1);
			const broken = piece.slice(0, cut) + inserted + piece.slice(cut);
			expect(findQuote(broken, source)).toEqual({ found: false, reason: 'not-found' });
		}
	);

	test.prop([fc.oneof(sourceArb, fc.string({ unit: 'binary' }))], { numRuns: 400 })(
		'normalisation is idempotent',
		(text) => {
			const once = normalizeQuote(text);
			expect(normalizeQuote(once)).toBe(once);
			expect(withoutHyphens(withoutHyphens(text))).toBe(withoutHyphens(text));
		}
	);

	const digitPairs = (text: string) => (text.match(/\d(?=\d)/gu) ?? []).length;

	test.prop(
		[
			fc.oneof(
				sourceArb,
				fc.string({ unit: fc.constantFrom(...'0123456789ab -\n\t'), maxLength: 40 })
			)
		],
		{ numRuns: 400 }
	)('the hyphen-free pass never joins two digits a hyphen held apart', (text) => {
		expect(digitPairs(withoutHyphens(text))).toBe(digitPairs(text));
	});
});

describe('findQuote boundaries', () => {
	it('an 11-character quote is too short and a 12-character one is checked', () => {
		const source = 'Umsatz: abcdefghijklmnop';
		const tooShort: QuoteResult = { found: false, reason: 'too-short' };
		expect(findQuote('abcdefghijk', source)).toEqual(tooShort);
		expect(findQuote(' abcdefghijk\n', source)).toEqual(tooShort);
		expect(findQuote(`ab${NBSP}${NBSP}defghijk`, 'ab defghijk')).toEqual(tooShort);
		expect(findQuote('abcdefghijkl', source)).toEqual({
			found: true,
			start: 8,
			pass: 'as-normalised'
		});
		expect(findQuote('abcdefghijkz', source)).toEqual({ found: false, reason: 'not-found' });
	});

	it('typographic quotes and every space kind compare equal to their plain forms', () => {
		const source = `Eigenerklärung${NARROW_NBSP}gemäß ${char(0x201e)}Anlage B${char(0x201c)} und Nachweis`;
		expect(findQuote('gemäß "Anlage B" und', source)).toMatchObject({
			found: true,
			pass: 'as-normalised'
		});
		expect(findQuote('Eigenerklärung gemäß', source)).toMatchObject({ found: true });
		expect(findQuote(`${TYPOGRAPHIC[1]}s Nachweis gilt`, `'s${NBSP}Nachweis gilt`)).toMatchObject({
			found: true
		});
	});

	it('line breaks, tabs and runs of spaces in the source read as one space on the first pass', () => {
		expect(findQuote('Nachweis über den Umsatz', 'Nachweis\nüber  den\tUmsatz')).toEqual({
			found: true,
			start: 0,
			pass: 'as-normalised'
		});
	});

	it('a compatibility ligature in the source matches the plain letters', () => {
		const source = `Zerti${char(0xfb01)}zierung nach ISO/IEC 27001`;
		expect(findQuote('Zertifizierung nach ISO', source)).toEqual({
			found: true,
			start: 0,
			pass: 'as-normalised'
		});
	});

	it('a quote that is too short without its hyphens is not found on the second pass', () => {
		expect(findQuote('----------xy', 'the text holds xy only')).toEqual({
			found: false,
			reason: 'not-found'
		});
	});

	it('a quote the model kept a line-end hyphen in is found on the first pass, one with a dropped bullet hyphen on the second', () => {
		const [, , turnover] = replyRequirements('de-610242-thinking-off');
		expect(turnover.quote).toContain('abgeschlosse-nen');
		expect(findQuote(turnover.quote, lotClauseTexts('de-610242-thinking-off')[2])).toMatchObject({
			found: true,
			pass: 'as-normalised'
		});
		const bulleted = 'Exigences :\n-\tmontant minimum de 100.000,00 € TVAC par certificat ;';
		expect(findQuote('Exigences : montant minimum de 100.000,00 €', bulleted)).toEqual({
			found: true,
			start: 0,
			pass: 'hyphens-removed'
		});
	});

	it('a range between two numbers is never read as one number, either way round', () => {
		const notFound: QuoteResult = { found: false, reason: 'not-found' };
		expect(findQuote('mindestens 12 Mitarbeiter', 'mindestens 1-2 Mitarbeiter')).toEqual(notFound);
		expect(findQuote('mindestens 1-2 Mitarbeiter', 'mindestens 12 Mitarbeiter')).toEqual(notFound);
		expect(findQuote('mindestens 12 Mitarbeiter', 'mindestens 1--2 Mitarbeiter')).toEqual(notFound);
		expect(findQuote('mindestens 12 Mitarbeiter', 'mindestens 1-\n2 Mitarbeiter')).toEqual(
			notFound
		);
		expect(findQuote('zwischen 100 200 Mitarbeitern', 'zwischen 100 - 200 Mitarbeitern')).toEqual(
			notFound
		);
		expect(withoutHyphens('1-2, 1 - 2, 1--2, a-b, 3-x, x-3')).toBe('1-2, 1 - 2, 1--2, ab, 3x, x3');
	});

	it('a hyphen between a number and a word still drops on the second pass', () => {
		expect(findQuote('ein 3jähriger Nachweis', 'ein 3-jähriger Nachweis')).toEqual({
			found: true,
			start: 0,
			pass: 'hyphens-removed'
		});
	});
});

describe('verifyRequirements', () => {
	it('a quote found only in a neighbouring criterion is rejected', () => {
		const sources = lotClauseTexts('de-610242-thinking-off');
		const insurance = replyRequirements('de-610242-thinking-off')[3];
		expect(insurance.criterion).toBe(4);
		const checks = verifyRequirements(sources, [
			{ criterion: 4, quote: insurance.quote },
			{ criterion: 5, quote: insurance.quote },
			{ criterion: 7, quote: insurance.quote }
		]);
		expect(checks.map((check) => check.status)).toEqual(['verified', 'rejected', 'rejected']);
		expect(checks.slice(1)).toEqual([
			{ status: 'rejected', criterion: 5, reason: 'not-found' },
			{ status: 'rejected', criterion: 7, reason: 'no-such-criterion' }
		]);
	});

	it('a criterion number that is not a whole number from one names no criterion', () => {
		const quote = 'Nachweis der Befähigung';
		const sources = [quote];
		expect(
			verifyRequirements(sources, [
				{ criterion: 0, quote },
				{ criterion: 1.5, quote },
				{ criterion: -1, quote },
				{ criterion: 1, quote: 'Nachweis' }
			])
		).toEqual([
			{ status: 'rejected', criterion: 0, reason: 'no-such-criterion' },
			{ status: 'rejected', criterion: 1.5, reason: 'no-such-criterion' },
			{ status: 'rejected', criterion: -1, reason: 'no-such-criterion' },
			{ status: 'rejected', criterion: 1, reason: 'too-short' }
		]);
	});

	it('the 27 quotes of spike 004 run 1 pass', () => {
		const checked = quotesOf(['de-610242-default', 'de-610242-thinking-off', 'fr-629755-probe']);
		expect(checked).toHaveLength(27);
		for (const { name, item, result } of checked) {
			expect(result.status, `${name} item ${item}`).toBe('verified');
		}
	});

	it('the 24 quotes of spike 004 run 2 pass', () => {
		const checked = quotesOf(['de-610242-thinking-off', 'nl-634398-super']);
		expect(checked).toHaveLength(24);
		for (const { name, item, result } of checked) {
			expect(result.status, `${name} item ${item}`).toBe('verified');
		}
	});

	it('the French reply with its raw TAB has every quote found once the TAB is a space', () => {
		expect(replyContent('fr-629755-default-tab')).toContain('\t');
		expect(() => JSON.parse(replyContent('fr-629755-default-tab'))).toThrow(SyntaxError);
		const checked = quotesOf(['fr-629755-default-tab']);
		expect(checked).toHaveLength(11);
		for (const { item, result } of checked) {
			expect(result.status, `item ${item}`).toBe('verified');
		}
	});

	it('two requirements with the same quote both pass and keep their own offsets', () => {
		const sources = lotClauseTexts('de-610242-thinking-off');
		const [first] = replyRequirements('de-610242-thinking-off');
		const [one, two]: RequirementCheck[] = verifyRequirements(sources, [first, first]);
		expect(one).toEqual({ status: 'verified', criterion: 1, start: 0, pass: 'as-normalised' });
		expect(two).toEqual(one);
		expect(two).not.toBe(one);
	});
});

// The page marks a quote where the verifier found it, so the two must agree on every quote.
describe('quoteLocator', () => {
	test.prop([sourceArb, fc.nat(), fc.nat(), fc.boolean()], { numRuns: 400 })(
		'finds a quote exactly when findQuote does, its hyphens kept or dropped',
		(source, from, size, bare) => {
			const normal = normalizeQuote(source);
			const start = from % normal.length;
			const cut = normal.slice(start, start + MIN_QUOTE_LENGTH + (size % 60));
			const piece = bare ? withoutHyphens(cut) : cut;
			const span = quoteLocator(source)(piece);
			const result = findQuote(piece, source);
			expect(span !== undefined).toBe(result.found);
			if (span === undefined || !result.found) return;
			expect(0 <= span.start && span.start < span.end && span.end <= source.length).toBe(true);
			// The first pass compares whole normalised text, so the published span reads as the quote.
			if (result.pass === 'as-normalised') {
				expect(normalizeQuote(source.slice(span.start, span.end))).toBe(normalizeQuote(piece));
			}
		}
	);

	it('finds each quote of the recorded replies exactly where the verifier did', () => {
		for (const name of ['de-610242-thinking-off', 'fr-629755-probe', 'nl-634398-super']) {
			const sources = lotClauseTexts(name);
			const items = replyRequirements(name);
			verifyRequirements(sources, items).forEach((result, index) => {
				const source = sources[items[index].criterion - 1];
				const span = source === undefined ? undefined : quoteLocator(source)(items[index].quote);
				expect(span !== undefined, `${name} item ${index + 1}`).toBe(result.status === 'verified');
			});
		}
	});

	it('spans the published characters across a ligature and a combining accent', () => {
		const source = `Ein Zerti${char(0xfb01)}kat der Cafe${char(0x0301)}-Betriebe ist beizufügen.`;
		const span = quoteLocator(source)('Ein Zertifikat der Café-Betriebe');
		expect(span && source.slice(span.start, span.end)).toBe(
			`Ein Zerti${char(0xfb01)}kat der Cafe${char(0x0301)}-Betriebe`
		);
	});

	it('finds nothing for a quote too short to have verified', () => {
		expect(quoteLocator('Ein Zertifikat ist beizufügen.')('Zertifikat')).toBeUndefined();
	});

	it('finds nothing for a quote too short without its hyphens, as findQuote does', () => {
		const source = 'the text holds xy only';
		expect(findQuote('----------xy', source)).toEqual({ found: false, reason: 'not-found' });
		expect(quoteLocator(source)('----------xy')).toBeUndefined();
	});
});

describe('verifyRequirements on recorded replies', () => {
	it('the German thinking-off reply finds all 14 quotes in their own clauses', () => {
		const items = replyRequirements('de-610242-thinking-off');
		const sources = lotClauseTexts('de-610242-thinking-off');
		expect(items).toHaveLength(14);
		expect(sources).toHaveLength(6);
		const results: RequirementCheck[] = verifyRequirements(sources, items);
		expect(results).toHaveLength(14);
		results.forEach((result, index) => {
			expect(result, `item ${index + 1}`).toMatchObject({
				status: 'verified',
				criterion: items[index].criterion
			});
			if (result.status === 'verified') expect(result.start).toBeGreaterThanOrEqual(0);
		});
	});
});

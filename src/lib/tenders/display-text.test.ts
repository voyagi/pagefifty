import { fc } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';
import {
	criterionMarks,
	displayRuns,
	findQuotes,
	placeMarks,
	quotePlaces,
	runsBetween,
	sentenceSpan,
	shownText,
	type TextRun
} from './display-text';

// What a reader sees: hidden runs not drawn, a kept line or paragraph as a line break, and any other
// run of whitespace as one space, as the browser draws white-space: normal.
const drawn = (runs: readonly TextRun[]) =>
	runs
		.map((run) => {
			if (run.kind === 'hidden') return '';
			if (run.kind === 'line') return '|';
			if (run.kind === 'paragraph') return '||';
			return run.text.replace(/\s+/g, ' ');
		})
		.join('')
		.replace(/ ?\| ?/g, '|')
		.trim();

const kinds = (runs: readonly TextRun[]) => runs.map((run) => [run.kind, run.text]);

describe('displayRuns', () => {
	it('keeps every character of the text in exactly one run, in order', () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom('a', 'Z', '7', '-', ' ', '\n', '\r\n', 'b)', '.', 'ß'), {
					maxLength: 60
				}),
				(parts) => {
					const text = parts.join('');
					const runs = displayRuns(text);
					expect(runs.map((run) => run.text).join('')).toBe(text);
					let at = 0;
					for (const run of runs) {
						expect([run.start, run.end]).toEqual([at, at + run.text.length]);
						at = run.end;
					}
					expect(at).toBe(text.length);
				}
			)
		);
	});

	it('joins a word split by a hyphen at a line end between two letters', () => {
		const text = 'eine Zertifizie-\nrung, wie projektverantwort-\nliche Personen';
		expect(drawn(displayRuns(text))).toBe(
			'eine Zertifizierung, wie projektverantwortliche Personen'
		);
		expect(kinds(displayRuns('Zertifizie-\nrung'))).toEqual([
			['text', 'Zertifizie'],
			['hidden', '-\n'],
			['text', 'rung']
		]);
	});

	it('keeps a hyphen that belongs to the word and drops only its line break', () => {
		const text = 'im Zusammenhang mit ISO/IEC-27001-\nZertifizierungen und 2023-\n2025';
		expect(drawn(displayRuns(text))).toBe(
			'im Zusammenhang mit ISO/IEC-27001-Zertifizierungen und 2023-2025'
		);
	});

	it('reads a single line break as a space and keeps a blank line as a paragraph', () => {
		const text = 'für den Auftraggeber bereit. \nHierzu sind \n\nFestangestellter Junior';
		const runs = displayRuns(text);
		expect(drawn(runs)).toBe('für den Auftraggeber bereit. Hierzu sind||Festangestellter Junior');
		expect(runs.filter((run) => run.kind === 'paragraph').map((run) => run.text)).toEqual(['\n\n']);
	});

	it('keeps the line break before a list item', () => {
		const text =
			'mindestens betragen: \na) für Personenschäden 5 Mio. EUR \nb) für sonstige Schäden\n- erfolgreich \n2. Nachweis';
		expect(drawn(displayRuns(text))).toBe(
			'mindestens betragen:|a) für Personenschäden 5 Mio. EUR|b) für sonstige Schäden|- erfolgreich|2. Nachweis'
		);
	});

	it('reads Windows line breaks the same way', () => {
		expect(drawn(displayRuns('Zertifizie-\r\nrung \r\n\r\nNeu \r\nweiter'))).toBe(
			'Zertifizierung||Neu weiter'
		);
	});

	it('leaves a hyphen after a space, and one before a capital after punctuation, as text', () => {
		expect(drawn(displayRuns('Senior -\nLead'))).toBe('Senior - Lead');
		expect(drawn(displayRuns('Ende.-\nNeu'))).toBe('Ende.- Neu');
	});

	// The deciding clause of the 610242 example, as published: its heading line, then the sentence.
	it('keeps the break after the short heading line a clause opens with', () => {
		const clause =
			'Mindestanforderung  \nDer Auftragnehmer stellt für die Dauer des Projekts feste Ansprechpartner und projektverantwort-\nliche Personen für den Auftraggeber bereit';
		expect(drawn(displayRuns(clause))).toBe(
			'Mindestanforderung|Der Auftragnehmer stellt für die Dauer des Projekts feste Ansprechpartner und projektverantwortliche Personen für den Auftraggeber bereit'
		);
		expect(kinds(displayRuns(clause)).slice(0, 2)).toEqual([
			['text', 'Mindestanforderung  '],
			['line', '\n']
		]);
	});

	// Both sides of the 25-character limit, from published first lines.
	it('keeps a first line of 25 characters and joins one of 26', () => {
		const heading = 'Angaben zu Arbeitskräften';
		const wrapped = 'Der Umsatz muss mindestens';
		expect([[...heading].length, [...wrapped].length]).toEqual([25, 26]);
		expect(drawn(displayRuns(`${heading}\nZahl der Beschäftigten`))).toBe(
			`${heading}|Zahl der Beschäftigten`
		);
		expect(drawn(displayRuns(`${wrapped}\n2.500.000,00 EUR pro Jahr`))).toBe(
			`${wrapped} 2.500.000,00 EUR pro Jahr`
		);
	});

	it('joins a short first line that ends in punctuation or goes on in lower case', () => {
		expect(drawn(displayRuns('Mindestanzahl: \nDrei Referenzen'))).toBe(
			'Mindestanzahl: Drei Referenzen'
		);
		expect(drawn(displayRuns('Nachweis erbracht. \nDie Referenz'))).toBe(
			'Nachweis erbracht. Die Referenz'
		);
		expect(drawn(displayRuns('Auszug\naus dem Handelsregister'))).toBe(
			'Auszug aus dem Handelsregister'
		);
	});

	it('keeps a heading line that opens a later block, and reads no other line as a heading', () => {
		const text =
			'Siehe Anlage 3. \r\n\r\nReferenzzeitraum \r\nEs werden nur Referenzen aus\r\nZeitraum B berücksichtigt';
		expect(drawn(displayRuns(text))).toBe(
			'Siehe Anlage 3.||Referenzzeitraum|Es werden nur Referenzen aus Zeitraum B berücksichtigt'
		);
		expect(drawn(displayRuns('Einleitung folgt\nReferenzen\nTeil B'))).toBe(
			'Einleitung folgt|Referenzen Teil B'
		);
	});
});

describe('runsBetween', () => {
	it('cuts the runs at the edges of a range and keeps a break only where it ends inside it', () => {
		const text = 'eins Zertifizie-\nrung \n\nzwei';
		const runs = displayRuns(text);
		const cut = runsBetween(runs, 5, 20);
		expect(cut.map((run) => run.text).join('')).toBe(text.slice(5, 20));
		expect(cut.map((run) => run.kind)).toEqual(['text', 'hidden', 'text']);
		const whole = runsBetween(runs, 0, text.length);
		expect(whole).toEqual(runs);
	});
});

describe('findQuotes', () => {
	it('finds a quote across spaces, line breaks and the break after a hyphen', () => {
		const text =
			'Hierzu sind mindestens ein Junior Consultant sowie \nein Senior- bzw. Lead Consultant einzusetzen, und eine Zertifizie-\nrung, wie';
		const found = findQuotes(text, [
			'mindestens ein Junior Consultant sowie ein Senior- bzw. Lead Consultant einzusetzen',
			'eine Zertifizie-rung, wie'
		]);
		expect(found.map((each) => [each.indexes, text.slice(each.start, each.end)])).toEqual([
			[
				[0],
				'mindestens ein Junior Consultant sowie \nein Senior- bzw. Lead Consultant einzusetzen'
			],
			[[1], 'eine Zertifizie-\nrung, wie']
		]);
	});

	// The verifier's second pass drops every hyphen that is not a range, so a quote that left out
	// the hyphen of a word the PDF split, or a list dash, verified and is found here too.
	it('finds a quote without the hyphen of a split word or a list dash, as code verified it', () => {
		const text =
			'Die An-\ngebote sind fristgerecht einzureichen. Het projectteam omvat minimaal:\n- één projectmanager';
		const found = findQuotes(text, [
			'Die Angebote sind fristgerecht einzureichen',
			'Het projectteam omvat minimaal: één projectmanager'
		]);
		expect(found.map((each) => [each.indexes, text.slice(each.start, each.end)])).toEqual([
			[[0], 'Die An-\ngebote sind fristgerecht einzureichen'],
			[[1], 'Het projectteam omvat minimaal:\n- één projectmanager']
		]);
	});

	it('finds a quote whose typographic quotation marks the model wrote plainly', () => {
		const text = 'Nachweis der „Betriebshaftpflicht“ ist beizufügen.';
		const [found] = findQuotes(text, ['Nachweis der "Betriebshaftpflicht"']);
		expect(text.slice(found.start, found.end)).toBe('Nachweis der „Betriebshaftpflicht“');
	});

	it('leaves out a quote not in the text and a quote too short to have verified', () => {
		expect(findQuotes('alpha beta gamma delta epsilon', ['nowhere at all', 'beta'])).toEqual([]);
	});

	it('gives two quotes on the same words one span that lists both', () => {
		const text = 'Eine Haftpflichtversicherung ist nachzuweisen.';
		const quote = 'Eine Haftpflichtversicherung ist nachzuweisen';
		expect(findQuotes(text, [quote, quote])).toEqual([
			{ start: 0, end: quote.length, indexes: [0, 1] }
		]);
	});

	it('widens a span over a quote that overlaps it, keeping both indexes in order', () => {
		const text = 'alpha beta gamma delta epsilon zeta';
		const found = findQuotes(text, ['gamma delta epsilon', 'alpha beta gamma', 'nowhere at all']);
		expect(found).toEqual([{ start: 0, end: 30, indexes: [1, 0] }]);
	});
});

describe('placeMarks', () => {
	it('keeps the place a mark carries and looks for every other mark by its quote', () => {
		const text = 'alpha beta gamma delta epsilon zeta';
		expect(
			placeMarks(text, [
				{ quote: 'nowhere at all, placed', at: { start: 31, end: 35 } },
				{ quote: 'alpha beta gamma' }
			])
		).toEqual([
			{ start: 0, end: 16, indexes: [1] },
			{ start: 31, end: 35, indexes: [0] }
		]);
	});
});

describe('criterionMarks', () => {
	// The criterion lot-reading.test.ts reads across its two descriptions: code verified the quote
	// against them joined, and finds it in neither alone.
	const descriptions = [
		{ text: 'Jährlich mindestens 1.000.000 EUR netto Umsatz', lang: 'de' },
		{ text: 'in each of the last two financial years.', lang: 'en' }
	];
	const across = 'mindestens 1.000.000 EUR netto Umsatz in each of the last two';

	it('cuts a quote found only across two descriptions at their edge, the number on the first piece', () => {
		const marks = criterionMarks(descriptions, [{ quote: across, lang: 'de' }], [0]);
		expect(marks).toEqual([
			[{ quote: across, n: 1, decides: true, at: { start: 9, end: 46 } }],
			[{ quote: across, n: undefined, decides: true, at: { start: 0, end: 23 } }]
		]);
		const pieces = marks.map(([mark], index) =>
			shownText(descriptions[index].text).slice(mark.at?.start, mark.at?.end)
		);
		expect(pieces).toEqual(['mindestens 1.000.000 EUR netto Umsatz', 'in each of the last two']);
	});

	it('places the pieces in the drawn text, past an indent the block trims', () => {
		const indented = [
			{ text: '  \nJährlich mindestens 1.000.000 EUR netto Umsatz  ' },
			descriptions[1]
		];
		const [[first], [second]] = criterionMarks(indented, [{ quote: across }], []);
		expect([first.at, first.decides, second.at]).toEqual([
			{ start: 9, end: 46 },
			false,
			{ start: 0, end: 23 }
		]);
	});

	it('marks a quote found in one description on each block of its language, by its quote', () => {
		const marks = criterionMarks(
			descriptions,
			[
				{ quote: 'in each of the last two financial years', lang: 'en' },
				{ quote: 'mindestens 1.000.000 EUR', lang: 'de' },
				{ quote: 'nowhere in the clause at all' }
			],
			[1]
		);
		expect(marks).toEqual([
			[{ quote: 'mindestens 1.000.000 EUR', n: 2, decides: true }],
			[{ quote: 'in each of the last two financial years', n: 1, decides: false }]
		]);
	});
});

describe('quotePlaces', () => {
	const descriptions = [
		{ text: 'Jährlich mindestens 1.000.000 EUR netto Umsatz', lang: 'de' },
		{ text: 'in each of the last two financial years.', lang: 'en' }
	];

	it('places each piece of a quote found only across two descriptions', () => {
		const across = 'mindestens 1.000.000 EUR netto Umsatz in each of the last two';
		expect(quotePlaces(descriptions, { quote: across, lang: 'de' })).toEqual([
			{ at: 0, start: 9, end: 46 },
			{ at: 1, start: 0, end: 23 }
		]);
	});

	// A quote repeated in a second description of its language is placed once, in the first.
	it('places a quote found whole once, in the first description of its language holding it', () => {
		const repeated = [
			{ text: 'Keine Angabe.', lang: 'de' },
			{ text: 'Mindestens 1.000.000 EUR Umsatz.', lang: 'de' },
			{ text: 'Mindestens 1.000.000 EUR Umsatz.', lang: 'de' }
		];
		expect(quotePlaces(repeated, { quote: 'Mindestens 1.000.000 EUR', lang: 'de' })).toEqual([
			{ at: 1, start: 0, end: 24 }
		]);
		expect(quotePlaces(descriptions, { quote: 'nowhere in the clause at all' })).toEqual([]);
	});
});

describe('sentenceSpan', () => {
	const clause =
		'Der Auftragnehmer stellt Personen bereit. Hierzu sind mindestens ein Junior Consultant sowie ein Senior- bzw. Lead Consultant einzusetzen, die dem Auftraggeber zur Verfügung stehen. \n\nFestangestellter Junior Consultant mit 5 Mio. EUR.';
	const around = (start: number, end: number) => {
		const span = sentenceSpan(clause, start, end);
		return clause.slice(span.start, span.end);
	};

	it('widens a quote to the sentence it sits in, past an abbreviation', () => {
		const start = clause.indexOf('mindestens');
		const end = clause.indexOf('einzusetzen') + 'einzusetzen'.length;
		expect(around(start, end)).toBe(
			'Hierzu sind mindestens ein Junior Consultant sowie ein Senior- bzw. Lead Consultant einzusetzen, die dem Auftraggeber zur Verfügung stehen.'
		);
	});

	it('stops at a paragraph break, with no space at either end', () => {
		const start = clause.indexOf('Festangestellter');
		expect(sentenceSpan(clause, start, start + 5)).toEqual({ start, end: clause.length });
		expect(around(start, start + 5)).toBe('Festangestellter Junior Consultant mit 5 Mio. EUR.');
		expect(around(0, 3)).toBe('Der Auftragnehmer stellt Personen bereit.');
	});
});

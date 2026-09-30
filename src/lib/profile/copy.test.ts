import { describe, expect, it } from 'vitest';
import {
	clockTime,
	exportDateText,
	fieldErrorText,
	importAppliedText,
	importFaultText,
	importRefusalLines,
	saveStatusText,
	shownFileName,
	type FieldError
} from './copy';
import type { ImportRefusal } from './import';

// The profile page's words, read here in the node project as well as through the rendered page in
// jsdom, so the mutation run (node only) covers this module.

const MEMORY =
	'This browser blocks storage, so the profile lasts only while this page is open. Export the file to keep it.';

type Issue = NonNullable<ImportRefusal['fields']>[number];

const invalid = (fields: Issue[]): ImportRefusal => ({
	ok: false,
	reason: 'invalid',
	fileName: 'f.json',
	fields
});
const lineFor = (issue: Issue) => importRefusalLines(invalid([issue])).fields[0];
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('an export whose date the browser did not keep', () => {
	it('says the file was downloaded and why its date was not stored', () => {
		expect(exportDateText('failed')).toEqual({
			lead: 'The profile file was downloaded, but this browser refused to store the export date, so its storage may be full or blocked.',
			fields: [],
			closing: 'Last exported still shows the date stored before.'
		});
		expect(exportDateText('newer-version')).toEqual({
			lead: 'The profile file was downloaded, but this browser now holds a profile saved by a newer version of Pagefifty, so the export date was not stored.',
			fields: [],
			closing: 'Last exported still shows the date stored before.'
		});
	});
});

describe('fieldErrorText', () => {
	it('words every number problem for each kind of number', () => {
		const cases: [FieldError, string][] = [
			[
				{ kind: 'money', reason: 'not-a-number' },
				'Not a number yet. Write the whole amount in euros, like 1240000.'
			],
			[
				{ kind: 'money', reason: 'below-zero' },
				'Turnover cannot be below 0. Write the whole amount in euros, like 1240000.'
			],
			[
				{ kind: 'money', reason: 'too-long' },
				'That amount is too long. Write the whole amount in euros, like 1240000.'
			],
			[
				{ kind: 'staff', reason: 'not-a-number' },
				'Not a whole number yet. Write the number of people, like 19.'
			],
			[
				{ kind: 'staff', reason: 'below-zero' },
				'Staff cannot be below 0. Write the number of people, like 19.'
			],
			[
				{ kind: 'staff', reason: 'too-long' },
				'That number is too long for a staff count. Write the number of people, like 19.'
			],
			[
				{ kind: 'years', reason: 'not-a-number' },
				'Not a whole number yet. Write the number of completed financial years, like 3.'
			],
			[
				{ kind: 'years', reason: 'below-zero' },
				'Completed financial years cannot be below 0. Write the number of completed financial years, like 3.'
			],
			[
				{ kind: 'years', reason: 'too-long' },
				'That number is too long for a count of years. Write the number of completed financial years, like 3.'
			],
			[
				{ kind: 'certificate-date', reason: 'not-a-date' },
				'Not a date yet. Pick the day the certificate runs out, like 31 Mar 2027.'
			],
			[{ kind: 'certificate-name', reason: 'empty' }, 'Name the certificate, like ISO 22301.']
		];
		for (const [error, text] of cases) expect(fieldErrorText(error)).toBe(text);
	});

	it('names the saved value the field keeps, and says nothing of one when there is none', () => {
		const error: FieldError = { kind: 'staff', reason: 'below-zero' };
		expect(fieldErrorText(error, '19')).toBe(
			'Staff cannot be below 0. Write the number of people, like 19. Saved value: 19.'
		);
		expect(fieldErrorText(error)).not.toContain('Saved value');
	});
});

describe('saveStatusText', () => {
	it('words every status, with and without storage', () => {
		expect(saveStatusText({ kind: 'nothing', inMemory: false })).toBe('Nothing saved yet.');
		expect(saveStatusText({ kind: 'nothing', inMemory: true })).toBe(
			`Nothing saved yet. ${MEMORY}`
		);
		expect(saveStatusText({ kind: 'kept', inMemory: false })).toBe('Saved in this browser.');
		expect(saveStatusText({ kind: 'kept', inMemory: true })).toBe(
			`Kept on this page only. ${MEMORY}`
		);
		expect(saveStatusText({ kind: 'saved', time: '14:34' })).toBe(
			'Saved in this browser at 14:34.'
		);
		expect(saveStatusText({ kind: 'reading', file: 'a.json' })).toBe('Reading a.json.');
		expect(saveStatusText({ kind: 'imported', file: 'a.json', inMemory: false })).toBe(
			'Imported a.json. It replaced the profile that was in this browser.'
		);
		expect(saveStatusText({ kind: 'imported', file: 'a.json', inMemory: true })).toBe(
			`Imported a.json. It replaced the profile on this page. ${MEMORY}`
		);
		expect(saveStatusText({ kind: 'removed', name: 'ISO 22301' })).toBe('Removed ISO 22301.');
		expect(saveStatusText({ kind: 'failed' })).toBe(
			'Not saved: this browser refused to store the profile.'
		);
		expect(saveStatusText({ kind: 'refused' })).toBe(
			'Not saved: that change does not fit the profile, so nothing was changed.'
		);
		expect(saveStatusText({ kind: 'newer', version: 3, reads: 1 })).toBe(
			'This browser holds a profile saved by a newer version of Pagefifty (schemaVersion 3). This page reads schemaVersion 1. Nothing was changed.'
		);
	});

	it('says the rest is saved only when it is, for one field or several', () => {
		const one = ['Total staff'];
		const two = ['Total staff', '2025'];
		expect(saveStatusText({ kind: 'not-saved', fields: one, rest: 'saved' })).toBe(
			'Not saved: Total staff needs a valid value. The rest is saved.'
		);
		expect(saveStatusText({ kind: 'not-saved', fields: one, rest: 'nothing' })).toBe(
			'Not saved: Total staff needs a valid value.'
		);
		expect(saveStatusText({ kind: 'not-saved', fields: two, rest: 'memory' })).toBe(
			`Not saved: 2 fields need a valid value. ${MEMORY}`
		);
	});
});

describe('importRefusalLines', () => {
	it('words every refusal reason, each ending on nothing changed', () => {
		const lead = (refusal: Omit<ImportRefusal, 'ok' | 'fileName'>) => {
			const text = importRefusalLines({ ok: false, fileName: 'f.json', ...refusal });
			expect(text.closing).toBe('Nothing was changed.');
			return text.lead;
		};
		expect(lead({ reason: 'too-large' })).toBe(
			'f.json is too large to be a profile file: it is over 256 KB, and an exported profile is a few KB. Choose a file exported from Pagefifty.'
		);
		expect(lead({ reason: 'unreadable' })).toBe(
			'This browser could not read f.json. It may have been moved or changed after it was chosen. Choose the file again.'
		);
		expect(lead({ reason: 'not-json' })).toBe(
			'f.json is not a profile file because it is not JSON. Choose a .json file exported from Pagefifty, like pagefifty-profile-2026-09-20.json.'
		);
		expect(lead({ reason: 'no-version' })).toBe(
			'f.json has no schemaVersion, so Pagefifty cannot tell which version wrote it. Choose a file exported from Pagefifty.'
		);
		expect(lead({ reason: 'newer-version', version: 4 })).toBe(
			'f.json was written by a newer version of Pagefifty (schemaVersion 4). This page reads schemaVersion 1.'
		);
		expect(lead({ reason: 'invalid' })).toBe(
			'f.json was not imported because Pagefifty could not bring it up to the version this page reads. Choose a file exported from Pagefifty.'
		);
		expect(lead({ reason: 'invalid', fields: [] })).toBe(lead({ reason: 'invalid' }));
	});

	it('lists 20 field lines at most, then how many more, counting every field in the lead', () => {
		const issue = (index: number): Issue => ({
			path: ['profile', `extra${index}`],
			problem: 'unrecognized_keys',
			found: index
		});
		const twenty = importRefusalLines(invalid(Array.from({ length: 20 }, (_, i) => issue(i))));
		expect(twenty.fields).toHaveLength(20);
		expect(twenty.lead).toBe('f.json was not imported because 20 fields are not valid:');
		const many = importRefusalLines(invalid(Array.from({ length: 21 }, (_, i) => issue(i))));
		expect(many.fields).toHaveLength(21);
		expect(many.fields.at(-1)).toBe('and 1 more');
		expect(many.fields[19]).toBe(
			'Profile field extra19: Pagefifty does not know this field. Found 19.'
		);
	});

	it('names known fields by their form labels and spells other paths from their parts', () => {
		expect(lineFor({ path: ['profile', 'staff', 'total'], problem: 'too_small', found: -1 })).toBe(
			'Total staff: the value is too small or too short. Found -1.'
		);
		expect(lineFor({ path: ['lastExportedAt'], problem: 'invalid_format', found: 'x' })).toBe(
			'Last exported: the value is not in the expected format. Found "x".'
		);
		expect(
			lineFor({ path: ['profile', 'insurance', 0, 'coverEuros'], problem: 'too_small', found: -5 })
		).toBe('Insurance row 1, cover in euros: the value is too small or too short. Found -5.');
		expect(lineFor({ path: ['profile'], problem: 'invalid_type', found: undefined })).toBe(
			'Profile: the value has the wrong type. Found nothing.'
		);
		expect(lineFor({ path: ['extra'], problem: 'unrecognized_keys', found: null })).toBe(
			'File field extra: Pagefifty does not know this field. Found null.'
		);
	});

	it('words a repeated row by what it repeats, and any other custom issue plainly', () => {
		expect(
			lineFor({ path: ['profile', 'turnover', 1, 'year'], problem: 'custom', found: 2024 })
		).toBe('Turnover row 2, year: the year is listed twice. Found 2024.');
		expect(
			lineFor({
				path: ['profile', 'certificates', 1, 'standard'],
				problem: 'custom',
				found: 'ISO 9001'
			})
		).toBe('Certificates row 2, standard: the certificate is listed twice. Found "ISO 9001".');
		expect(lineFor({ path: ['profile', 'staff'], problem: 'custom', found: 1 })).toBe(
			'Staff: the value is not valid. Found 1.'
		);
	});

	// A file key may itself hold a dot; it must never read as the form field it spells.
	it('never gives a file key holding a dot the label of the field its dotted name spells', () => {
		expect(
			lineFor({ path: ['profile', 'staff.total'], problem: 'unrecognized_keys', found: 5 })
		).toBe('Profile field staff.total: Pagefifty does not know this field. Found 5.');
	});

	it('shows an empty file key as two quotes, not as nothing', () => {
		expect(lineFor({ path: ['profile', ''], problem: 'unrecognized_keys', found: 1 })).toBe(
			'Profile field "": Pagefifty does not know this field. Found 1.'
		);
	});

	it('shows a value of 60 characters whole and shortens one of 61 to 57 and three dots', () => {
		const at = (length: number) =>
			lineFor({ path: ['extra'], problem: 'unrecognized_keys', found: 'x'.repeat(length - 2) });
		expect(at(60)).toBe(
			`File field extra: Pagefifty does not know this field. Found "${'x'.repeat(58)}".`
		);
		expect(at(61)).toBe(
			`File field extra: Pagefifty does not know this field. Found "${'x'.repeat(56)}...`
		);
	});

	// A value is shortened by characters, so an emoji or any other character outside the basic
	// plane is never cut in half.
	it('never cuts a character in two when it shortens a value or a key', () => {
		const wide = `a${'\u{1F600}'.repeat(70)}`;
		const value = lineFor({ path: ['extra'], problem: 'unrecognized_keys', found: wide });
		expect(value.endsWith('...')).toBe(true);
		expect(LONE_SURROGATE.test(value)).toBe(false);
		const key = lineFor({ path: ['profile', `b${wide}`], problem: 'unrecognized_keys', found: 1 });
		expect(key.startsWith('Profile field ba\u{1F600}')).toBe(true);
		expect(key).toContain('...: Pagefifty does not know this field. Found 1.');
		expect(LONE_SURROGATE.test(key)).toBe(false);
	});

	// A browser with no grapheme segmenter (Firefox before 125) must still get a shortened line: a
	// throw here would leave the import status on "Reading" for good.
	it('still shortens a value where the browser has no grapheme segmenter', () => {
		const segmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
		Reflect.deleteProperty(Intl, 'Segmenter');
		try {
			expect(
				lineFor({ path: ['extra'], problem: 'unrecognized_keys', found: 'x'.repeat(70) })
			).toBe(`File field extra: Pagefifty does not know this field. Found "${'x'.repeat(56)}...`);
		} finally {
			if (segmenter) Object.defineProperty(Intl, 'Segmenter', segmenter);
		}
	});

	// A flag is two code points and a joined family emoji five, yet each is one character on screen;
	// built from their numbers, so this file holds no joiner itself. The cut falls right after them.
	it('never cuts a flag or a joined emoji in two when it shortens a value', () => {
		const flag = String.fromCodePoint(0x1f1f3, 0x1f1f1);
		const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
		for (const emoji of [flag, family]) {
			const found = `${'x'.repeat(55)}${emoji}${'y'.repeat(10)}`;
			expect(lineFor({ path: ['extra'], problem: 'unrecognized_keys', found })).toBe(
				`File field extra: Pagefifty does not know this field. Found "${'x'.repeat(55)}${emoji}...`
			);
		}
	});
});

describe('importAppliedText', () => {
	it('names who refused a file that passed every check', () => {
		expect(importAppliedText('failed', 'f.json')).toEqual({
			lead: 'f.json was read but not imported: this browser refused to store it, so its storage may be full or blocked.',
			fields: [],
			closing: 'Nothing was changed.'
		});
		expect(importAppliedText('invalid', 'f.json').lead).toBe(
			"f.json was read but not imported: the profile it holds does not fit this page's profile."
		);
		expect(importAppliedText('newer-version', 'f.json').lead).toBe(
			'f.json was not imported: this browser holds a profile saved by a newer version of Pagefifty, and this page will not overwrite it.'
		);
	});
});

describe('shownFileName', () => {
	// Built from their numbers, so this file holds no invisible character itself.
	const DIRECTION_CODES = [
		0x61c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069
	];

	it('drops every direction control, so a name cannot reorder the sentence around it', () => {
		for (const code of DIRECTION_CODES) {
			expect(shownFileName(`evil${String.fromCharCode(code)}nosj.json`)).toBe('evilnosj.json');
		}
		const all = String.fromCharCode(...DIRECTION_CODES);
		expect(shownFileName(`a${all}b.json`)).toBe('ab.json');
	});

	it('keeps every other character, right-to-left letters included', () => {
		expect(shownFileName('Übersicht ×2 (kopie).json')).toBe('Übersicht ×2 (kopie).json');
		const arabic = `${String.fromCharCode(0x645, 0x644, 0x641)}.json`;
		expect(shownFileName(arabic)).toBe(arabic);
	});
});

describe('importFaultText', () => {
	it('names no cause for a fault no import step foresaw', () => {
		expect(importFaultText('f.json')).toEqual({
			lead: 'f.json was not imported: an error Pagefifty did not expect stopped the import. Choose the file again.',
			fields: [],
			closing: 'Nothing was changed.'
		});
	});
});

describe('clockTime', () => {
	it('gives 24-hour HH:MM in the zone asked for, midnight as 00', () => {
		expect(clockTime(new Date('2026-09-29T12:34:00Z'), 'Europe/Amsterdam')).toBe('14:34');
		expect(clockTime(new Date('2026-09-29T22:05:00Z'), 'Europe/Amsterdam')).toBe('00:05');
		expect(clockTime(new Date('2026-09-29T22:05:00Z'), 'UTC')).toBe('22:05');
	});
});

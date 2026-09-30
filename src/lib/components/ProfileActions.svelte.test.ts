import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDay } from '$lib/core/deadline';
import { localIsoDay } from '$lib/profile/export';
import { StoredProfileSchema, emptyProfile } from '$lib/profile/schema';
import {
	ACTIVE_FIRM_KEY,
	PROFILE_KEY,
	getProfileStore,
	resetProfileStore
} from '$lib/profile/store.svelte';
import Page from '../../routes/profile/+page.svelte';

// A step that cannot read an older file is the one way to an invalid refusal with no field list;
// version 1 has no steps, so the test supplies one that throws.
const migration = vi.hoisted(() => ({ fails: false }));
vi.mock('$lib/profile/migrate', async (original) => {
	const real = await original<typeof import('$lib/profile/migrate')>();
	return {
		...real,
		migrateToCurrent: (doc: Parameters<typeof real.migrateToCurrent>[0]) => {
			if (migration.fails) throw new Error('cannot read this file');
			return real.migrateToCurrent(doc);
		}
	};
});

// "Last exported" is the visitor's local date; the expectations are computed in the zone pinned
// here so the file reads the same on a machine in Amsterdam and on CI in UTC.
process.env.TZ = 'Europe/Amsterdam';

const NOTHING_CHANGED = 'Nothing was changed.';

beforeEach(() => {
	localStorage.clear();
	resetProfileStore();
});

afterEach(() => {
	migration.fails = false;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const status = () => squash(screen.getByRole('status').textContent);
// The alert's sentences and field lines are separate blocks, so their text is joined with a space
// the way a reader meets them, not run together as raw textContent would.
const alertText = async () => {
	const alert = await screen.findByRole('alert');
	return squash([...alert.querySelectorAll('p, li')].map((block) => block.textContent).join(' '));
};
const staffField = () => screen.findByLabelText('Total staff') as Promise<HTMLInputElement>;
const importInput = () => screen.getByLabelText('Import a profile file') as HTMLInputElement;

function storedFile(total: number, extra: Record<string, unknown> = {}) {
	return JSON.stringify({
		schemaVersion: 1,
		savedAt: '2026-09-20T10:00:00.000Z',
		lastExportedAt: null,
		profile: { ...emptyProfile(), staff: { total, byRole: [], yearlyAverages: [] }, ...extra }
	});
}

function jsonFile(name: string, text: string): File {
	return new File([text], name, { type: 'application/json' });
}

async function saveStaff(value: string) {
	await userEvent.type(await staffField(), value);
}

// Every button and file control in the Firm leaf's action row, in the order the page draws them.
function actionNames(): string[] {
	const firm = document.getElementById('firm') as HTMLElement;
	return [...firm.querySelectorAll('.actions > *')].map((action) => squash(action.textContent));
}

describe('profile actions in own mode', () => {
	it('offers only Import and the demo firm, under the empty lede, while nothing is saved', async () => {
		render(Page);
		await staffField();
		expect(actionNames()).toEqual(['Import a profile file', 'Use the demo firm']);
		expect(
			screen.getByText(
				'Nothing saved yet. Fill in what you can prove with a document, or try the pages with the demo firm.'
			)
		).toBeTruthy();
		expect(
			screen.getByText(
				'Importing replaces the profile in this browser. Export first to keep a copy.'
			)
		).toBeTruthy();
	});

	it('adds Export first once a profile is saved', async () => {
		render(Page);
		await saveStaff('19');
		expect(actionNames()).toEqual([
			'Export profile file',
			'Import a profile file',
			'Use the demo firm'
		]);
	});

	it('keeps the file control keyboard reachable inside its label', async () => {
		render(Page);
		await staffField();
		const input = importInput();
		expect(input.type).toBe('file');
		expect(input.accept).toBe('application/json,.json');
		expect(input.tabIndex).not.toBe(-1);
		expect(input.closest('label')?.textContent).toContain('Import a profile file');
	});

	it('downloads the dated file and shows the export date', async () => {
		const created: Blob[] = [];
		vi.stubGlobal('URL', {
			...URL,
			createObjectURL: (blob: Blob) => {
				created.push(blob);
				return 'blob:profile';
			},
			revokeObjectURL: () => undefined
		});
		const names: string[] = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
			this: HTMLAnchorElement
		) {
			names.push(this.download);
		});
		render(Page);
		await saveStaff('19');
		await userEvent.click(screen.getByRole('button', { name: 'Export profile file' }));
		const now = new Date();
		expect(names).toEqual([`pagefifty-profile-${localIsoDay(now)}.json`]);
		expect(JSON.parse(await created[0].text()).profile.staff.total).toBe(19);
		expect(
			screen.getByText(`Last exported: ${formatDay(now.toISOString(), 'Europe/Amsterdam')}`)
		).toBeTruthy();
		expect(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}').lastExportedAt).not.toBeNull();
	});
});

describe('importing a profile file', () => {
	it('replaces the stored profile whole and says so', async () => {
		render(Page);
		await saveStaff('19');
		await userEvent.upload(importInput(), jsonFile('mine.json', storedFile(42)));
		await vi.waitFor(() =>
			expect(status()).toBe('Imported mine.json. It replaced the profile that was in this browser.')
		);
		expect((await staffField()).value).toBe('42');
		expect(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}').profile.staff.total).toBe(42);
	});

	it('asks the browser to keep the profile once an import stores it', async () => {
		const { store } = getProfileStore();
		const persist = vi.spyOn(store, 'requestPersistOnce');
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('mine.json', storedFile(42)));
		await vi.waitFor(() =>
			expect(status()).toBe('Imported mine.json. It replaced the profile that was in this browser.')
		);
		expect(persist).toHaveBeenCalledWith(navigator);
	});

	// A browser fires no change for the same file picked twice unless the input was emptied.
	it('empties the file control after each pick, so the same file can be picked again', async () => {
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('mine.json', storedFile(42)));
		await vi.waitFor(() => expect(status()).toMatch(/^Imported mine\.json\./));
		expect(importInput().value).toBe('');
		expect(importInput().files?.length ?? 0).toBe(0);
	});

	it('clears a field error left from typing once an import replaces the profile', async () => {
		render(Page);
		// Typing "1" saves it before the dot arrives, so the rest of the line says the rest is saved.
		await userEvent.type(await staffField(), '1.5');
		expect(status()).toMatch(/^Not saved: Total staff needs a valid value\./);
		await userEvent.upload(importInput(), jsonFile('mine.json', storedFile(42)));
		await vi.waitFor(() =>
			expect(status()).toBe('Imported mine.json. It replaced the profile that was in this browser.')
		);
		expect((await staffField()).getAttribute('aria-invalid')).toBeNull();
		expect((await staffField()).value).toBe('42');
	});

	it('says it is reading a file and leaves storage alone until the file passes', async () => {
		render(Page);
		await saveStaff('19');
		const before = localStorage.getItem(PROFILE_KEY);
		let finish: (text: string) => void = () => undefined;
		const file = jsonFile('slow.json', '');
		Object.defineProperty(file, 'text', {
			value: () => new Promise<string>((resolve) => (finish = resolve))
		});
		await userEvent.upload(importInput(), file);
		await vi.waitFor(() => expect(status()).toBe('Reading slow.json.'));
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
		finish(storedFile(7));
		await vi.waitFor(() =>
			expect(status()).toBe('Imported slow.json. It replaced the profile that was in this browser.')
		);
	});

	// Files apply in the order picked. While one is still being read the status says so, and a later
	// refusal never takes the status back past an import that did replace the profile.
	it('keeps the status true when two picked files overlap and the second is refused', async () => {
		render(Page);
		await saveStaff('19');
		const slow = (name: string) => {
			let finish: (text: string) => void = () => undefined;
			const file = jsonFile(name, '');
			Object.defineProperty(file, 'text', {
				value: () => new Promise<string>((resolve) => (finish = resolve))
			});
			return { file, finish: (text: string) => finish(text) };
		};
		const first = slow('first.json');
		const second = slow('second.json');
		await userEvent.upload(importInput(), first.file);
		await userEvent.upload(importInput(), second.file);
		await vi.waitFor(() => expect(status()).toBe('Reading second.json.'));
		first.finish(storedFile(7));
		await vi.waitFor(() =>
			expect(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}').profile.staff.total).toBe(7)
		);
		expect(status()).toBe('Reading second.json.');
		second.finish('not json');
		expect(await alertText()).toContain('second.json is not a profile file');
		expect(status()).toBe('Imported first.json. It replaced the profile that was in this browser.');
		expect((await staffField()).value).toBe('7');
	});

	// Files settle in the order picked, so a refusal of an earlier pick is stale once a later pick
	// has replaced the profile.
	it("clears an earlier file's refusal once a later pick replaces the profile", async () => {
		render(Page);
		await saveStaff('19');
		const slow = (name: string) => {
			let finish: (text: string) => void = () => undefined;
			const file = jsonFile(name, '');
			Object.defineProperty(file, 'text', {
				value: () => new Promise<string>((resolve) => (finish = resolve))
			});
			return { file, finish: (text: string) => finish(text) };
		};
		const first = slow('first.json');
		const second = slow('second.json');
		await userEvent.upload(importInput(), first.file);
		await userEvent.upload(importInput(), second.file);
		await vi.waitFor(() => expect(status()).toBe('Reading second.json.'));
		first.finish('not json');
		expect(await alertText()).toContain('first.json is not a profile file');
		second.finish(storedFile(7));
		await vi.waitFor(() =>
			expect(status()).toBe(
				'Imported second.json. It replaced the profile that was in this browser.'
			)
		);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	// Every step of an import catches its own failure; a fault nobody foresaw must still settle the
	// pick, so the status never stays on "Reading" and the page says the file was not imported. Such a
	// fault is no storage refusal, so the page must not name the browser as its cause.
	it('settles a pick whose import throws, with nothing stored', async () => {
		render(Page);
		await saveStaff('19');
		const before = localStorage.getItem(PROFILE_KEY);
		const { store } = getProfileStore();
		const fault = new Error('an unforeseen fault');
		vi.spyOn(store, 'replaceFromImport').mockImplementation(() => {
			throw fault;
		});
		// The page names no cause, so the console is the one record of which fault it was.
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		await userEvent.upload(importInput(), jsonFile('mine.json', storedFile(42)));
		expect(await alertText()).toBe(
			`mine.json was not imported: an error Pagefifty did not expect stopped the import. Choose the file again. ${NOTHING_CHANGED}`
		);
		expect(status()).not.toMatch(/^Reading/);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
		expect(logged).toHaveBeenCalledWith(
			'Pagefifty: the profile import stopped on an unexpected error',
			fault
		);
	});

	// A right-to-left override in a file name would reorder the rest of the sentence on screen, so a
	// name could make "not imported" read as something else. Built from their numbers, so this file
	// holds no invisible character itself.
	it('shows a picked name without its direction controls, in the status and the refusal', async () => {
		const override = String.fromCharCode(0x202e);
		const isolate = String.fromCharCode(0x2067);
		render(Page);
		await saveStaff('19');
		await userEvent.upload(importInput(), jsonFile(`evil${override}nosj.json`, 'not json'));
		expect(await alertText()).toContain('evilnosj.json is not a profile file');
		expect(await alertText()).not.toContain(override);
		await userEvent.upload(importInput(), jsonFile(`mine${isolate}.json`, storedFile(42)));
		await vi.waitFor(() =>
			expect(status()).toBe('Imported mine.json. It replaced the profile that was in this browser.')
		);
	});

	// A second pick waits on the first in the queue, so a fault in the first must not stop it.
	it('still imports a later pick after an earlier one throws', async () => {
		render(Page);
		await saveStaff('19');
		const { store } = getProfileStore();
		const real = store.replaceFromImport;
		const apply = vi.spyOn(store, 'replaceFromImport').mockImplementationOnce(() => {
			throw new Error('an unforeseen fault');
		});
		apply.mockImplementation(real);
		await userEvent.upload(importInput(), jsonFile('first.json', storedFile(42)));
		await userEvent.upload(importInput(), jsonFile('second.json', storedFile(7)));
		await vi.waitFor(() =>
			expect(status()).toBe(
				'Imported second.json. It replaced the profile that was in this browser.'
			)
		);
		expect(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}').profile.staff.total).toBe(7);
	});

	it('refuses a file that is not JSON, the empty file included', async () => {
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('empty.json', ''));
		expect(await alertText()).toBe(
			`empty.json is not a profile file because it is not JSON. Choose a .json file exported from Pagefifty, like pagefifty-profile-2026-09-20.json. ${NOTHING_CHANGED}`
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
	});

	it('refuses a file with no schemaVersion', async () => {
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('old.json', '{"profile":{}}'));
		expect(await alertText()).toBe(
			`old.json has no schemaVersion, so Pagefifty cannot tell which version wrote it. Choose a file exported from Pagefifty. ${NOTHING_CHANGED}`
		);
	});

	it('refuses a file a newer Pagefifty wrote, naming its version', async () => {
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('next.json', '{"schemaVersion":3}'));
		expect(await alertText()).toBe(
			`next.json was written by a newer version of Pagefifty (schemaVersion 3). This page reads schemaVersion 1. ${NOTHING_CHANGED}`
		);
	});

	it('refuses a schema-invalid file whole, one line per field, and keeps the profile', async () => {
		render(Page);
		await saveStaff('19');
		const before = localStorage.getItem(PROFILE_KEY);
		const bad = JSON.parse(storedFile(-3));
		bad.profile.completedFinancialYears = '6 years';
		await userEvent.upload(importInput(), jsonFile('bad.json', JSON.stringify(bad)));
		expect(await alertText()).toBe(
			`bad.json was not imported because 2 fields are not valid: Completed financial years: the value has the wrong type. Found "6 years". Total staff: the value is too small or too short. Found -3. ${NOTHING_CHANGED}`
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
		expect((await staffField()).value).toBe('19');
	});

	// A key a plain object inherits (constructor, toString, __proto__) is still a key the file holds,
	// named as it stands, never a built-in the label table happens to reach.
	it('names a key the file holds even when it shares a name with a built-in', async () => {
		render(Page);
		await staffField();
		const text = storedFile(1)
			.replace(
				'{"schemaVersion"',
				'{"constructor":1,"toString":2,"__proto__":{"x":3},"schemaVersion"'
			)
			.replace('"profile":{', '"profile":{"hasOwnProperty":4,');
		await userEvent.upload(importInput(), jsonFile('built-in.json', text));
		const alert = await screen.findByRole('alert');
		const lines = within(alert)
			.getAllByRole('listitem')
			.map((item) => squash(item.textContent));
		expect(lines).toEqual([
			'Profile field hasOwnProperty: Pagefifty does not know this field. Found 4.',
			'File field constructor: Pagefifty does not know this field. Found 1.',
			'File field toString: Pagefifty does not know this field. Found 2.',
			'File field __proto__: Pagefifty does not know this field. Found {"x":3}.'
		]);
	});

	// The certificate list is drawn by name, so a file naming one certificate twice would stop the
	// page drawing if it were stored; it is refused whole and the page keeps working.
	it('refuses a file holding one certificate twice and keeps drawing the form', async () => {
		render(Page);
		await saveStaff('19');
		const before = localStorage.getItem(PROFILE_KEY);
		const text = storedFile(5, {
			certificates: [{ standard: 'ISO 27001' }, { standard: 'ISO 27001', validUntil: '2027-05-31' }]
		});
		await userEvent.upload(importInput(), jsonFile('twice.json', text));
		expect(await alertText()).toBe(
			`twice.json was not imported because 1 field is not valid: Certificates row 2, standard: the certificate is listed twice. Found "ISO 27001". ${NOTHING_CHANGED}`
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
		expect((await staffField()).value).toBe('19');
		expect(screen.getByRole('button', { name: 'ISO 27001' }).getAttribute('aria-pressed')).toBe(
			'false'
		);
	});

	it('lists at most 20 field lines, then how many more', async () => {
		render(Page);
		await staffField();
		const extra = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`extra${i}`, i]));
		await userEvent.upload(importInput(), jsonFile('many.json', storedFile(1, extra)));
		const alert = await screen.findByRole('alert');
		const lines = within(alert)
			.getAllByRole('listitem')
			.map((item) => squash(item.textContent));
		expect(lines).toHaveLength(21);
		expect(lines[0]).toBe('Profile field extra0: Pagefifty does not know this field. Found 0.');
		expect(lines[20]).toBe('and 5 more');
		expect(squash(alert.textContent)).toMatch(/^many\.json was not imported because 25 fields/);
		expect(squash(alert.textContent).endsWith(NOTHING_CHANGED)).toBe(true);
	});

	it('refuses a file over 256 KB without reading it', async () => {
		render(Page);
		await staffField();
		const file = jsonFile('huge.json', 'x'.repeat(262_145));
		const read = vi.spyOn(file, 'text');
		await userEvent.upload(importInput(), file);
		expect(await alertText()).toBe(
			`huge.json is too large to be a profile file: it is over 256 KB, and an exported profile is a few KB. Choose a file exported from Pagefifty. ${NOTHING_CHANGED}`
		);
		expect(read).not.toHaveBeenCalled();
	});

	it('refuses a file the browser cannot read', async () => {
		render(Page);
		await staffField();
		const file = jsonFile('gone.json', '{}');
		Object.defineProperty(file, 'text', { value: () => Promise.reject(new Error('gone')) });
		await userEvent.upload(importInput(), file);
		expect(await alertText()).toBe(
			`This browser could not read gone.json. It may have been moved or changed after it was chosen. Choose the file again. ${NOTHING_CHANGED}`
		);
	});

	it('shows a 200-character file name whole, as text', async () => {
		render(Page);
		await staffField();
		const name = `${'<b>a'.repeat(49)}.json`;
		expect(name).toHaveLength(201);
		await userEvent.upload(importInput(), jsonFile(name, 'nope'));
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain(name);
		expect(alert.querySelector('b')).toBeNull();
	});

	it('says the browser refused the write when storage will not take the file', async () => {
		render(Page);
		await saveStaff('19');
		const before = localStorage.getItem(PROFILE_KEY);
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		await userEvent.upload(importInput(), jsonFile('full.json', storedFile(5)));
		expect(await alertText()).toBe(
			`full.json was read but not imported: this browser refused to store it, so its storage may be full or blocked. ${NOTHING_CHANGED}`
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
	});

	it('will not overwrite a profile a newer Pagefifty stored', async () => {
		const newer = JSON.stringify({ schemaVersion: 2, savedAt: '2027-01-01T00:00:00.000Z' });
		localStorage.setItem(PROFILE_KEY, newer);
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('mine.json', storedFile(5)));
		expect(await alertText()).toBe(
			`mine.json was not imported: this browser holds a profile saved by a newer version of Pagefifty, and this page will not overwrite it. ${NOTHING_CHANGED}`
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(newer);
	});

	it('never calls an import stored in this browser when storage is blocked', async () => {
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('mine.json', storedFile(42)));
		await vi.waitFor(() =>
			expect(status()).toBe(
				'Imported mine.json. It replaced the profile on this page. This browser blocks storage, so the profile lasts only while this page is open. Export the file to keep it.'
			)
		);
	});
});

describe('import refusals that need a planted fault', () => {
	it('words an invalid file a migration step could not read', async () => {
		migration.fails = true;
		render(Page);
		await staffField();
		await userEvent.upload(importInput(), jsonFile('old.json', storedFile(5)));
		expect(await alertText()).toBe(
			`old.json was not imported because Pagefifty could not bring it up to the version this page reads. Choose a file exported from Pagefifty. ${NOTHING_CHANGED}`
		);
		expect(screen.queryAllByRole('listitem')).toHaveLength(0);
	});

	it('words a file the profile schema refused at the store, never as the browser', async () => {
		const refused = StoredProfileSchema.safeParse({});
		const parse = StoredProfileSchema.safeParse.bind(StoredProfileSchema);
		render(Page);
		await saveStaff('19');
		const before = localStorage.getItem(PROFILE_KEY);
		let calls = 0;
		// The import reads the file with the schema first; the store checks it again before writing.
		vi.spyOn(StoredProfileSchema, 'safeParse').mockImplementation((value) =>
			++calls === 2 ? refused : parse(value)
		);
		await userEvent.upload(importInput(), jsonFile('odd.json', storedFile(5)));
		expect(await alertText()).toBe(
			`odd.json was read but not imported: the profile it holds does not fit this page's profile. ${NOTHING_CHANGED}`
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
	});

	it('words one field, a missing value, a key outside the profile and a long value', async () => {
		const { importRefusalLines } = await import('$lib/profile/copy');
		const text = importRefusalLines({
			ok: false,
			reason: 'invalid',
			fileName: 'one.json',
			fields: [{ path: ['savedAt'], problem: 'invalid_format', found: undefined }]
		});
		expect([text.lead, ...text.fields].join(' ')).toBe(
			'one.json was not imported because 1 field is not valid: Saved at: the value is not in the expected format. Found nothing.'
		);
		const lines = importRefusalLines({
			ok: false,
			reason: 'invalid',
			fileName: 'two.json',
			fields: [
				{ path: ['extra'], problem: 'unrecognized_keys', found: 'x'.repeat(80) },
				{ path: ['profile', 'staff', 'byRole', 0, 'count'], problem: 'some_new_code', found: -1 }
			]
		}).fields;
		expect(lines).toEqual([
			`File field extra: Pagefifty does not know this field. Found "${'x'.repeat(56)}...`,
			'Staff, by role row 1, count: the value is not valid. Found -1.'
		]);
	});

	it('words every issue code the profile schema can raise', async () => {
		const { importRefusalLines } = await import('$lib/profile/copy');
		const codes = [
			'invalid_type',
			'too_big',
			'too_small',
			'invalid_format',
			'not_multiple_of',
			'unrecognized_keys',
			'invalid_union',
			'invalid_key',
			'invalid_element',
			'invalid_value',
			'custom'
		];
		const lines = importRefusalLines({
			ok: false,
			reason: 'invalid',
			fileName: 'f.json',
			fields: codes.map((problem) => ({
				path: ['profile', 'turnover', 1, 'year'],
				problem,
				found: 2024
			}))
		}).fields;
		expect(lines).toEqual([
			'Turnover row 2, year: the value has the wrong type. Found 2024.',
			'Turnover row 2, year: the value is too large or too long. Found 2024.',
			'Turnover row 2, year: the value is too small or too short. Found 2024.',
			'Turnover row 2, year: the value is not in the expected format. Found 2024.',
			'Turnover row 2, year: the value is not a whole step of what is allowed. Found 2024.',
			'Turnover row 2, year: Pagefifty does not know this field. Found 2024.',
			'Turnover row 2, year: the value matches none of the accepted forms. Found 2024.',
			'Turnover row 2, year: a key in it is not valid. Found 2024.',
			'Turnover row 2, year: an entry in it is not valid. Found 2024.',
			'Turnover row 2, year: the value is not one of the accepted values. Found 2024.',
			'Turnover row 2, year: the year is listed twice. Found 2024.'
		]);
	});
});

describe('the demo firm', () => {
	it('shows the demo read-only and never touches the stored own profile', async () => {
		render(Page);
		await saveStaff('19');
		const before = localStorage.getItem(PROFILE_KEY);
		await userEvent.click(screen.getByRole('button', { name: 'Use the demo firm' }));
		expect(
			(await screen.findByRole('heading', { level: 1, name: 'Brink Data B.V.' })).textContent
		).toBe('Brink Data B.V.');
		expect(screen.getByText('Demo firm')).toBeTruthy();
		expect(screen.queryAllByRole('textbox')).toHaveLength(0);
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: 'Export profile file' })).toBeNull();
		expect(screen.queryByLabelText('Import a profile file')).toBeNull();
		expect(
			screen.getByText('Brink Data B.V. is a demo firm. Every figure on this page is invented.')
		).toBeTruthy();
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
		expect(localStorage.getItem(ACTIVE_FIRM_KEY)).toBe('demo');
		await userEvent.click(screen.getByRole('button', { name: 'Back to your own profile' }));
		expect((await staffField()).value).toBe('19');
		expect(localStorage.getItem(PROFILE_KEY)).toBe(before);
	});

	it('shows the three years the demo holds, their average and its other figures', async () => {
		localStorage.setItem(ACTIVE_FIRM_KEY, 'demo');
		render(Page);
		await screen.findByRole('heading', { level: 1, name: 'Brink Data B.V.' });
		const facts = Object.fromEntries(
			[...document.querySelectorAll('.main dl div')].map((row) => [
				squash(row.querySelector('dt')?.textContent),
				squash(row.querySelector('dd')?.textContent)
			])
		);
		expect(facts).toMatchObject({
			'2023': 'EUR 1,090,000',
			'2024': 'EUR 1,210,000',
			'2025': 'EUR 1,240,000',
			Average: 'EUR 1,180,000',
			'Completed financial years': '6',
			'Total staff': '19',
			'ISO 27001': 'valid until 31 May 2027',
			'ISO 9001': 'valid until 30 Nov 2027',
			'Country of registration': 'Netherlands',
			'Countries you work in': 'Netherlands, Belgium, Germany',
			'Languages your team works in': 'Dutch, English, German'
		});
	});

	it('still switches when the browser blocks storage', async () => {
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		render(Page);
		await staffField();
		await userEvent.click(screen.getByRole('button', { name: 'Use the demo firm' }));
		expect(await screen.findByRole('heading', { level: 1, name: 'Brink Data B.V.' })).toBeTruthy();
	});
});

describe('another tab and the profile page', () => {
	it('goes back to the empty profile when another tab clears storage', async () => {
		render(Page);
		await saveStaff('19');
		await userEvent.click(document.body);
		localStorage.clear();
		window.dispatchEvent(new StorageEvent('storage', { key: null }));
		await vi.waitFor(() =>
			expect(actionNames()).toEqual(['Import a profile file', 'Use the demo firm'])
		);
		expect((await staffField()).value).toBe('');
	});

	it('says a newer Pagefifty wrote the stored profile when another tab does', async () => {
		render(Page);
		await saveStaff('19');
		localStorage.setItem(PROFILE_KEY, JSON.stringify({ schemaVersion: 2 }));
		window.dispatchEvent(new StorageEvent('storage', { key: PROFILE_KEY }));
		await vi.waitFor(() =>
			expect(status()).toBe(
				'This browser holds a profile saved by a newer version of Pagefifty (schemaVersion 2). This page reads schemaVersion 1. Nothing was changed.'
			)
		);
	});
});

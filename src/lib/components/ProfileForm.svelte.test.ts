import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EU_EEA_COUNTRIES, EU_LANGUAGES } from '$lib/profile/codes';
import { ProfileSchema } from '$lib/profile/schema';
import {
	PROFILE_KEY,
	browserStorage,
	createProfileStore,
	type ProfileStore
} from '$lib/profile/store.svelte';
import ProfileForm from './ProfileForm.svelte';

// The save status and the export line are written in the visitor's zone, and these expectations
// in Central European Time, so the zone is pinned rather than taken from the machine (CI runs in
// UTC). Node applies a TZ assignment to the next Intl call.
process.env.TZ = 'Europe/Amsterdam';

// 14:34 in Amsterdam on 29 Sep 2026, so the form asks for 2023, 2024 and 2025.
const NOW = new Date('2026-09-29T12:34:00Z');

const stops: (() => void)[] = [];

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	for (const stop of stops.splice(0)) stop();
	vi.restoreAllMocks();
});

function mount(storage: Storage = localStorage, keptInMemory = false): ProfileStore {
	const store = createProfileStore(storage);
	store.load();
	stops.push(store.listen(window));
	render(ProfileForm, { props: { store, keptInMemory, clock: () => NOW } });
	return store;
}

const stored = () => JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
const status = () => screen.getByRole('status').textContent;
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

async function retype(name: string, text: string) {
	const input = field(name);
	await userEvent.clear(input);
	if (text !== '') await userEvent.type(input, text);
	return input;
}

function setDate(input: HTMLElement, value: string) {
	fireEvent.input(input, { target: { value } });
}

// Another tab writes storage and the browser tells this one through a storage event.
function otherTabWrites(edit: (document: { profile: Record<string, unknown> }) => void) {
	const document = stored();
	edit(document);
	localStorage.setItem(PROFILE_KEY, JSON.stringify(document));
	window.dispatchEvent(new StorageEvent('storage', { key: PROFILE_KEY }));
}

describe('ProfileForm, every phase 1 field', () => {
	it('fills and clears the three turnover years', async () => {
		mount();
		await retype('2023', '1090000');
		await retype('2024', '1210000');
		await retype('2025', '1240000');
		expect(stored().profile.turnover).toEqual([
			{ year: 2023, generalNet: 1090000, specific: [] },
			{ year: 2024, generalNet: 1210000, specific: [] },
			{ year: 2025, generalNet: 1240000, specific: [] }
		]);
		await retype('2023', '');
		await retype('2024', '');
		await retype('2025', '');
		expect(stored().profile.turnover).toEqual([]);
	});

	it('fills and clears completed financial years', async () => {
		mount();
		await retype('Completed financial years', '6');
		expect(stored().profile.completedFinancialYears).toBe(6);
		await retype('Completed financial years', '');
		expect(stored().profile.completedFinancialYears).toBeUndefined();
	});

	it('fills and clears total staff', async () => {
		mount();
		await retype('Total staff', '19');
		expect(stored().profile.staff.total).toBe(19);
		await retype('Total staff', '');
		expect(stored().profile.staff.total).toBeUndefined();
	});

	it('fills and clears a certificate and its valid-until date', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 27001' }));
		expect(stored().profile.certificates).toEqual([{ standard: 'ISO 27001' }]);
		setDate(field('ISO 27001 valid until'), '2027-05-31');
		expect(stored().profile.certificates).toEqual([
			{ standard: 'ISO 27001', validUntil: '2027-05-31' }
		]);
		setDate(field('ISO 27001 valid until'), '');
		expect(stored().profile.certificates).toEqual([{ standard: 'ISO 27001' }]);
		await userEvent.click(screen.getByRole('button', { name: 'ISO 27001' }));
		expect(stored().profile.certificates).toEqual([]);
		expect(screen.queryByLabelText('ISO 27001 valid until')).toBeNull();
	});

	it("sets one held certificate's date and leaves the other certificate's date alone", async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 27001' }));
		await userEvent.click(screen.getByRole('button', { name: 'ISO 9001' }));
		setDate(field('ISO 27001 valid until'), '2027-05-31');
		setDate(field('ISO 9001 valid until'), '2027-11-30');
		expect(stored().profile.certificates).toEqual([
			{ standard: 'ISO 27001', validUntil: '2027-05-31' },
			{ standard: 'ISO 9001', validUntil: '2027-11-30' }
		]);
		setDate(field('ISO 9001 valid until'), '');
		expect(stored().profile.certificates).toEqual([
			{ standard: 'ISO 27001', validUntil: '2027-05-31' },
			{ standard: 'ISO 9001' }
		]);
	});

	it('fills and clears the country of registration', async () => {
		mount();
		const select = screen.getByLabelText('Country of registration');
		await userEvent.selectOptions(select, 'NL');
		expect(stored().profile.registration).toEqual({ country: 'NL' });
		await userEvent.selectOptions(select, '');
		expect(stored().profile.registration).toEqual({});
	});

	it('fills and clears the countries worked in, in the order ticked', async () => {
		mount();
		await userEvent.click(screen.getByRole('checkbox', { name: 'Germany' }));
		await userEvent.click(screen.getByRole('checkbox', { name: 'Netherlands' }));
		expect(stored().profile.countries).toEqual(['DE', 'NL']);
		await userEvent.click(screen.getByRole('checkbox', { name: 'Germany' }));
		await userEvent.click(screen.getByRole('checkbox', { name: 'Netherlands' }));
		expect(stored().profile.countries).toEqual([]);
	});

	it('fills and clears the languages, in the order ticked', async () => {
		mount();
		await userEvent.click(screen.getByRole('checkbox', { name: 'English' }));
		await userEvent.click(screen.getByRole('checkbox', { name: 'Dutch' }));
		expect(stored().profile.languages).toEqual(['en', 'nl']);
		await userEvent.click(screen.getByRole('checkbox', { name: 'English' }));
		await userEvent.click(screen.getByRole('checkbox', { name: 'Dutch' }));
		expect(stored().profile.languages).toEqual([]);
	});

	it('shows every value again when the form opens on a saved profile', async () => {
		mount();
		await retype('2024', '1210000');
		await retype('Total staff', '19');
		await userEvent.click(screen.getByRole('checkbox', { name: 'Belgium' }));
		document.body.innerHTML = '';
		mount();
		expect(field('2024').value).toBe('1210000');
		expect(field('Total staff').value).toBe('19');
		expect((screen.getByRole('checkbox', { name: 'Belgium' }) as HTMLInputElement).checked).toBe(
			true
		);
	});
});

describe('ProfileForm, values and errors', () => {
	it('stores an empty money field as unknown and 0 as 0', async () => {
		mount();
		await retype('2025', '0');
		expect(stored().profile.turnover).toEqual([{ year: 2025, generalNet: 0, specific: [] }]);
		await retype('2025', '');
		expect(stored().profile.turnover).toEqual([]);
	});

	it('refuses 1.240, names the problem and keeps the saved value', async () => {
		mount();
		const input = await retype('2025', '1240000');
		input.select();
		await userEvent.paste('1.240');
		expect(input.value).toBe('1.240');
		expect(input.getAttribute('aria-invalid')).toBe('true');
		const hint = document.getElementById(input.getAttribute('aria-describedby') ?? '');
		expect(hint?.textContent?.trim()).toBe(
			'Not a number yet. Write the whole amount in euros, like 1240000. Saved value: 1240000.'
		);
		expect(stored().profile.turnover[0].generalNet).toBe(1240000);
		expect(status()).toBe('Not saved: 2025 needs a valid value. The rest is saved.');
	});

	it('counts the fields not saved when there are several', async () => {
		mount();
		await retype('Total staff', '-3');
		await retype('Completed financial years', 'six');
		expect(status()).toBe('Not saved: 2 fields need a valid value.');
		expect(
			screen.getByText('Staff cannot be below 0. Write the number of people, like 19.')
		).toBeTruthy();
		expect(
			screen.getByText(
				'Not a whole number yet. Write the number of completed financial years, like 3.'
			)
		).toBeTruthy();
	});

	it('shows the average only when all three years hold numbers', async () => {
		mount();
		await retype('2023', '1090000');
		await retype('2024', '1210000');
		expect(field('Average').value).toBe('');
		await retype('2025', '0');
		expect(field('Average').value).toBe('766667');
		await retype('2025', '1240000');
		expect(field('Average').value).toBe('1180000');
		expect(field('Average').readOnly).toBe(true);
	});

	it('keeps a certificate whose date has passed and marks it expired', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'NEN 7510' }));
		setDate(field('NEN 7510 valid until'), '2026-03-12');
		// UI-SPEC: the expired hint turns to ink 600, the strong hint, so it cannot be missed.
		const expired = screen.getByText('Expired on 12 Mar 2026. It stays in your profile.');
		expect(expired.classList.contains('strong')).toBe(true);
		expect(field('NEN 7510 valid until').getAttribute('aria-describedby')).toBe(expired.id);
		expect(stored().profile.certificates).toEqual([
			{ standard: 'NEN 7510', validUntil: '2026-03-12' }
		]);
		expect(screen.getByRole('button', { name: 'NEN 7510' }).getAttribute('aria-pressed')).toBe(
			'true'
		);
	});

	it('keeps a held certificate with no date', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'BSI C5' }));
		const hint = document.getElementById(
			field('BSI C5 valid until').getAttribute('aria-describedby') ?? ''
		);
		expect(hint?.textContent).toBe('Leave empty if you do not know.');
		expect(stored().profile.certificates).toEqual([{ standard: 'BSI C5' }]);
	});

	it('refuses a date that is not a real day and keeps the saved one', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 9001' }));
		const input = field('ISO 9001 valid until');
		setDate(input, '2027-11-30');
		Object.defineProperty(input, 'value', {
			configurable: true,
			get: () => '2027-02-31',
			set: () => undefined
		});
		fireEvent.input(input);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(
			screen.getByText(
				'Not a date yet. Pick the day the certificate runs out, like 31 Mar 2027. Saved value: 30 Nov 2027.'
			)
		).toBeTruthy();
		expect(stored().profile.certificates).toEqual([
			{ standard: 'ISO 9001', validUntil: '2027-11-30' }
		]);
	});

	it('treats a half-typed date the browser reports as bad input as an error, not a clear', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 9001' }));
		const input = field('ISO 9001 valid until');
		setDate(input, '2027-11-30');
		Object.defineProperty(input, 'value', {
			configurable: true,
			get: () => '',
			set: () => undefined
		});
		Object.defineProperty(input, 'validity', {
			configurable: true,
			get: () => ({ badInput: true })
		});
		fireEvent.input(input);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(stored().profile.certificates[0].validUntil).toBe('2027-11-30');
	});

	it('shows no date field and no pressed chip when no certificate is held', () => {
		mount();
		const group = screen.getByRole('group', { name: 'Certificates held' });
		const pressed = within(group)
			.getAllByRole('button')
			.map((chip) => chip.getAttribute('aria-pressed'));
		expect(pressed).toEqual(['false', 'false', 'false', 'false', null]);
		expect(screen.queryByLabelText(/valid until$/)).toBeNull();
	});

	it('asks for a name before adding another certificate', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'Add another' }));
		await userEvent.click(screen.getByRole('button', { name: 'Add certificate' }));
		expect(screen.getByText('Name the certificate, like ISO 22301.')).toBeTruthy();
		expect(field('Certificate name').getAttribute('aria-invalid')).toBe('true');
		expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
	});

	it('adds a named certificate as a pressed chip and announces its removal', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'Add another' }));
		await userEvent.type(field('Certificate name'), '  ISO 22301 ');
		await userEvent.click(screen.getByRole('button', { name: 'Add certificate' }));
		const chip = screen.getByRole('button', { name: 'ISO 22301' });
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		expect(stored().profile.certificates).toEqual([{ standard: 'ISO 22301' }]);
		await userEvent.click(chip);
		expect(status()).toBe('Removed ISO 22301.');
		expect(screen.queryByRole('button', { name: 'ISO 22301' })).toBeNull();
		expect(stored().profile.certificates).toEqual([]);
	});

	it('takes an 80-character name whole and stops the input at 80', async () => {
		mount();
		const name = `ISO ${'9'.repeat(76)}`;
		await userEvent.click(screen.getByRole('button', { name: 'Add another' }));
		const input = field('Certificate name');
		expect(input.maxLength).toBe(80);
		await userEvent.type(input, `${name}XYZ`);
		expect(input.value).toBe(name);
		await userEvent.click(screen.getByRole('button', { name: 'Add certificate' }));
		expect(screen.getByRole('button', { name }).textContent).toBe(name);
		expect(stored().profile.certificates).toEqual([{ standard: name }]);
	});
});

describe('ProfileForm, the save status and the storage line', () => {
	it('says nothing is saved yet, then the time of the save in this browser', async () => {
		const store = mount();
		const persist = vi.spyOn(store, 'requestPersistOnce');
		expect(status()).toBe('Nothing saved yet.');
		expect(
			screen.getByText(
				'Nothing saved yet. Fill in what you can prove with a document, or try the pages with the demo firm.'
			)
		).toBeTruthy();
		await retype('Total staff', '19');
		expect(status()).toBe('Saved in this browser at 14:34.');
		expect(persist).toHaveBeenCalledWith(navigator);
	});

	it('never gives a time for a profile it read but did not save itself', async () => {
		mount();
		await retype('Total staff', '19');
		document.body.innerHTML = '';
		mount();
		expect(status()).toBe('Saved in this browser.');
	});

	it('always states the storage sentence and the last export', async () => {
		const store = mount();
		expect(
			screen.getByText(
				'Nothing here is sent to a server. This browser may delete it without asking, so export the file and keep it.'
			)
		).toBeTruthy();
		expect(screen.getByText('Last exported: never')).toBeTruthy();
		await retype('Total staff', '19');
		store.markExported(new Date('2026-09-20T22:30:00Z'));
		// 00:30 on 21 Sep in Amsterdam: the local day, not the UTC one.
		expect(await screen.findByText('Last exported: 21 Sep 2026')).toBeTruthy();
	});

	it('never says saved in this browser when blocked storage keeps it on this page only', async () => {
		const storage = browserStorage({
			get localStorage(): Storage {
				throw new DOMException('blocked', 'SecurityError');
			}
		});
		mount(storage, true);
		const note =
			'This browser blocks storage, so the profile lasts only while this page is open. Export the file to keep it.';
		expect(status()).toBe(`Nothing saved yet. ${note}`);
		await retype('Total staff', '19');
		expect(status()).toBe(`Kept on this page only. ${note}`);
		await retype('Total staff', 'x');
		expect(status()).toBe(`Not saved: Total staff needs a valid value. ${note}`);
	});

	it('says so when the browser refuses to store the profile', async () => {
		mount();
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		await retype('Total staff', '3');
		expect(status()).toBe('Not saved: this browser refused to store the profile.');
	});

	// A tick box or a choice has no error line of its own, so a refused change must not stay shown
	// as if it were kept; what another tab stores afterwards still shows.
	it('shows a refused tick and a refused country as storage holds them', async () => {
		mount();
		// This setup's HTMLSelectElement type clashes with Element over remove(), so the value is read
		// through its shape rather than a cast to the select type.
		const select = screen.getByLabelText('Country of registration');
		const choice = () => (select as unknown as { value: string }).value;
		await userEvent.selectOptions(select, 'NL');
		const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		const germany = screen.getByRole('checkbox', { name: 'Germany' }) as HTMLInputElement;
		await userEvent.click(germany);
		expect(status()).toBe('Not saved: this browser refused to store the profile.');
		expect(germany.checked).toBe(false);
		await userEvent.selectOptions(select, 'BE');
		expect(choice()).toBe('NL');
		refuse.mockRestore();
		otherTabWrites((document) => {
			document.profile.registration = { country: 'BE' };
			document.profile.countries = ['DE'];
		});
		await vi.waitFor(() => expect([choice(), germany.checked]).toEqual(['BE', true]));
	});

	it('never blames the browser for a change the profile schema refuses', async () => {
		mount();
		vi.spyOn(ProfileSchema, 'safeParse').mockReturnValue(ProfileSchema.safeParse({}));
		await retype('Total staff', '3');
		expect(status()).toBe(
			'Not saved: that change does not fit the profile, so nothing was changed.'
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
	});

	it('keeps a profile a newer version saved, and says nothing was changed', async () => {
		const newer = JSON.stringify({ schemaVersion: 2, savedAt: '2027-01-01T00:00:00.000Z' });
		localStorage.setItem(PROFILE_KEY, newer);
		mount();
		await retype('Total staff', '19');
		expect(status()).toBe(
			'This browser holds a profile saved by a newer version of Pagefifty (schemaVersion 2). This page reads schemaVersion 1. Nothing was changed.'
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(newer);
	});

	it('shows loading lines in every leaf and the noscript line before storage is read', () => {
		const { container } = render(ProfileForm, { props: { store: null, keptInMemory: false } });
		expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(5);
		expect(container.querySelector('noscript')).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your firm profile');
	});
});

describe('ProfileForm, another tab', () => {
	it('takes another tab write without losing a half-typed field, then saves both', async () => {
		mount();
		await retype('Total staff', '19');
		await retype('2025', '1.2');
		otherTabWrites((document) => {
			(document.profile.staff as { total: number }).total = 42;
		});
		await vi.waitFor(() => expect(field('Total staff').value).toBe('42'));
		expect(field('2025').value).toBe('1.2');
		await retype('2025', '1200000');
		expect(stored().profile.staff.total).toBe(42);
		expect(stored().profile.turnover).toEqual([{ year: 2025, generalNet: 1200000, specific: [] }]);
	});

	// The field the user is in keeps their text through another tab's write; once they leave it, it
	// shows what storage holds, never the old number.
	it("shows another tab's value once the user leaves the field it was kept in", async () => {
		mount();
		await retype('Total staff', '19');
		otherTabWrites((document) => {
			(document.profile.staff as { total: number }).total = 42;
		});
		expect(field('Total staff').value).toBe('19');
		await userEvent.click(document.body);
		await vi.waitFor(() => expect(field('Total staff').value).toBe('42'));
	});

	// A number the browser refused to store must not stay on screen once the user moves on, where a
	// later save elsewhere would call the profile saved while this field shows something else.
	it('shows the stored number again once the user leaves a field whose save was refused', async () => {
		mount();
		await retype('Total staff', '19');
		const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		await retype('Total staff', '25');
		expect(status()).toBe('Not saved: this browser refused to store the profile.');
		refuse.mockRestore();
		await retype('Completed financial years', '6');
		expect(stored().profile.staff.total).toBe(19);
		expect(field('Total staff').value).toBe('19');
		expect(status()).toBe('Saved in this browser at 14:34.');
	});

	// A profile naming one certificate twice fails the schema, so it reads as nothing saved rather
	// than reaching the certificate list, which is drawn by name.
	it('keeps drawing when another tab stores one certificate twice', async () => {
		mount();
		await retype('Total staff', '19');
		await userEvent.click(document.body);
		otherTabWrites((document) => {
			document.profile.certificates = [{ standard: 'ISO 27001' }, { standard: 'ISO 27001' }];
		});
		await vi.waitFor(() => expect(field('Total staff').value).toBe(''));
		expect(screen.getByRole('button', { name: 'ISO 27001' }).getAttribute('aria-pressed')).toBe(
			'false'
		);
	});

	it('empties the form when another tab removes the profile', async () => {
		mount();
		await retype('Total staff', '19');
		await userEvent.click(document.body);
		localStorage.removeItem(PROFILE_KEY);
		window.dispatchEvent(new StorageEvent('storage', { key: PROFILE_KEY }));
		await vi.waitFor(() => expect(field('Total staff').value).toBe(''));
		expect(status()).toBe('Nothing saved yet.');
	});
});

describe('ProfileForm, what shows after a refused write or a newer profile', () => {
	const refuseWrites = () =>
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});

	// The status names the newer profile; the lede must not say the browser holds nothing.
	it('never says nothing is saved while a newer version holds the stored profile', () => {
		localStorage.setItem(
			PROFILE_KEY,
			JSON.stringify({ schemaVersion: 2, savedAt: '2027-01-01T00:00:00.000Z' })
		);
		mount();
		expect(screen.queryByText(/^Nothing saved yet\. Fill in/)).toBeNull();
		expect(
			screen.getByText(
				'This browser holds a profile saved by a newer version of Pagefifty, which this page cannot read. It stays as it is, and nothing typed here is saved.'
			)
		).toBeTruthy();
	});

	// The field is gone, so an error left behind would name a field nobody can see or fix.
	it('drops the error of a certificate another tab removed', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 9001' }));
		const input = field('ISO 9001 valid until');
		Object.defineProperty(input, 'value', {
			configurable: true,
			get: () => '2027-02-31',
			set: () => undefined
		});
		fireEvent.input(input);
		expect(status()).toBe(
			'Not saved: ISO 9001 valid until needs a valid value. The rest is saved.'
		);
		otherTabWrites((document) => {
			document.profile.certificates = [];
		});
		await vi.waitFor(() => expect(screen.queryByLabelText('ISO 9001 valid until')).toBeNull());
		expect(status()).not.toMatch(/^Not saved/);
	});

	// Only the removed certificate's error goes: one still held keeps its field, so its error stays.
	it('keeps the error of a held certificate when another tab removes a different one', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 9001' }));
		await userEvent.click(screen.getByRole('button', { name: 'ISO 27001' }));
		const input = field('ISO 9001 valid until');
		Object.defineProperty(input, 'value', {
			configurable: true,
			get: () => '2027-02-31',
			set: () => undefined
		});
		fireEvent.input(input);
		otherTabWrites((document) => {
			document.profile.certificates = [{ standard: 'ISO 9001' }];
		});
		await vi.waitFor(() => expect(screen.queryByLabelText('ISO 27001 valid until')).toBeNull());
		expect(field('ISO 9001 valid until').getAttribute('aria-invalid')).toBe('true');
		expect(status()).toBe(
			'Not saved: ISO 9001 valid until needs a valid value. The rest is saved.'
		);
	});

	it('keeps a certificate and its date on screen when the browser refuses to remove it', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 27001' }));
		setDate(field('ISO 27001 valid until'), '2027-05-31');
		refuseWrites();
		await userEvent.click(screen.getByRole('button', { name: 'ISO 27001' }));
		expect(status()).toBe('Not saved: this browser refused to store the profile.');
		expect(stored().profile.certificates).toEqual([
			{ standard: 'ISO 27001', validUntil: '2027-05-31' }
		]);
		expect(field('ISO 27001 valid until').value).toBe('2027-05-31');
	});

	it('keeps the typed name and the open panel when the browser refuses to add a certificate', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'Add another' }));
		await userEvent.type(field('Certificate name'), 'ISO 22301');
		refuseWrites();
		await userEvent.click(screen.getByRole('button', { name: 'Add certificate' }));
		expect(status()).toBe('Not saved: this browser refused to store the profile.');
		expect(field('Certificate name').value).toBe('ISO 22301');
		expect(document.getElementById('add-certificate')?.hidden).toBe(false);
	});

	// Every field shows what storage holds once the user leaves it, not only the staff count.
	it('shows the stored years, turnover and date again once the user leaves a refused field', async () => {
		mount();
		await retype('Completed financial years', '3');
		await retype('2025', '1240000');
		await userEvent.click(screen.getByRole('button', { name: 'ISO 9001' }));
		setDate(field('ISO 9001 valid until'), '2027-05-31');
		refuseWrites();
		await retype('Completed financial years', '5');
		await retype('2025', '999');
		const date = field('ISO 9001 valid until');
		date.focus();
		setDate(date, '2028-01-31');
		expect(date.value).toBe('2028-01-31');
		await userEvent.click(document.body);
		expect(status()).toBe('Not saved: this browser refused to store the profile.');
		await vi.waitFor(() => expect(date.value).toBe('2027-05-31'));
		expect(field('Completed financial years').value).toBe('3');
		expect(field('2025').value).toBe('1240000');
	});

	// The error names what is wrong with the text, so leaving the field must not swap it for the
	// stored value while the error still shows.
	it('keeps the typed text of a field in error once the user leaves it', async () => {
		mount();
		await retype('2025', '1240000');
		await retype('2025', '1.240');
		await userEvent.click(document.body);
		expect(field('2025').value).toBe('1.240');
		expect(status()).toBe('Not saved: 2025 needs a valid value. The rest is saved.');
	});
});

// D-19: phase 1 edits exactly the SPEC R4 subset. Every control the form draws must belong to one
// of its seven fields, and none may be labelled for a field the schema holds for phase 2.
describe('ProfileForm, the phase 1 scope', () => {
	const countryNames = new Set(EU_EEA_COUNTRIES.map((country) => country.name));
	const languageNames = new Set(EU_LANGUAGES.map((language) => language.name));
	const PHASE_ONE: { field: string; matches: (name: string) => boolean }[] = [
		{ field: 'country of registration', matches: (name) => name === 'Country of registration' },
		{ field: 'completed financial years', matches: (name) => name === 'Completed financial years' },
		{ field: 'general net turnover', matches: (name) => /^(20\d\d|Average)$/.test(name) },
		{ field: 'total staff', matches: (name) => name === 'Total staff' },
		{
			field: 'certificates with valid-until',
			matches: (name) =>
				/^(ISO 27001|ISO 9001|BSI C5|NEN 7510|ISO 22301|Add another|Certificate name|Add certificate)$/.test(
					name
				) || / valid until$/.test(name)
		},
		{ field: 'countries', matches: (name) => countryNames.has(name) },
		{ field: 'languages', matches: (name) => languageNames.has(name) }
	];
	const LATER =
		/regist(er|ry)\b|authori[sz]ation|reserved|clearance|specific|business line|role|developer|yearly average|headcount|insurance|cover|scope|reference|client/i;

	function accessibleName(control: Element): string {
		if (control instanceof HTMLButtonElement) return control.textContent?.trim() ?? '';
		const byFor = control.id ? document.querySelector(`label[for="${control.id}"]`) : null;
		const label = byFor ?? control.closest('label');
		return label?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
	}

	it('draws only controls for the seven SPEC R4 fields', async () => {
		mount();
		await userEvent.click(screen.getByRole('button', { name: 'Add another' }));
		await userEvent.type(field('Certificate name'), 'ISO 22301');
		await userEvent.click(screen.getByRole('button', { name: 'Add certificate' }));
		await userEvent.click(screen.getByRole('button', { name: 'ISO 27001' }));
		// The Firm leaf's action row and its remove control act on the whole profile and edit no field.
		const names = [...document.body.querySelectorAll('input, select, textarea, button')]
			.filter((control) => !control.closest('.actions, .remove'))
			.map(accessibleName);
		expect(document.querySelectorAll('.actions input, .actions button').length).toBe(3);
		expect(names.length).toBeGreaterThan(60);
		const unmatched = names.filter((name) => !PHASE_ONE.some((rule) => rule.matches(name)));
		expect(unmatched).toEqual([]);
		expect(names.filter((name) => LATER.test(name))).toEqual([]);
		for (const rule of PHASE_ONE) expect(names.some(rule.matches), rule.field).toBe(true);
	});
});

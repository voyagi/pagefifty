import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSchema } from '$lib/profile/schema';
import { PROFILE_KEY } from '$lib/profile/store.svelte';
import Page from './+page.svelte';

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

const staffField = () => screen.findByLabelText('Total staff');
const stored = () => JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');

describe('firm profile page', () => {
	it('says nothing is saved yet on a first visit', async () => {
		render(Page);
		await staffField();
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your firm profile');
		expect(screen.getByRole('status').textContent).toBe('Nothing saved yet.');
	});

	it('saves a valid total staff as it is typed, with no button', async () => {
		render(Page);
		await userEvent.type(await staffField(), '19');
		expect(stored()).toMatchObject({ schemaVersion: 1, profile: { staff: { total: 19 } } });
		expect(screen.getByRole('status').textContent).toMatch(
			/^Saved in this browser at \d{2}:\d{2}\.$/
		);
	});

	it('shows what was saved before when the page opens again', async () => {
		render(Page);
		await userEvent.type(await staffField(), '7');
		document.body.innerHTML = '';
		render(Page);
		expect(((await staffField()) as HTMLInputElement).value).toBe('7');
	});

	it('marks an invalid value, names the problem and keeps the last valid one', async () => {
		render(Page);
		const field = await staffField();
		await userEvent.type(field, '19');
		await userEvent.type(field, '.5');
		expect(field.getAttribute('aria-invalid')).toBe('true');
		expect(
			screen.getByText('Not a whole number yet. Write the number of people, like 19.')
		).toBeTruthy();
		expect(screen.getByRole('status').textContent).toBe(
			'Not saved: Total staff needs a valid value. The rest is saved.'
		);
		expect(stored().profile.staff.total).toBe(19);
	});

	it('never says the rest is saved when nothing was saved yet', async () => {
		render(Page);
		await userEvent.type(await staffField(), 'abc');
		expect(screen.getByRole('status').textContent).toBe(
			'Not saved: Total staff needs a valid value.'
		);
	});

	it('never says the rest is saved when blocked storage keeps it on this page only', async () => {
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		render(Page);
		const field = await staffField();
		await userEvent.type(field, '19');
		await userEvent.type(field, '.5');
		expect(screen.getByRole('status').textContent).toBe(
			'Not saved: Total staff needs a valid value. This browser blocks storage, so the profile lasts only while this page is open.'
		);
	});

	it('keeps a profile a newer version saved, and says nothing was changed', async () => {
		const newer = JSON.stringify({ schemaVersion: 2, savedAt: '2027-01-01T00:00:00.000Z' });
		localStorage.setItem(PROFILE_KEY, newer);
		render(Page);
		await userEvent.type(await staffField(), '19');
		expect(screen.getByRole('status').textContent).toBe(
			'This browser holds a profile saved by a newer version of Pagefifty (schemaVersion 2). This page reads schemaVersion 1. Nothing was changed.'
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBe(newer);
	});

	it('never calls a profile saved when blocked storage keeps it on this page only', async () => {
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		render(Page);
		await userEvent.type(await staffField(), '19');
		expect(screen.getByRole('status').textContent).toBe(
			'Not saved: this browser blocks storage, so the profile lasts only while this page is open.'
		);
	});

	it('never calls a profile saved when storage switched off reads as null', async () => {
		vi.spyOn(window, 'localStorage', 'get').mockReturnValue(null as unknown as Storage);
		render(Page);
		await userEvent.type(await staffField(), '19');
		expect(screen.getByRole('status').textContent).toBe(
			'Not saved: this browser blocks storage, so the profile lasts only while this page is open.'
		);
	});

	it('says so when the browser refuses to store the profile', async () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		render(Page);
		await userEvent.type(await staffField(), '3');
		expect(screen.getByRole('status').textContent).toBe(
			'Not saved: this browser refused to store the profile.'
		);
	});

	// No value typed into this page's one field can break the schema; the forms plan 01-14 adds can.
	it('never blames the browser for a change the profile schema refuses', async () => {
		const refused = ProfileSchema.safeParse({});
		vi.spyOn(ProfileSchema, 'safeParse').mockReturnValue(refused);
		render(Page);
		await userEvent.type(await staffField(), '3');
		expect(screen.getByRole('status').textContent).toBe(
			'Not saved: that change does not fit the profile, so nothing was changed.'
		);
		expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
	});

	it('is the skip link target', async () => {
		render(Page);
		await staffField();
		expect(document.getElementById('main')?.tagName).toBe('MAIN');
	});
});

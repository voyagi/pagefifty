import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});

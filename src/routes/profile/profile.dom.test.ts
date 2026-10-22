import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_KEY, resetProfileStore } from '$lib/profile/store.svelte';
import Page from './+page.svelte';

beforeEach(() => {
	localStorage.clear();
	resetProfileStore();
});

afterEach(() => {
	vi.restoreAllMocks();
});

const staffField = () => screen.findByLabelText('Total staff');
const stored = () => JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');

describe('firm profile page', () => {
	it('sets the form in the main frame, which is the skip link target', async () => {
		render(Page);
		await staffField();
		const main = document.getElementById('main');
		expect(main?.tagName).toBe('MAIN');
		expect(main?.classList.contains('page')).toBe(true);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your firm profile');
	});

	it('reads the profile after mount and saves a change with no button', async () => {
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
		resetProfileStore();
		render(Page);
		expect(((await staffField()) as HTMLInputElement).value).toBe('7');
	});

	it('keeps the profile on the page when the browser blocks storage', async () => {
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('blocked', 'SecurityError');
		});
		render(Page);
		await userEvent.type(await staffField(), '19');
		expect(screen.getByRole('status').textContent).toBe(
			'Kept on this page only. This browser blocks storage, so the profile lasts only while this page is open. Export the file to keep it.'
		);
	});
});

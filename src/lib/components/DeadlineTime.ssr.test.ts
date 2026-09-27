import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { formatDeadline } from '../core/deadline';
import DeadlineTime from './DeadlineTime.svelte';

// The node project compiles components for the server, which the jsdom project cannot, so the
// server half of the hydration contract is held here and the client half in the jsdom test.
describe('DeadlineTime on the server', () => {
	it('renders the Central European label inside a time element carrying the full instant', () => {
		const instant = '2026-10-06T10:00:00+02:00';
		const { body } = render(DeadlineTime, {
			props: { instant, visitorTimeZone: 'America/New_York' }
		});
		const label = formatDeadline(instant, 'Europe/Amsterdam');
		expect(label).toBe('6 Oct 2026, 10:00 CEST');
		expect(body).toMatch(
			/<time\b[^>]*\bdatetime="2026-10-06T10:00:00\+02:00"[^>]*>6 Oct 2026, 10:00 CEST<\/time>/
		);
		expect(body).not.toContain('EDT');
	});

	it('names CET after the clocks go back', () => {
		const { body } = render(DeadlineTime, { props: { instant: '2026-10-25T01:00:00Z' } });
		expect(body).toContain('>25 Oct 2026, 02:00 CET</time>');
	});
});

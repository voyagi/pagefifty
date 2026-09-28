import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVER_TIME_ZONE, formatDeadline } from '$lib/core/deadline';
import DeadlineTime from './DeadlineTime.svelte';

const INSTANT = '2026-10-06T10:00:00+02:00';

function timeElement(container: HTMLElement): HTMLTimeElement {
	const found = container.querySelector('time');
	if (!found) throw new Error('DeadlineTime rendered no time element');
	return found;
}

// A text change is recorded with the text it replaced, so the label the first client render
// wrote is still readable after the visitor zone has replaced it.
function watchText() {
	const observer = new MutationObserver(() => {});
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		characterData: true,
		characterDataOldValue: true
	});
	return observer;
}

let observer: MutationObserver | undefined;

afterEach(() => {
	observer?.disconnect();
	observer = undefined;
});

describe('DeadlineTime', () => {
	it('re-renders in the visitor zone after mount, with that zone named', () => {
		const { container } = render(DeadlineTime, {
			props: { instant: INSTANT, visitorTimeZone: 'America/New_York' }
		});
		flushSync();
		const time = timeElement(container);
		expect(time.textContent).toBe('6 Oct 2026, 04:00 EDT');
		expect(time.textContent).toBe(formatDeadline(INSTANT, 'America/New_York'));
		expect(time.getAttribute('datetime')).toBe(INSTANT);
	});

	it('writes the Central European label first, as the server does, then the visitor zone', () => {
		observer = watchText();
		const { container } = render(DeadlineTime, {
			props: { instant: INSTANT, visitorTimeZone: 'America/New_York' }
		});
		flushSync();
		const replaced = observer
			.takeRecords()
			.filter((record) => record.type === 'characterData')
			.map((record) => record.oldValue);
		expect(replaced).toEqual([formatDeadline(INSTANT, SERVER_TIME_ZONE)]);
		expect(timeElement(container).textContent).toBe('6 Oct 2026, 04:00 EDT');
	});

	it("uses the browser's own zone when no visitor zone is given", () => {
		const { container } = render(DeadlineTime, { props: { instant: INSTANT } });
		flushSync();
		const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
		expect(timeElement(container).textContent).toBe(formatDeadline(INSTANT, zone));
	});

	// A list shows one label per card; building a default formatter per card only to read the zone
	// cost 24 ms over 363 cards (ritual p8), so the zone is read once for the page.
	it('reads the browser zone once however many labels a page shows', () => {
		const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
		let defaults = 0;
		const counting = new Proxy(Intl.DateTimeFormat, {
			construct(target, args) {
				if (args.length === 0) defaults += 1;
				return Reflect.construct(target, args);
			}
		});
		vi.stubGlobal('Intl', Object.create(Intl, { DateTimeFormat: { value: counting } }));
		try {
			const containers = Array.from(
				{ length: 20 },
				() => render(DeadlineTime, { props: { instant: INSTANT } }).container
			);
			flushSync();
			for (const container of containers) {
				expect(timeElement(container).textContent).toBe(formatDeadline(INSTANT, zone));
			}
			expect(defaults).toBeLessThanOrEqual(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('keeps the Central European label when the browser reports a zone Intl refuses', () => {
		const { container } = render(DeadlineTime, {
			props: { instant: INSTANT, visitorTimeZone: 'Etc/Unknown' }
		});
		flushSync();
		expect(timeElement(container).textContent).toBe(formatDeadline(INSTANT, SERVER_TIME_ZONE));
	});

	it('follows a new instant', async () => {
		const { container, rerender } = render(DeadlineTime, {
			props: { instant: INSTANT, visitorTimeZone: 'Europe/Amsterdam' }
		});
		await rerender({ instant: '2026-10-25T01:00:00Z', visitorTimeZone: 'Europe/Amsterdam' });
		const time = timeElement(container);
		expect(time.textContent).toBe('25 Oct 2026, 02:00 CET');
		expect(time.getAttribute('datetime')).toBe('2026-10-25T01:00:00Z');
	});

	it('sets its text in the Mono evidence face and no style attribute', () => {
		const { container } = render(DeadlineTime, {
			props: { instant: INSTANT, visitorTimeZone: 'Europe/Amsterdam' }
		});
		const time = timeElement(container);
		expect(time.classList.contains('mono')).toBe(true);
		expect(time.hasAttribute('style')).toBe(false);
	});
});

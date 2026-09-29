import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DeskBar from './DeskBar.svelte';

// The node project compiles components for the server, which the jsdom project cannot, so the
// server half of the firm slot (nothing read from storage, the height kept) is held here.
function slotMarkup(path: string): string {
	const { body } = render(DeskBar, { props: { path } });
	const match = /<(div|a)\b[^>]*data-firm-slot[^>]*>[\s\S]*?<\/\1>/.exec(body);
	if (!match) throw new Error(`no firm slot in the server render of ${path}`);
	return match[0];
}

describe('the firm slot on the server', () => {
	it('renders empty outside the example, as a box with the reserved height and no link', () => {
		const slot = slotMarkup('/tenders');
		expect(slot).toMatch(/^<div\b[^>]*class="firm\b/);
		expect(slot.replace(/<[^>]+>/g, '').trim()).toBe('');
		expect(slot).not.toContain('href');
	});

	it('renders the demo label on an example page, as the link to the profile', () => {
		const slot = slotMarkup('/example');
		expect(slot).toMatch(/^<a\b[^>]*href="\/profile"/);
		expect(slot).toContain('Brink Data (demo firm)');
		expect(slot).toContain('Invented figures');
	});
});

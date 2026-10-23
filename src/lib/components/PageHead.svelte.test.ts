import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PageHead, { SITE_DESCRIPTION } from './PageHead.svelte';

const content = (selector: string) =>
	[...document.head.querySelectorAll(selector)].map((each) => each.getAttribute('content'));

describe('PageHead', () => {
	it('gives the title and description to the tab, to search and to Open Graph alike', () => {
		render(PageHead, { props: { title: 'Privacy - Pagefifty', description: 'What is stored.' } });
		expect(document.title).toBe('Privacy - Pagefifty');
		expect(content('meta[name="description"]')).toEqual(['What is stored.']);
		expect(content('meta[property="og:title"]')).toEqual(['Privacy - Pagefifty']);
		expect(content('meta[property="og:description"]')).toEqual(['What is stored.']);
		expect(content('meta[property="og:type"]')).toEqual(['website']);
		expect(content('meta[property="og:site_name"]')).toEqual(['Pagefifty']);
	});

	it("uses the site's description for a page that has none of its own", () => {
		render(PageHead, { props: { title: 'Firm profile - Pagefifty' } });
		expect(content('meta[name="description"]')).toEqual([SITE_DESCRIPTION]);
		expect(content('meta[property="og:description"]')).toEqual([SITE_DESCRIPTION]);
	});
});

// A page that wrote its own <title> would carry no Open Graph tags, so every route page and the
// error page set their head through PageHead and nowhere else.
describe('route heads', () => {
	const ROUTES = join('src', 'routes');
	const files = readdirSync(ROUTES, { recursive: true, encoding: 'utf8' }).map((file) =>
		file.replaceAll('\\', '/')
	);
	const pages = files.filter((file) => /(^|\/)\+(page|error)\.svelte$/.test(file));
	const layouts = files.filter((file) => /(^|\/)\+layout\.svelte$/.test(file));

	it('finds every page, the tender records and the error page among them', () => {
		expect(pages).toEqual(
			expect.arrayContaining([
				'+page.svelte',
				'+error.svelte',
				'tenders/[notice]/+page.svelte',
				'example/[notice]/+page.svelte'
			])
		);
		expect(pages).toHaveLength(9);
	});

	it.each(pages)('%s sets its head through PageHead alone', (file) => {
		const source = readFileSync(join(ROUTES, file), 'utf8');
		expect(source).toMatch(/<PageHead\b/);
		expect(source).not.toMatch(/<svelte:head>|<title\b/);
	});

	// A layout's head is added to every page under it, so a title, a description or an Open Graph tag
	// there would give those pages two. The root layout's head holds the icon and the font preload.
	it('finds the root layout among the layouts', () => {
		expect(layouts).toContain('+layout.svelte');
	});

	it.each(layouts)('%s writes no title, description or Open Graph tag', (file) => {
		const source = readFileSync(join(ROUTES, file), 'utf8');
		expect(source).not.toMatch(/<title\b|name="description"|property="og:/);
	});
});

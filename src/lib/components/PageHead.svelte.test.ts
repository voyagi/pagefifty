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

// The link preview picture is the same on every page, so src/app.html carries its tags and no
// component does: PageHead writing them as well would give every page two of each.
describe('the link preview picture', () => {
	const APP_HTML = readFileSync(join('src', 'app.html'), 'utf8');
	const tags = new Map(
		[...APP_HTML.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g)].map(
			([, key, value]) => [key, value]
		)
	);

	it('names the picture by its full address on the live site, its size and what it shows, as a large card', () => {
		expect(tags.get('og:image')).toBe('https://pagefifty.atfyigtaran.workers.dev/link-preview.png');
		expect(tags.get('og:image:width')).toBe('1200');
		expect(tags.get('og:image:height')).toBe('630');
		expect(tags.get('og:image:alt')).toContain('713597-2026');
		expect(tags.get('twitter:card')).toBe('summary_large_image');
	});

	// The tags promise a picture of a given size, so the file the site serves at that path must exist
	// and be that size. A PNG states its width and height in its first chunk, bytes 16 to 23.
	it('serves a PNG of the stated size at the stated path', () => {
		const path = new URL(tags.get('og:image') ?? 'https://invalid/').pathname;
		const png = readFileSync(join('static', path));
		expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
		expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
			Number(tags.get('og:image:width')),
			Number(tags.get('og:image:height'))
		]);
	});

	it('is left out of PageHead, so no page carries it twice', () => {
		render(PageHead, { props: { title: 'Pagefifty' } });
		expect(document.head.querySelectorAll('meta[property^="og:image"]')).toHaveLength(0);
		expect(document.head.querySelectorAll('meta[name^="twitter:"]')).toHaveLength(0);
	});
});

import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PageHead from './PageHead.svelte';

// A tender title is the buyer's own text, put into an attribute on the server, so a quote or an angle
// bracket in it must stay inside the content attribute of the tag it belongs to.
const TITLE = 'Lot "A" <b>Rahmenvertrag</b> & Co\'s "DOMEA" - Pagefifty';
const DESCRIPTION = 'Kriterien "laut" <Bekanntmachung> & Unterlagen';

const ENTITIES: Readonly<Record<string, string>> = {
	'&quot;': '"',
	'&#34;': '"',
	'&#39;': "'",
	'&lt;': '<',
	'&gt;': '>',
	'&amp;': '&'
};
const decode = (text: string) =>
	text.replace(/&(?:quot|#34|#39|lt|gt|amp);/g, (entity) => ENTITIES[entity]);

describe('PageHead on the server', () => {
	const { head } = render(PageHead, { props: { title: TITLE, description: DESCRIPTION } });
	// A ">" may stand raw inside a quoted attribute, so a tag ends at the first ">" outside quotes.
	const metas = [...head.matchAll(/<meta\s((?:[^>"]|"[^"]*")*)>/g)].map(([, attributes]) =>
		Object.fromEntries(
			[...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [
				name,
				decode(value)
			])
		)
	);

	it('writes exactly the five tags, with no tag of the title breaking out of its attribute', () => {
		expect(metas.map((meta) => meta.name ?? meta.property)).toEqual([
			'description',
			'og:type',
			'og:site_name',
			'og:title',
			'og:description'
		]);
		expect(head).not.toContain('<b>');
		expect(head).not.toContain('<Bekanntmachung>');
	});

	it('gives the title and description back exactly as written', () => {
		const content = (key: string) =>
			metas.find((meta) => meta.name === key || meta.property === key)?.content;
		expect(content('og:title')).toBe(TITLE);
		expect(content('og:description')).toBe(DESCRIPTION);
		expect(content('description')).toBe(DESCRIPTION);
		expect(decode(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')).toBe(TITLE);
	});

	// The likeliest attack through a buyer's title: close the title element and open a script.
	it('keeps a title that closes its own tag as text, with no script in the head', () => {
		const hostile = 'Lot </title><script>alert(1)</script> - Pagefifty';
		const rendered = render(PageHead, { props: { title: hostile } }).head;
		expect(rendered.match(/<title>/g)).toHaveLength(1);
		expect(rendered).not.toContain('<script');
		expect(decode(rendered.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')).toBe(hostile);
	});
});

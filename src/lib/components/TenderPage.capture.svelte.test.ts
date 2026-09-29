import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { CAPTURE_ID } from '../../test/fixtures/roles';
import { NoticeRecordSchema } from '$lib/snapshot/index-row';
import { buildTenderPage } from '$lib/tenders/tender-page';
import TenderPage from './TenderPage.svelte';

// Every tender page the capture can serve, rendered once: the ids a page carries, the labels that
// point at them, its links and its own words must hold on every notice, not only on the fixtures.
const folder = join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID, 'records');
const records = readdirSync(folder).map((file) =>
	NoticeRecordSchema.parse(JSON.parse(readFileSync(join(folder, file), 'utf8')))
);
const NOW = new Date('2026-10-06T08:30:00Z');
const CAPTURE = {
	capturedOn: '15 Sep 2026',
	fetchedAt: '2026-09-15T19:50:49.157Z',
	firstPublished: '1 Sep 2026'
};

// Words that only reach a page when a value was printed that should never have been.
const LEAKED = /\bundefined\b|\bNaN\b|\[object Object\]|native code|\bnull\b/;

function problemsOf(container: HTMLElement): string[] {
	const problems: string[] = [];
	const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
	const known = new Set(ids);
	for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
		problems.push(`id ${id} twice`);
	}
	for (const node of container.querySelectorAll('[aria-labelledby],[aria-describedby]')) {
		const named = `${node.getAttribute('aria-labelledby') ?? ''} ${node.getAttribute('aria-describedby') ?? ''}`;
		for (const id of named.split(/\s+/).filter(Boolean)) {
			if (!known.has(id)) problems.push(`label points at missing ${id}`);
		}
	}
	for (const link of container.querySelectorAll('a')) {
		const href = link.getAttribute('href') ?? '';
		if (href.startsWith('#')) {
			if (!known.has(href.slice(1))) problems.push(`link to missing ${href}`);
		} else if (!/^(https?:\/\/|\/)/.test(href)) {
			problems.push(`link to "${href}"`);
		}
		if ((link.textContent ?? '').trim() === '') problems.push(`link to ${href} has no text`);
	}
	for (const node of container.querySelectorAll('[lang]')) {
		const lang = node.getAttribute('lang') ?? '';
		try {
			if (Intl.getCanonicalLocales(lang).length !== 1) problems.push(`lang "${lang}"`);
		} catch {
			problems.push(`lang "${lang}"`);
		}
	}
	// Each text node on its own: textContent glues neighbouring elements together ("Deadline" then
	// "undefined" reads "Deadlineundefined"), which no word boundary can see.
	const own = container.cloneNode(true) as HTMLElement;
	own.querySelectorAll('[data-notice-text]').forEach((node) => node.remove());
	const walker = document.createTreeWalker(own, NodeFilter.SHOW_TEXT);
	const texts: string[] = [];
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		texts.push(node.textContent ?? '');
	}
	const leaked = LEAKED.exec(texts.join(' '));
	if (leaked) problems.push(`page copy prints "${leaked[0]}"`);
	return problems;
}

describe(`TenderPage over every notice of the ${CAPTURE_ID} capture`, () => {
	// The control: a page built to break every rule must be named for each break, or the clean
	// result below proves nothing.
	it('names each problem on a page built to have them', () => {
		const page = document.createElement('div');
		page.innerHTML =
			'<p id="a"></p><p id="a" aria-labelledby="gone"></p><a href="#nowhere">x</a>' +
			'<a href="javascript:void(0)">y</a><a href="/t"></a><span lang="">z</span><p>undefined</p>';
		expect(problemsOf(page)).toEqual([
			'id a twice',
			'label points at missing gone',
			'link to missing #nowhere',
			'link to "javascript:void(0)"',
			'link to /t has no text',
			'lang ""',
			'page copy prints "undefined"'
		]);
	});

	it('renders each page with unique ids, labels and links that resolve, and no leaked value', () => {
		expect(records.length).toBeGreaterThan(300);
		const problems: string[] = [];
		for (const record of records) {
			const tender = buildTenderPage(record, NOW);
			const { container, unmount } = render(TenderPage, {
				props: { data: { tender, capture: CAPTURE } }
			});
			for (const problem of problemsOf(container)) {
				problems.push(`${record.noticeNumber}: ${problem}`);
			}
			unmount();
		}
		expect(problems).toEqual([]);
	});
});

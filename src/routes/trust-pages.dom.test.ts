import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	page: { status: 200, error: null as App.Error | null, url: new URL('http://127.0.0.1/') }
}));
vi.mock('$app/state', () => state);

const { default: Layout } = await import('./+layout.svelte');
const { default: PrivacyPage, PROFILE_STAYS } = await import('./privacy/+page.svelte');

const TRUST_LINKS = [
	['Privacy', '/privacy'],
	['How the AI is used', '/ai']
];

const RUN = {
	model: 'example-org/model-under-test-7b',
	provider: 'Nebius Token Factory',
	region: 'eu-test-9',
	thinking: false,
	runDate: '2026-11-02',
	prices: { inputUsdPerMillion: '0.30', outputUsdPerMillion: '0.90', listedOn: '2026-10-15' },
	lots: { withCriteria: 3, read: 2, reused: 0, notRead: 1 },
	sends: 2,
	tokens: { input: 1000, output: 900, reasoning: 0 },
	costUsd: '0.001110',
	quotes: { verified: 7, rejected: 1 }
};

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function renderPrivacy(providers: string[] = ['Nebius Token Factory']) {
	render(PrivacyPage, { props: { data: { capture: '2026-11-02', run: RUN, providers } as never } });
	return squash(document.querySelector('main')?.textContent);
}

// The sentences of the page's paragraphs, each paragraph read on its own so text from two blocks
// never runs together into one sentence.
const sentencesOf = () =>
	[...document.querySelectorAll('main p')].flatMap((paragraph) =>
		squash(paragraph.textContent).split(/(?<=\.)\s+/)
	);

describe('the privacy page', () => {
	it('the privacy page names each processing step with its provider', () => {
		const body = renderPrivacy();
		for (const sentence of [
			'Cloudflare hosts the site and serves its pages from its network.',
			'As data processor under its privacy policy, Cloudflare receives the technical data of each request, such as your IP address.',
			"At capture time only, on the maintainer's machine and never during your visit, the public criteria text of each read lot is sent to Nebius Token Factory.",
			'The site sets no cookie and runs no analytics, and your browser loads its scripts, fonts and images from this site only.',
			...PROFILE_STAYS
		]) {
			expect(body).toContain(sentence);
		}
		expect(document.querySelector('[data-fact="region"]')?.textContent).toBe(RUN.region);
		expect(
			screen
				.getByRole('link', { name: /issue page of the Pagefifty repository/ })
				.getAttribute('href')
		).toBe('https://github.com/voyagi/pagefifty/issues');
		// A visit reaches Cloudflare with its IP address, so a sentence that says no personal data
		// leaves must be about what is sent to the model or search provider, never about a visit.
		const noPersonalData = sentencesOf().filter((sentence) =>
			/\bno\b[^.]*personal data|personal data[^.]*\b(never|not)\b/i.test(sentence)
		);
		expect(noPersonalData.length).toBeGreaterThan(0);
		for (const sentence of noPersonalData) {
			expect(sentence).toMatch(/model|search provider/);
			expect(sentence).not.toMatch(/visit|browse|this site/i);
		}
	});

	it('keeps the sentences that say the profile stays in this browser as written', () => {
		expect(PROFILE_STAYS).toEqual([
			'The firm profile you enter is kept in this browser only, in its local storage, and is never sent to a server.',
			'Your theme choice, and whether the demo firm is shown, are kept in this browser the same way.',
			'No firm profile, contact or personal data is sent to the model or the search provider.'
		]);
	});

	it('the privacy page says how the stored profile is removed', () => {
		const body = renderPrivacy();
		expect(body).toContain(
			'On the firm profile page, Remove the stored profile deletes it from this browser after you confirm.'
		);
		expect(body).toContain(
			"Your browser's own setting for clearing site data removes it too, with everything else this site stored in the browser."
		);
		expect(body).toContain(
			'A profile file you exported and keep elsewhere is your own copy, and nothing here removes it.'
		);
		expect(screen.getByRole('link', { name: 'Open the firm profile' }).getAttribute('href')).toBe(
			'/profile'
		);
	});
});

describe('the site footer', () => {
	beforeEach(() => {
		// jsdom has no matchMedia, and the theme switch in the top band asks it for the OS scheme.
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// The error page renders inside the root layout, so a 404 reaches the footer through the same
	// layout; a footer the layout drew only for a page that answered would be caught by its status.
	it.each([
		['the entry page', '/', 200],
		['the tenders list', '/tenders', 200],
		['the profile page', '/profile', 200],
		['the error page', '/no-such-page', 404]
	])('every page carries the trust page links in its footer: %s', (_label, path, status) => {
		state.page.url = new URL(`http://127.0.0.1${path}`);
		state.page.status = status;
		const children = createRawSnippet(() => ({ render: () => '<p>inner page</p>' }));
		render(Layout, { props: { children } });
		const footer = screen.getByRole('contentinfo');
		expect(
			screen.getByText('inner page').compareDocumentPosition(footer) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		const links = within(footer)
			.queryAllByRole('link')
			.map((link) => [link.textContent?.trim(), link.getAttribute('href')]);
		expect(links).toEqual(TRUST_LINKS);
	});
});

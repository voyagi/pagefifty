import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureDay, SnapshotIndexSchema } from '$lib/snapshot/index-row';
import { CAPTURE_ID } from '../test/fixtures/roles';

const state = vi.hoisted(() => ({
	page: {
		status: 404,
		error: { message: 'Not Found' } as App.Error | null,
		url: new URL('http://127.0.0.1/no-such-page')
	}
}));
vi.mock('$app/state', () => state);

const { default: ErrorPage } = await import('./+error.svelte');

function at(status: number, path: string, error: App.Error | null) {
	state.page.status = status;
	state.page.url = new URL(`http://127.0.0.1${path}`);
	state.page.error = error;
}

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const hrefs = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'));

describe('error page', () => {
	beforeEach(() => at(404, '/no-such-page', { message: 'Not Found' }));

	it('answers an unknown path with its own heading, the path echoed and a way to the tenders', () => {
		const { container } = render(ErrorPage);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('No page at this address');
		expect(document.title).toBe('Page not found - Pagefifty');
		expect(container.querySelector('.path')?.textContent).toBe('/no-such-page');
		expect(screen.getByRole('link', { name: 'Browse open tenders' }).getAttribute('href')).toBe(
			'/tenders'
		);
		expect(document.getElementById('main')?.tagName).toBe('MAIN');
	});

	it('labels its slate tab with the status code', () => {
		const { container } = render(ErrorPage);
		expect(container.querySelector('main')?.classList.contains('board-slate')).toBe(true);
		const tab = container.querySelector('a.tab');
		expect(squash(tab?.textContent)).toBe('404');
		expect(tab?.getAttribute('aria-current')).toBe('true');
	});

	it('echoes a path as text, never as markup', () => {
		at(404, '/<b>bold</b>', { message: 'Not Found' });
		const { container } = render(ErrorPage);
		expect(state.page.url.pathname).toBe('/%3Cb%3Ebold%3C/b%3E');
		expect(container.querySelector('.path b')).toBeNull();
		expect(container.querySelector('.path')?.textContent).toBe('/<b>bold</b>');
	});

	it('echoes the letters a visitor typed, not their percent escapes', () => {
		at(404, '/tenders/überblick', { message: 'Not Found' });
		const { container } = render(ErrorPage);
		expect(state.page.url.pathname).toBe('/tenders/%C3%BCberblick');
		expect(container.querySelector('.path')?.textContent).toBe('/tenders/überblick');
	});

	// Letters come back, but an escape that stands for a slash, a question mark, a hash or a percent
	// sign stays one, as the router read it: decoded, each would name a different address.
	it('keeps the escapes that would change the address the visitor asked for', () => {
		at(404, '/a%2Fb/x%3Fy/%23top/rate%25/%C3%BCber', { message: 'Not Found' });
		const { container } = render(ErrorPage);
		expect(container.querySelector('.path')?.textContent).toBe('/a%2Fb/x%3Fy/%23top/rate%25/über');
	});

	// The built Worker answers a malformed escape with 400 before any route runs (measured at ritual
	// p5), so that is the status this echo meets.
	it('keeps a malformed escape as sent', () => {
		at(400, '/broken%E0%A4%A', { message: 'Bad Request' });
		const { container } = render(ErrorPage);
		expect(container.querySelector('.path')?.textContent).toBe('/broken%E0%A4%A');
	});

	// A lone % answers 400 and a browser form posted to a page with no form actions answers 405 on
	// the built Worker: the request is at fault, so a reload would only repeat it.
	it.each([
		[400, '/100%'],
		[405, '/'],
		[403, '/tenders']
	])('answers a %i as a request it cannot answer, never as a server fault', (status, path) => {
		at(status, path, { message: 'Refused' });
		const { container } = render(ErrorPage);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'This request could not be answered'
		);
		expect(document.title).toBe('Request not answered - Pagefifty');
		expect(squash(document.querySelector('.lede')?.textContent)).toBe(
			'The address, or the way it was sent, is not one this site can answer, so reloading will not help. Check the address for a typo, or go back to the open tenders.'
		);
		expect(container.querySelector('.path')?.textContent).toBe(path);
		expect(squash(document.querySelector('a.tab')?.textContent)).toBe(String(status));
		expect(document.body.textContent).not.toContain('Reload in a minute');
		expect(screen.getByRole('link', { name: 'Browse open tenders' }).getAttribute('href')).toBe(
			'/tenders'
		);
	});

	it.each([
		['kind without a notice', { message: 'Not Found', kind: 'unknown-notice' } as App.Error],
		['an empty notice', { message: 'Not Found', kind: 'unknown-notice', notice: '' } as App.Error]
	])('reads an unknown-notice error with %s as a plain unknown path', (_, error) => {
		at(404, '/tenders/x', error);
		const { container } = render(ErrorPage);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('No page at this address');
		expect(container.querySelector('.path')?.textContent).toBe('/tenders/x');
	});

	it('shows control and direction characters as the replacement mark', () => {
		at(404, '/a%E2%80%AEb%0Ac', { message: 'Not Found' });
		const { container } = render(ErrorPage);
		const mark = String.fromCodePoint(0xfffd);
		expect(container.querySelector('.path')?.textContent).toBe(`/a${mark}b${mark}c`);
	});

	it('names an unknown notice and the snapshot, and leads to the tenders off the example', () => {
		at(404, '/tenders/999999-2026', {
			message: 'Not Found',
			kind: 'unknown-notice',
			notice: '999999-2026'
		});
		render(ErrorPage);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'No tender with this notice number'
		);
		expect(squash(document.querySelector('.lede')?.textContent)).toBe(
			'Notice 999999-2026 is not in the 15 Sep 2026 snapshot. It may be outside the IT, Netherlands, Belgium and Germany scope, published before 1 Sep 2026 or after the capture, or not a call for tenders TED listed as active that day.'
		);
		expect(hrefs()).toContain('/tenders');
		expect(hrefs().some((href) => href?.startsWith('/example'))).toBe(false);
	});

	// The copy writes both days out; a new capture must fail here rather than leave the page naming
	// the old snapshot or the old publication window.
	it('names the capture day and the first publication day the built index records', () => {
		const index = SnapshotIndexSchema.parse(
			JSON.parse(
				readFileSync(join('src', 'lib', 'snapshot', 'generated', CAPTURE_ID, 'index.json'), 'utf8')
			)
		);
		const from = /publication-date>=(\d{4})(\d{2})(\d{2})/.exec(index.capture.query);
		if (!from)
			throw new Error(`the capture query names no first publication day: ${index.capture.query}`);
		at(404, '/tenders/999999-2026', {
			message: 'Not Found',
			kind: 'unknown-notice',
			notice: '999999-2026'
		});
		render(ErrorPage);
		const lede = squash(document.querySelector('.lede')?.textContent);
		expect(lede).toContain(`not in the ${captureDay(index.capture.fetchedAt)} snapshot`);
		expect(lede).toContain(
			`published before ${captureDay(`${from[1]}-${from[2]}-${from[3]}T12:00:00Z`)} or after the capture,`
		);
		// Only calls for tenders are in the capture (the query's notice type), and only those TED
		// listed as active (scope ACTIVE, recorded in examples/2026-09-15/README.md): 10 notices of
		// the same query were in scope and window but no longer active (spike 001, 373 against 363).
		expect(index.capture.query).toContain('notice-type=cn-standard');
		expect(lede).toContain('not a call for tenders TED listed as active that day.');
	});

	it('shows control and direction characters in an unknown notice as the replacement mark', () => {
		at(404, '/tenders/x', {
			message: 'Not Found',
			kind: 'unknown-notice',
			notice: `12${String.fromCodePoint(0x202e)}34${String.fromCodePoint(0x0a)}-2026`
		});
		render(ErrorPage);
		const mark = String.fromCodePoint(0xfffd);
		expect(document.querySelector('.lede .echo')?.textContent).toBe(`12${mark}34${mark}-2026`);
	});

	it('offers the way back to the example run first on an example route', () => {
		at(404, '/example/999999-2026', {
			message: 'Not Found',
			kind: 'unknown-notice',
			notice: '999999-2026'
		});
		const { container } = render(ErrorPage);
		const actions = [...container.querySelectorAll('.actions a')].map((link) => [
			link.textContent,
			link.getAttribute('href'),
			link.classList.contains('primary')
		]);
		expect(actions).toEqual([
			['Back to the example run', '/example', true],
			['Browse open tenders', '/tenders', false]
		]);
	});

	it('does not treat a path that only starts with the letters of example as the example', () => {
		at(404, '/examples/1', { message: 'Not Found', kind: 'unknown-notice', notice: '1' });
		render(ErrorPage);
		expect(hrefs().some((href) => href?.startsWith('/example'))).toBe(false);
	});

	// Both / and /tenders read the one index, so on the list's own address the error cannot point
	// to the list as the thing that may still work.
	it('on the list itself, a server error never says the list may still work', () => {
		at(500, '/tenders', { message: 'Internal Error' });
		render(ErrorPage);
		expect(squash(document.querySelector('.lede')?.textContent)).toBe(
			'The server hit an error while building this page. Reload in a minute.'
		);
	});

	it('anywhere else, a server error of any 5xx status points to the list', () => {
		at(503, '/profile', { message: 'Internal Error' });
		render(ErrorPage);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'This page could not be built'
		);
		expect(squash(document.querySelector('.lede')?.textContent)).toBe(
			'The server hit an error while building this page. Reload in a minute. If it keeps happening, the list of open tenders may still work.'
		);
	});

	it('shows a server error as a page that could not be built, never the server message', () => {
		at(500, '/tenders', { message: 'the 2026-09-15 index does not match its schema' });
		render(ErrorPage);
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'This page could not be built'
		);
		expect(document.title).toBe('This page could not be built - Pagefifty');
		expect(document.body.textContent).not.toContain('schema');
		expect(squash(document.querySelector('a.tab')?.textContent)).toBe('500');
		expect(screen.getByRole('link', { name: 'Browse open tenders' }).getAttribute('href')).toBe(
			'/tenders'
		);
	});
});

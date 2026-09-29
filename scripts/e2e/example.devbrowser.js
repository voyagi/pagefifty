// example.devbrowser.js - the example run on the built Worker: the 2026-09-15 capture replayed at
// its own capture instant, labelled for the demo firm without touching the active firm, its filter
// and title links kept under /example, and a real 404 that leads back to the example.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-example';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

// Links are matched by the address they resolve to: the server writes relative hrefs and the
// started app rewrites them, so the attribute text depends on whether hydration has finished.
function readPage() {
	return page.evaluate(() => {
		const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
		const path = (link) => new URL(link.href).pathname;
		const form = document.querySelector('form[role="search"]');
		return {
			h1: text(document.querySelector('h1')),
			title: document.title,
			capture: text(document.querySelector('.capture .mono')),
			firm: text(document.querySelector('[data-firm-slot] strong')),
			firmPath: (() => {
				const slot = document.querySelector('[data-firm-slot]');
				return slot && slot.href ? path(slot) : null;
			})(),
			active: localStorage.getItem('pagefifty-active-firm'),
			nav: Array.from(document.querySelectorAll('nav[aria-label="Main"] a')).map((link) => [
				text(link),
				path(link),
				link.getAttribute('aria-current')
			]),
			rowLinks: Array.from(document.querySelectorAll('#open tr[data-notice] a.t')).map(path),
			openRows: document.querySelectorAll('#open tr[data-notice]').length,
			countries: Array.from(
				document.querySelectorAll('tr[data-notice] td[data-label="Country"]')
			).map(text),
			closedSummary: text(document.querySelector('#closed summary')),
			formAction: form ? new URL(form.action).pathname : null,
			footnote: text(document.querySelector('.demo-note')),
			tab: text(document.querySelector('a.tab[aria-current="true"]')),
			backLinks: Array.from(document.querySelectorAll('main a[href]'))
				.filter((link) => text(link) === 'Back to the example run')
				.map(path),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});
}

const CAPTURE = 'Captured from TED on 15 Sep 2026 at 21:50 CEST';
const FOOTNOTE =
	'Example run from a snapshot captured on 15 Sep 2026. Brink Data is a demo firm with invented figures. Not legal advice.';

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());
	await page.setViewportSize({ width: 1440, height: 900 });

	const list = await page.goto('http://127.0.0.1:8788/example');
	// The firm slot's store loads after mount; the example label is written by the server, but the
	// storage read that must leave the active firm alone happens after hydration.
	await page.waitForTimeout(1500);
	const shown = await readPage();
	check(
		'/example answers 200 with h1 "Example run" and the capture line with its time',
		list.status() === 200 && shown.h1 === 'Example run' && shown.capture === CAPTURE,
		`status ${list.status()}, h1 "${shown.h1}", capture "${shown.capture}"`
	);
	check(
		'the page title names the snapshot day',
		shown.title === 'Example run, 15 Sep 2026 snapshot - Pagefifty',
		`title "${shown.title}"`
	);
	check(
		'the header names the demo firm while pagefifty-active-firm stays unset or own',
		shown.firm === 'Brink Data (demo firm)' && (shown.active === null || shown.active === 'own'),
		`firm "${shown.firm}", active ${JSON.stringify(shown.active)}`
	);
	check(
		'the list is judged at the capture instant: 350 open, closed summary names the capture time',
		shown.openRows === 350 && shown.closedSummary === 'Closed at the capture time (13)',
		`${shown.openRows} open rows, summary "${shown.closedSummary}"`
	);
	check(
		'every open row links to /example/{notice}',
		shown.rowLinks.length === shown.openRows &&
			shown.rowLinks.every((href) => /^\/example\/\d+-\d{4}$/.test(href)),
		`${shown.rowLinks.length} links, first ${shown.rowLinks[0]}`
	);
	check(
		'the filter form posts to /example and the footnote names the demo firm',
		shown.formAction === '/example' && shown.footnote === FOOTNOTE,
		`action ${shown.formAction}, footnote "${shown.footnote}"`
	);
	check(
		'the nav shows Tenders, Firm profile, Example run in that order, the example as the page',
		JSON.stringify(shown.nav) ===
			JSON.stringify([
				['Tenders', '/tenders', null],
				['Firm profile', '/profile', null],
				['Example run', '/example', 'page']
			]),
		JSON.stringify(shown.nav)
	);
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-1440-top.png');
	await page.evaluate(() => document.querySelector('.demo-note').scrollIntoView());
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-1440-foot.png');

	await page.click('tr[data-notice="609955-2026"] a.t');
	await page.waitForFunction(() => location.pathname === '/example/609955-2026', null, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	const tender = await page.goto('http://127.0.0.1:8788/example/609955-2026');
	await page.waitForTimeout(1000);
	const notice = await readPage();
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-609955-1440.png');
	check(
		'/example/609955-2026, reached from its row, answers 200 on the Example tab with the footnote',
		tender.status() === 200 &&
			notice.tab.startsWith('Example') &&
			notice.footnote === FOOTNOTE &&
			notice.title.endsWith('(609955-2026), example run - Pagefifty'),
		`status ${tender.status()}, tab "${notice.tab}", title "${notice.title}"`
	);
	check(
		'on an example notice the header still names the demo firm and the nav marks the example parent',
		notice.firm === 'Brink Data (demo firm)' &&
			(notice.active === null || notice.active === 'own') &&
			notice.nav[2][2] === 'true',
		`firm "${notice.firm}", active ${JSON.stringify(notice.active)}, nav ${JSON.stringify(notice.nav)}`
	);

	const unknown = await page.goto('http://127.0.0.1:8788/example/000000-0000');
	const missing = await readPage();
	check(
		'/example/000000-0000 answers 404 with "Back to the example run" leading to /example',
		unknown.status() === 404 &&
			missing.h1 === 'No tender with this notice number' &&
			missing.backLinks.length === 1 &&
			missing.backLinks[0] === '/example',
		`status ${unknown.status()}, h1 "${missing.h1}", back links ${JSON.stringify(missing.backLinks)}`
	);

	const filtered = await page.goto('http://127.0.0.1:8788/example?country=NL');
	const dutch = await readPage();
	check(
		'/example?country=NL lists only Netherlands rows',
		filtered.status() === 200 &&
			dutch.countries.length > 0 &&
			dutch.countries.every((country) => country.split(', ').includes('Netherlands')),
		`status ${filtered.status()}, ${dutch.countries.length} rows, ${dutch.countries.filter((c) => !c.includes('Netherlands')).length} without Netherlands`
	);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('http://127.0.0.1:8788/example');
	const phoneList = await readPage();
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-390.png');
	await page.goto('http://127.0.0.1:8788/example/600457-2026');
	const phoneLong = await readPage();
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-600457-390.png');
	check(
		'at 390px neither the example list nor its 17-lot notice scrolls sideways',
		phoneList.overflow <= 0 && phoneLong.overflow <= 0,
		`overflow list ${phoneList.overflow}, 600457-2026 ${phoneLong.overflow}`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'example', checks }));
	await browser.closePage(PAGE);
}

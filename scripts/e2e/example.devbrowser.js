// example.devbrowser.js - the example run on the built Worker: the example capture replayed at its
// own capture instant, labelled for the demo firm without touching the active firm, its filter and
// title links kept under /example, a real 404 that leads back to the example, and the list's
// layout at every width from 320 to 1440 px.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires. The example capture and the
// notices visited on it come from config.example, chosen by scripts/e2e.mjs from the build, so the
// day the final capture becomes the example this driver follows it unchanged.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const example = config.example;
const PAGE = 'pagefifty-e2e-example';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';

// shared-sweep:start. From here to shared-sweep:end, tenders.devbrowser.js and
// example.devbrowser.js carry the same code word for word, because a driver cannot import;
// scripts/e2e.mjs refuses to run when the two copies differ.
//
// The list is one column of rows at every width. Up to 45em (720px at 16px) a list page shows the
// list alone; from 721px the tender the list opens sits in a pane beside it, and the list column
// narrows to min(480px, 42%). Under 40em (640px) the filters fold behind one button.
// Retired with the redesign (PR #79), because the page no longer has what they measured: the switch
// from cards to a five-column table at 1340px with its reading cell floor (no table at any width)
// and the tab-over-header measure (no tab rail). The split switch below takes the first one's place.
const WIDTHS = [320, 390, 640, 641, 720, 721, 768, 1024, 1100, 1200, 1340, 1440];
const SPLIT_FROM = 721;

// Page overflow alone can read 0 while a row runs past the list column, so every row's right edge
// is measured against the column's content box too. Each line of text is measured as well as each
// box, at its own edge: text that cannot wrap runs past its block while the block's own box stays
// inside (75px past a card read as fitting on 2026-10-01), so clipping does not hide it. Left out:
// text that is visually hidden, and a line cut on purpose with an ellipsis (a row's buyer, whose
// whole name is on its tender).
function readGeometry() {
	return page.evaluate(() => {
		const px = (value) => parseFloat(value) || 0;
		const box = (element) => element.getBoundingClientRect();
		const drawn = (rect) => rect.width > 0 || rect.height > 0;
		const range = document.createRange();
		const hiddenOnPurpose = (element) => Boolean(element.closest('.visually-hidden'));
		const ellipsis = (element) => {
			const style = getComputedStyle(element);
			return style.textOverflow === 'ellipsis' && style.overflowX === 'hidden';
		};
		const name = (element) => {
			const classes = Array.from(element.classList).filter((each) => !each.startsWith('svelte-'));
			const row = element.closest('li[data-notice]');
			const tag = element.tagName.toLowerCase() + classes.map((each) => `.${each}`).join('');
			return row ? `${tag} ${row.getAttribute('data-notice')}` : tag;
		};
		const column = document.querySelector('.list-col');
		const columnStyle = column ? getComputedStyle(column) : null;
		const contentRight = column
			? box(column).right - px(columnStyle.borderRightWidth) - px(columnStyle.paddingRight)
			: -Infinity;
		const lists = [];
		for (const id of ['open', 'closed']) {
			const list = document.querySelector(`#${id} ul.rows`);
			if (!list) continue;
			let right = -Infinity;
			let worst = '';
			for (const element of [list, ...list.querySelectorAll('*')]) {
				if (hiddenOnPurpose(element)) continue;
				const rect = box(element);
				if (drawn(rect) && rect.right > right) {
					right = rect.right;
					worst = name(element);
				}
			}
			const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const host = node.parentElement;
				if (!host || !node.data.trim() || hiddenOnPurpose(host) || ellipsis(host)) continue;
				range.selectNodeContents(node);
				const rect = range.getBoundingClientRect();
				if (drawn(rect) && rect.right > right) {
					right = rect.right;
					worst = `text in ${name(host)}`;
				}
			}
			lists.push({ id, right, worst });
		}
		const pane = document.querySelector('.split .pane');
		const paneShown = Boolean(pane) && getComputedStyle(pane).display !== 'none';
		let longest = { text: '', width: 0 };
		for (const time of document.querySelectorAll('ul.rows time')) {
			const width = box(time).width;
			if (width > longest.width) longest = { text: time.textContent.trim(), width };
		}
		return {
			theme: document.documentElement.getAttribute('data-theme'),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			rootPx: px(getComputedStyle(document.documentElement).fontSize),
			contentRight,
			lists,
			paneShown,
			beside: paneShown && Boolean(column) && box(pane).left >= box(column).right - 0.5,
			longest
		};
	});
}

// A list with nothing drawn (hidden by display: none; a closed details still lays its rows out when
// measured) leaves its right edge at -Infinity, which is below any column edge, so a list only fits
// when something was measured.
function fits(read, theme) {
	return (
		read.theme === theme &&
		read.lists.length > 0 &&
		read.overflow <= 0 &&
		read.lists.every((list) => Number.isFinite(list.right) && list.right <= read.contentRight + 0.5)
	);
}

function describe(read) {
	const lists = read.lists
		.map((list) => `${list.id} right ${list.right.toFixed(1)} (${list.worst})`)
		.join(', ');
	const pane = read.paneShown ? (read.beside ? 'pane beside' : 'pane not beside') : 'no pane';
	return `${read.theme}: overflow ${read.overflow}, column edge ${read.contentRight.toFixed(1)}, ${lists || 'no list measured'}, ${pane}`;
}

async function readAtWidths(widths) {
	const before = page.viewportSize() ?? { width: 1280, height: 720 };
	const reads = [];
	for (const width of widths) {
		await page.setViewportSize({ width, height: 900 });
		await page.waitForTimeout(150);
		reads.push(await readGeometry());
	}
	await page.setViewportSize(before);
	return reads;
}

async function openClosedGroup() {
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	await page.evaluate(() => {
		const details = document.querySelector('#closed details');
		if (details) details.open = true;
	});
}

// opensOne says the bare list opens a tender by itself, which it does while any row is open.
function checkSweep(path, light, dark, seconds, opensOne) {
	WIDTHS.forEach((width, i) => {
		const timing = i === 0 ? `, sweep ${seconds.toFixed(1)} s` : '';
		check(
			`at ${width}px ${path} does not scroll sideways and keeps every row inside the list column, in Light and Dark`,
			fits(light[i], 'light') && fits(dark[i], 'dark'),
			`${describe(light[i])} | ${describe(dark[i])}${timing}`
		);
	});
	// Asserted on both themes' reads, so a rule in one theme alone cannot move the switch unseen.
	const placed = (read, width) =>
		opensOne && width >= SPLIT_FROM ? read.paneShown && read.beside : !read.paneShown;
	const seen = (read) => (read.paneShown ? (read.beside ? 'beside' : 'not beside') : 'alone');
	const layouts = WIDTHS.map((width, i) => ({
		right: placed(light[i], width) && placed(dark[i], width),
		text: `${width} light ${seen(light[i])}, dark ${seen(dark[i])}`
	}));
	const wrong = layouts.filter((layout) => !layout.right).map((layout) => layout.text);
	check(
		opensOne
			? `${path} shows the list alone up to ${SPLIT_FROM - 1}px and the tender it opens beside it from ${SPLIT_FROM}px, in Light and Dark`
			: `${path}, with no row open, shows the list alone at every width, in Light and Dark`,
		wrong.length === 0,
		`wrong at ${wrong.join(', ') || 'none'}; read ${layouts.map((layout) => layout.text).join(', ')}`
	);
}
// shared-sweep:end

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
			rowLinks: Array.from(document.querySelectorAll('#open ul.rows > li[data-notice] a.t')).map(
				path
			),
			openRows: document.querySelectorAll('#open ul.rows > li[data-notice]').length,
			// A row's countries are its first fact, written only when the notice names one.
			countries: Array.from(
				document.querySelectorAll('ul.rows > li[data-notice] .facts > .fact:first-child')
			)
				.filter((fact) => !fact.classList.contains('deadline'))
				.map(text),
			closedSummary: text(document.querySelector('#closed summary')),
			closedHeading: text(document.querySelector('#closed-title')),
			closedNote: text(document.querySelector('#closed .note')),
			formAction: form ? new URL(form.action).pathname : null,
			footnote: text(document.querySelector('.demo-note')),
			backLinks: Array.from(document.querySelectorAll('main a[href]'))
				.filter((link) => text(link) === 'Back to the example run')
				.map(path),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});
}

const CAPTURE = `Captured from TED on ${example.capturedOn} at ${example.capturedAt}`;
const FOOTNOTE = `Example run from a snapshot captured on ${example.capturedOn}. Brink Data is a demo firm with invented figures. Not legal advice.`;

// The final capture keeps only tenders open after the 2026-10-30 cutoff, so at its capture instant
// nothing had closed: the closed group then names itself to screen readers alone and says none had.
function closedGroupShows(shown, closed) {
	return closed > 0
		? shown.closedSummary === `Closed at the capture time (${closed})`
		: shown.closedSummary === '' &&
				shown.closedHeading === 'Closed at the capture time' &&
				shown.closedNote === 'No tender in this list had closed at the capture time.';
}

// A notice of the example is reached by its row, as a visitor reaches it, never by a typed number.
// A row closed at the capture instant sits in the folded closed group, which is opened first. The
// landing page is fetched again for the status the server gives its address.
async function followRow(notice) {
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const folded = await page.evaluate(
		(number) =>
			Boolean(
				document.querySelector(`li[data-notice="${number}"]`)?.closest('details:not([open])')
			),
		notice
	);
	if (folded) await page.click('#closed summary');
	await page.click(`li[data-notice="${notice}"] a.t`);
	await page.waitForFunction((path) => location.pathname === path, `/example/${notice}`, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	await page.waitForLoadState('networkidle');
	return page.evaluate(async () => (await fetch(location.href)).status);
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());
	await page.setViewportSize({ width: 1440, height: 900 });

	const list = await page.goto('http://127.0.0.1:8788/example');
	// The firm slot's store loads after mount; the example label is written by the server, but the
	// storage read that must leave the active firm alone happens after hydration. So the app must
	// have started, and the network gone quiet, since the store is fetched as its own script.
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	await page.waitForLoadState('networkidle');
	const shown = await readPage();
	check(
		'/example answers 200 with h1 "Example run" and the capture line with its time',
		list.status() === 200 && shown.h1 === 'Example run' && shown.capture === CAPTURE,
		`status ${list.status()}, h1 "${shown.h1}", capture "${shown.capture}"`
	);
	check(
		'the page title names the snapshot day',
		shown.title === `Example run, ${example.capturedOn} snapshot - Pagefifty`,
		`title "${shown.title}"`
	);
	check(
		'the header names the demo firm while pagefifty-active-firm stays unset or own',
		shown.firm === 'Brink Data (demo firm)' && (shown.active === null || shown.active === 'own'),
		`firm "${shown.firm}", active ${JSON.stringify(shown.active)}`
	);
	check(
		'the list is judged at the capture instant: the open rows and the closed group the build counts, the closed group named against the capture time',
		shown.openRows === example.open && closedGroupShows(shown, example.closed),
		`${shown.openRows} open rows of ${example.open} and ${example.closed} closed in ${example.id}, summary "${shown.closedSummary}", heading "${shown.closedHeading}", note "${shown.closedNote}"`
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

	const documents = example.probes.documents;
	const tenderStatus = await followRow(documents.notice);
	const notice = await readPage();
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-documents-1440.png');
	// The redesign has no tab rail: the nav's Example run link marks where a notice belongs, checked
	// just below.
	check(
		'the documents probe, reached from its row, answers 200 with the footnote and its example title',
		tenderStatus === 200 &&
			notice.footnote === FOOTNOTE &&
			notice.title.endsWith(`(${documents.notice}), example run - Pagefifty`),
		`${documents.notice}: status ${tenderStatus}, title "${notice.title}"`
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

	// Well formed, so the real lookup in the tracked capture runs and misses: the unit test reaches
	// this 404 only through a mocked reader, and the number above never gets past the format check.
	const absent = await page.goto('http://127.0.0.1:8788/example/999991-2099');
	const notHeld = await readPage();
	check(
		'/example/999991-2099, well formed but not in the capture, answers 404 leading back to /example',
		absent.status() === 404 &&
			notHeld.h1 === 'No tender with this notice number' &&
			notHeld.backLinks.length === 1 &&
			notHeld.backLinks[0] === '/example',
		`status ${absent.status()}, h1 "${notHeld.h1}", back links ${JSON.stringify(notHeld.backLinks)}`
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

	// A deadline filter from the cutoff day keeps only tenders open after it, so whichever capture is
	// the example, this list has open rows and no closed one: the state the final capture's whole list
	// shows, held to the page while an earlier capture is still the example.
	const fromCutoff = await page.goto('http://127.0.0.1:8788/example?from=2026-10-30');
	const late = await readPage();
	check(
		'/example?from=2026-10-30 lists open rows only, and its closed group says none had closed at the capture time',
		fromCutoff.status() === 200 && late.openRows > 0 && closedGroupShows(late, 0),
		`status ${fromCutoff.status()}, ${late.openRows} open rows, summary "${late.closedSummary}", heading "${late.closedHeading}", note "${late.closedNote}"`
	);

	const mostLots = example.probes.mostLots;
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('http://127.0.0.1:8788/example');
	const phoneList = await readPage();
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-390.png');
	await followRow(mostLots.notice);
	const phoneLong = await readPage();
	await saveScreenshot(await page.screenshot(), 'pagefifty-example-most-lots-390.png');
	check(
		'at 390px neither the example list nor its notice with the most lots scrolls sideways',
		phoneList.overflow <= 0 && phoneLong.overflow <= 0,
		`overflow list ${phoneList.overflow}, ${mostLots.notice} with ${mostLots.lots} lots ${phoneLong.overflow}`
	);

	const sweepStart = Date.now();
	await page.goto('http://127.0.0.1:8788/example?theme=light');
	await openClosedGroup();
	const light = await readAtWidths(WIDTHS);
	await page.goto('http://127.0.0.1:8788/example?theme=dark');
	await openClosedGroup();
	const dark = await readAtWidths(WIDTHS);
	checkSweep('/example', light, dark, (Date.now() - sweepStart) / 1000, example.open > 0);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'example', checks }));
	await browser.closePage(PAGE);
}

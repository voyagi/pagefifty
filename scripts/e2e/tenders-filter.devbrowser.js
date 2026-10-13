// tenders-filter.devbrowser.js - the GET filter form on the built Worker: the address holds the
// filters, a submitted form and a shared link load the same list, and every empty or refused state
// is named instead of leaving a blank page.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// The run uses the real clock, so no check assumes a notice is open or closed: each one reads the
// groups the page rendered and says how many rows it read.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-tenders-filter';
const BASE = 'http://127.0.0.1:8788/tenders';
const DROPPED = 'Some filter values in the address were not recognised and were ignored.';
// The theme switch marks its pressed button only once the app has started.
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

// With html, the DOM fields come from that markup parsed by DOMParser, where no script runs; the
// address fields always come from the live page. The text-scale meta is dropped before parsing
// because the test browser's renderer hangs parsing it into a document with no frame (a literal
// holding only that meta hung; the served empty state without it parsed), and it holds no link.
function readList(html) {
	return page.evaluate(
		(markup) => {
			const root = markup
				? new DOMParser().parseFromString(
						markup.replace(/<meta name="text-scale"[^>]*>/g, ''),
						'text/html'
					)
				: document;
			const text = (node) => (node ? node.textContent.trim() : '');
			const rowsIn = (selector) =>
				Array.from(root.querySelectorAll(`${selector} tbody tr[data-notice]`)).map((row) => {
					const time = row.querySelector('time');
					return {
						notice: row.getAttribute('data-notice'),
						country: text(row.querySelector('td[data-label="Country"]')),
						datetime: time ? time.getAttribute('datetime') : null
					};
				});
			const clear = Array.from(root.querySelectorAll('a')).filter(
				(link) => link.textContent.trim() === 'Clear filters'
			);
			// Where each link leads, not its raw text: the server writes relative links (./tenders)
			// and the started app rewrites them, so the raw text depends on whether hydration has
			// finished. The search part stays in, so a link that kept a filter does not pass.
			const target = (link) => {
				const address = new URL(link.href);
				return address.pathname + address.search;
			};
			const params = new URLSearchParams(location.search);
			return {
				url: location.href,
				origin: location.origin,
				pathname: location.pathname,
				search: location.search,
				countries: params.getAll('country').join(' '),
				from: params.get('from'),
				to: params.get('to'),
				open: rowsIn('#open'),
				closed: rowsIn('#closed'),
				checked: Array.from(root.querySelectorAll('form[role="search"] input:checked')).map(
					(box) => `${box.name}=${box.value}`
				),
				status: text(root.querySelector('[role="status"]')),
				emptyHeading: text(root.querySelector('#open h2')),
				clearHrefs: clear.map((link) => link.getAttribute('href')),
				clearTargets: clear.map(target),
				closedLeaf: Boolean(root.querySelector('#closed')),
				openTable: Boolean(root.querySelector('#open table')),
				text: root.body ? root.body.textContent.replace(/\s+/g, ' ') : ''
			};
		},
		html === undefined ? null : html
	);
}

const numbers = (rows) => rows.map((row) => row.notice).join(' ');

const clearsToAllTenders = (list) =>
	list.clearTargets.length > 0 && list.clearTargets.every((target) => target === '/tenders');

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	await page.goto(`${BASE}?country=NL&cpv=72`);
	const netherlands = await readList();
	const nlRows = netherlands.open.concat(netherlands.closed);
	const foreign = nlRows.filter((row) => !row.country.split(', ').includes('Netherlands'));
	check(
		'?country=NL&cpv=72 lists only Netherlands rows and shows both chips checked',
		nlRows.length > 0 &&
			foreign.length === 0 &&
			netherlands.checked.join(' ') === 'country=NL cpv=72',
		`${netherlands.open.length} open and ${netherlands.closed.length} closed rows read, ${foreign.length} outside the Netherlands, checked ${netherlands.checked.join(' ')}`
	);

	// Applied once the app has started, so every run takes the path a reader normally does rather
	// than the plain form post a slow start would give.
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	await page.getByRole('checkbox', { name: 'Germany DE' }).check();
	await Promise.all([
		page.waitForURL(/country=DE/, { timeout: 10000 }),
		page.getByRole('button', { name: 'Apply filters' }).click()
	]);
	const submitted = await readList();
	// The address comes from the page, so only its query is reused: the host and path stay the
	// literal BASE, and nothing is opened unless the form stayed on this list.
	const onList = submitted.origin === 'http://127.0.0.1:8788' && submitted.pathname === '/tenders';
	if (onList) await page.goto(`${BASE}${submitted.search}`);
	const shared = onList ? await readList() : { open: [], closed: [] };
	check(
		'ticking Germany and applying makes an address with NL and DE that loads the same rows when opened directly',
		onList &&
			submitted.countries === 'NL DE' &&
			submitted.open.length + submitted.closed.length > nlRows.length &&
			numbers(submitted.open) === numbers(shared.open) &&
			numbers(submitted.closed) === numbers(shared.closed),
		`address ${submitted.url}; submitted ${submitted.open.length} open and ${submitted.closed.length} closed, opened directly ${shared.open.length} open and ${shared.closed.length} closed`
	);
	check(
		'the form sends blank dates as from= and to=, and the page drops nothing for them',
		submitted.from === '' && submitted.to === '' && !submitted.text.includes(DROPPED),
		`from "${submitted.from}", to "${submitted.to}", dropped line ${submitted.text.includes(DROPPED)}`
	);

	await page.goto(`${BASE}?country=XX`);
	const junk = await readList();
	check(
		'?country=XX shows the dropped-values line and still lists rows',
		junk.status === DROPPED && junk.open.length + junk.closed.length === 362,
		`status "${junk.status}", ${junk.open.length} open and ${junk.closed.length} closed rows read`
	);

	await page.goto(`${BASE}?country=BE&from=2027-01-01`);
	const empty = await readList();
	check(
		'?country=BE&from=2027-01-01 shows the named empty state with a Clear filters link to /tenders',
		empty.emptyHeading === 'No tenders match these filters' &&
			empty.text.includes(
				'Nothing in the 15 Sep 2026 snapshot matches Belgium, deadline on or after 1 Jan 2027.'
			) &&
			clearsToAllTenders(empty) &&
			!empty.openTable &&
			!empty.closedLeaf,
		`heading "${empty.emptyHeading}", clear links raw ${JSON.stringify(empty.clearHrefs)} to ${JSON.stringify(empty.clearTargets)}, open table ${empty.openTable}, closed leaf ${empty.closedLeaf}`
	);

	// The served page is what a reader has before hydration, and its './tenders' is exactly the state
	// the live read above can race against, so the same comparison must accept it on every run.
	const servedHtml = await page.evaluate(async () => (await fetch(location.href)).text());
	const served = await readList(servedHtml);
	check(
		'the served empty state, read before any script runs, has Clear filters links that lead to /tenders',
		served.clearHrefs.length > 0 &&
			served.clearHrefs.every((href) => href === './tenders') &&
			clearsToAllTenders(served),
		`${served.clearHrefs.length} links, raw ${JSON.stringify(served.clearHrefs)} to ${JSON.stringify(served.clearTargets)}`
	);

	// Reading exactly the planted target proves the read found the link, so an empty read can never
	// pass this refusal.
	const kept = await readList('<a href="/tenders?country=BE">Clear filters</a>');
	check(
		'a Clear filters link that keeps a query (/tenders?country=BE) does not count as leading to /tenders',
		kept.clearTargets.length === 1 &&
			kept.clearTargets[0] === '/tenders?country=BE' &&
			!clearsToAllTenders(kept),
		`targets ${JSON.stringify(kept.clearTargets)}, counted as /tenders ${clearsToAllTenders(kept)}`
	);

	await page.goto(`${BASE}?from=2026-11-01&to=2026-10-01`);
	const inverted = await readList();
	const swap =
		'The deadline range ends before it starts: 1 Nov 2026 is after 1 Oct 2026. Swap the two dates.';
	check(
		'?from=2026-11-01&to=2026-10-01 says which date is after which',
		inverted.text.includes(swap),
		`message present ${inverted.text.includes(swap)}, heading "${inverted.emptyHeading}"`
	);

	await page.goto(`${BASE}?to=2026-09-23`);
	const past = await readList();
	const lastDay = Date.parse('2026-09-24T00:00:00+02:00');
	const lateRows = past.closed.filter((row) => Date.parse(row.datetime) >= lastDay);
	check(
		'?to=2026-09-23 shows the open zero note above a non-empty closed group',
		past.text.includes('No tender in this list is still open. The closed ones are below.') &&
			!past.openTable &&
			past.open.length === 0 &&
			past.closed.length > 0 &&
			lateRows.length === 0,
		`${past.open.length} open and ${past.closed.length} closed rows read, open table ${past.openTable}, ${lateRows.length} closed rows after 23 Sep 2026`
	);

	// The router keeps the page and its form across a filter navigation, so a chip ticked and a date
	// typed but never applied must not survive Clear filters: the form would then show a filter the
	// list does not apply. Before the app starts the click is a full page load, which clears the
	// form on its own, so the app must have started, and a flag set on the window, which a page
	// load would drop, must still be there afterwards.
	await page.goto(`${BASE}?country=NL&cpv=72`);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	await page.evaluate(() => {
		window.pfSamePage = true;
	});
	await page.getByRole('checkbox', { name: 'Belgium BE' }).check();
	await page.getByLabel('Deadline on or after').fill('2026-10-05');
	// The control: the date really is in the field before the click, so an empty field after it
	// is the clear's doing and never a fill that did not take.
	const typed = await page.evaluate(() => document.getElementById('filter-from').value);
	await Promise.all([
		page.waitForURL(/\/tenders$/, { timeout: 10000 }),
		page.getByRole('link', { name: 'Clear filters' }).click()
	]);
	await page
		.getByRole('link', { name: 'Clear filters' })
		.waitFor({ state: 'detached', timeout: 10000 });
	const cleared = await readList();
	const dates = await page.evaluate(() => [
		document.getElementById('filter-from').value,
		document.getElementById('filter-to').value
	]);
	const samePage = await page.evaluate(() => window.pfSamePage === true);
	check(
		'a chip ticked and a date typed but never applied are gone after Clear filters, on the same page',
		typed === '2026-10-05' &&
			samePage &&
			cleared.countries === '' &&
			cleared.checked.length === 0 &&
			dates.join('') === '' &&
			cleared.open.length + cleared.closed.length === 362,
		`typed "${typed}", then same page ${samePage}, address ${cleared.url}, checked ${cleared.checked.join(' ') || 'none'}, dates "${dates.join('", "')}", ${cleared.open.length + cleared.closed.length} rows read`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'tenders-filter', checks }));
	await browser.closePage(PAGE);
}

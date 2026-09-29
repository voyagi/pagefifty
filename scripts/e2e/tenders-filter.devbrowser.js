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
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

function readList() {
	return page.evaluate(() => {
		const rowsIn = (selector) =>
			Array.from(document.querySelectorAll(`${selector} tbody tr[data-notice]`)).map((row) => ({
				notice: row.getAttribute('data-notice'),
				country: row.querySelector('td[data-label="Country"]').textContent.trim(),
				datetime: (row.querySelector('time') || { getAttribute: () => null }).getAttribute(
					'datetime'
				)
			}));
		const status = document.querySelector('[role="status"]');
		const clear = Array.from(document.querySelectorAll('a')).filter(
			(link) => link.textContent.trim() === 'Clear filters'
		);
		const params = new URLSearchParams(location.search);
		return {
			url: location.href,
			countries: params.getAll('country').join(' '),
			from: params.get('from'),
			to: params.get('to'),
			open: rowsIn('#open'),
			closed: rowsIn('#closed'),
			checked: Array.from(document.querySelectorAll('form[role="search"] input:checked')).map(
				(box) => `${box.name}=${box.value}`
			),
			status: status ? status.textContent.trim() : '',
			emptyHeading: (document.querySelector('#open h2') || { textContent: '' }).textContent.trim(),
			clearHrefs: clear.map((link) => link.getAttribute('href')),
			closedLeaf: Boolean(document.querySelector('#closed')),
			openTable: Boolean(document.querySelector('#open table')),
			text: document.body.textContent.replace(/\s+/g, ' ')
		};
	});
}

const numbers = (rows) => rows.map((row) => row.notice).join(' ');

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

	await page.getByRole('checkbox', { name: 'Germany DE' }).check();
	await Promise.all([
		page.waitForURL(/country=DE/, { timeout: 10000 }),
		page.getByRole('button', { name: 'Apply filters' }).click()
	]);
	const submitted = await readList();
	await page.goto(submitted.url);
	const shared = await readList();
	check(
		'ticking Germany and applying makes an address with NL and DE that loads the same rows when opened directly',
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
		junk.status === DROPPED && junk.open.length + junk.closed.length === 363,
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
			empty.clearHrefs.length > 0 &&
			empty.clearHrefs.every((href) => href === '/tenders') &&
			!empty.openTable &&
			!empty.closedLeaf,
		`heading "${empty.emptyHeading}", clear links ${JSON.stringify(empty.clearHrefs)}, open table ${empty.openTable}, closed leaf ${empty.closedLeaf}`
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
	// list does not apply.
	await page.goto(`${BASE}?country=NL&cpv=72`);
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
	check(
		'a chip ticked and a date typed but never applied are gone after Clear filters',
		typed === '2026-10-05' &&
			cleared.countries === '' &&
			cleared.checked.length === 0 &&
			dates.join('') === '' &&
			cleared.open.length + cleared.closed.length === 363,
		`typed "${typed}", then address ${cleared.url}, checked ${cleared.checked.join(' ') || 'none'}, dates "${dates.join('", "')}", ${cleared.open.length + cleared.closed.length} rows read`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'tenders-filter', checks }));
	await browser.closePage(PAGE);
}

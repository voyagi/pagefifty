// tenders.devbrowser.js - the tenders list on the built Worker: order, groups, tags, the capture
// line, the page without scripts, and each deadline served in Central European Time, then shown in
// the browser's own zone after hydration without a hydration warning.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// The run uses the real clock, and every captured tender will have closed by the time the entry is
// judged, so no check assumes a notice is open: each one reads which group a row sits in first.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-tenders';
const URL = 'http://127.0.0.1:8788/tenders';
const ZONE = 'America/New_York';
const page = await browser.getPage(PAGE);
const checks = [];
const hydrationMessages = [];

// Svelte's production build warns with the error page address alone
// (https://svelte.dev/e/hydration_mismatch), its dev build with "[svelte] hydration_mismatch".
page.on('console', (message) => {
	const text = message.text();
	if (/hydration/i.test(text)) hydrationMessages.push(text);
});

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';

// Reads both tables in document order: the open one first, the closed one inside the details.
function readTables() {
	return page.evaluate(() => {
		const rowsOf = (table) =>
			table
				? Array.from(table.querySelectorAll('tbody tr[data-notice]')).map((row) => {
						const time = row.querySelector('time');
						const tag = row.querySelector('.vtag');
						const reason = row.querySelector('.vcell small');
						return {
							notice: row.getAttribute('data-notice'),
							datetime: time ? time.getAttribute('datetime') : null,
							label: time ? time.textContent.trim() : '',
							tag: tag ? tag.textContent.trim() : '',
							reason: reason ? reason.textContent.trim() : ''
						};
					})
				: [];
		const open = document.querySelector('#open table');
		const closed = document.querySelector('#closed details table');
		return {
			now: Date.now(),
			zone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
			open: rowsOf(open),
			closed: rowsOf(closed),
			openCaption: open ? open.querySelector('caption').textContent.trim() : '',
			body: document.body.textContent.replace(/\s+/g, ' ')
		};
	});
}

// The label a deadline should carry in a zone: day and time there, then a named zone, never an
// offset (DeadlineTime falls back to en-US names where en-GB writes "GMT-4").
function expectedClock(instant, zone) {
	return page.evaluate(
		([at, timeZone]) =>
			new Intl.DateTimeFormat('en-GB', {
				timeZone,
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23'
			}).format(new Date(at)),
		[instant, zone]
	);
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	const response = await page.goto(URL);
	check('tenders list answers 200', response.status() === 200, `status ${response.status()}`);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const facts = await readTables();

	const openTimes = facts.open.map((row) => Date.parse(row.datetime));
	const ascending = openTimes.every((at, i) => i === 0 || at >= openTimes[i - 1]);
	check(
		'the open table runs by deadline, soonest first, in document order',
		facts.open.length > 0 && ascending,
		`${facts.open.length} open rows read, non-decreasing ${ascending}, first ${facts.open[0] && facts.open[0].datetime}, last ${facts.open.length && facts.open[facts.open.length - 1].datetime}`
	);

	const passedInOpen = facts.open.filter((row) => Date.parse(row.datetime) <= facts.now);
	const openInClosed = facts.closed.filter((row) => Date.parse(row.datetime) > facts.now);
	check(
		'no notice whose deadline has passed is listed as open, and no open one as closed',
		passedInOpen.length === 0 && openInClosed.length === 0 && facts.closed.length > 0,
		`${facts.open.length} open and ${facts.closed.length} closed rows read against the browser clock; passed but open: ${passedInOpen.map((row) => row.notice).join(' ') || 'none'}; open but closed: ${openInClosed.map((row) => row.notice).join(' ') || 'none'}`
	);

	check(
		'the open table is captioned as the soonest-first list of open tenders',
		facts.openCaption === 'Open tenders, soonest deadline first',
		`caption "${facts.openCaption}"`
	);

	const all = facts.open.concat(facts.closed);
	const untagged = all.filter((row) => !row.tag || !row.reason);
	check(
		'every row carries a reading-status tag and its reason',
		all.length === 363 && untagged.length === 0,
		`${all.length} rows, ${untagged.length} without a tag or reason`
	);

	const documents = all.find((row) => row.notice === '609955-2026');
	check(
		'609955-2026 reads "Criteria in the documents"',
		documents && documents.tag === 'Criteria in the documents',
		documents
			? `in the ${facts.open.includes(documents) ? 'open' : 'closed'} group, tag "${documents.tag}"`
			: 'row not found'
	);

	const caveat =
		'A snapshot, not live: tenders published before 1 Sep 2026 or after 15 Sep 2026 are missing.';
	check(
		'shows the capture line and the snapshot caveat',
		facts.body.includes('Snapshot captured from TED on 15 Sep 2026') && facts.body.includes(caveat),
		`capture line ${facts.body.includes('Snapshot captured from TED on 15 Sep 2026')}, caveat ${facts.body.includes(caveat)}`
	);

	// The page as a browser with scripts off receives it: fetched inside the page, never run.
	const served = await page.evaluate(async (url) => (await fetch(url)).text(), URL);
	const servedRows = (served.match(/<tr data-notice="/g) || []).length;
	const servedLabels = [
		...served.matchAll(/<time class="[^"]*" datetime="([^"]+)">([^<]+)<\/time>/g)
	];
	const notCentral = servedLabels.filter((match) => !/ (CEST|CET)$/.test(match[2]));
	check(
		'without scripts the served page holds every row and the closed group',
		servedRows === 363 && served.includes('<details') && served.includes('<summary'),
		`${servedRows} rows in the served HTML, details ${served.includes('<details')}`
	);
	check(
		'the served HTML writes every deadline in Central European Time',
		servedLabels.length > 0 && notCentral.length === 0,
		`${servedLabels.length} served labels, ${notCentral.length} not CET or CEST${notCentral.length ? `: ${notCentral[0][2]}` : ''}`
	);

	// Probe once whether this sandbox can move the page to another zone. When it can, the hydrated
	// labels must move with it; when it cannot, they must match the zone the browser reports.
	let form = 'browser zone';
	let zone = facts.zone;
	try {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Emulation.setTimezoneOverride', { timezoneId: ZONE });
		form = 'emulated America/New_York';
		zone = ZONE;
	} catch (error) {
		form = `browser zone (override refused: ${String(error).slice(0, 80)})`;
	}

	hydrationMessages.length = 0;
	await page.goto(URL);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const hydrated = await readTables();
	const sample = hydrated.open.length ? hydrated.open : hydrated.closed;
	const wrong = [];
	for (const row of sample.slice(0, 25)) {
		const clock = await expectedClock(row.datetime, zone);
		if (!row.label.includes(clock) || !/ [A-Z]{2,5}$/.test(row.label)) wrong.push(row);
	}
	check(
		`after hydration each deadline shows in the browser's zone with the zone named (${form})`,
		hydrated.zone === zone && sample.length > 0 && wrong.length === 0,
		`browser zone ${hydrated.zone}, ${Math.min(sample.length, 25)} labels read from the ${hydrated.open.length ? 'open' : 'closed'} table, first "${sample[0] && sample[0].label}", ${wrong.length} wrong${wrong.length ? `: ${wrong[0].label}` : ''}`
	);

	check(
		'no hydration warning reached the console on /tenders',
		hydrationMessages.length === 0,
		hydrationMessages.length ? hydrationMessages.join(' | ') : 'none'
	);

	// Positive control for the listener above: a warning in Svelte's own production wording must
	// reach it, or the silence proves nothing.
	await page.evaluate(() => console.warn('https://svelte.dev/e/hydration_mismatch'));
	await page.waitForTimeout(200);
	check(
		'the console listener hears a planted hydration warning',
		hydrationMessages.length === 1,
		`${hydrationMessages.length} messages after the planted one`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'tenders', checks }));
	await browser.closePage(PAGE);
}

// tenders.devbrowser.js - the tenders list on the built Worker: order, groups, tags, the capture
// line, the page without scripts, the layout at every width from 320 to 1440 px (and with a 20px
// default font), and each deadline served in Central European Time, then shown in the browser's own
// zone after hydration without a hydration warning.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// The run uses the real clock, so rows move from the open group to the closed one day by day (on
// 1 Dec 2026 two of the 362 notices are still open; the last lot closes 9 Oct 2027), and no check
// assumes a given notice is open: each one reads which group a row sits in first.

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

// shared-sweep:start. From here to shared-sweep:end, tenders.devbrowser.js and
// example.devbrowser.js carry the same code word for word, because a driver cannot import;
// scripts/e2e.mjs refuses to run when the two copies differ.
const WIDTHS = [320, 390, 721, 768, 1024, 1100, 1101, 1200, 1243, 1340, 1341, 1440];
const CARDS_UP_TO = 1340;

// Page overflow alone reads 0 from 1089 to 1243 px while the table still runs past its leaf and
// under the tab rail, so each table's right edge is measured against its leaf's content box too.
// The card layout clips the header row to 1 px and hides the caption on purpose, so neither counts.
// Each line of text is measured as well as each box, at its own edge: text that cannot wrap runs past
// its cell while the cell's own box stays inside (75px past a card read as fitting on 2026-10-01),
// and a value clipped inside its cell is cut off, so clipping by any other ancestor does not hide it.
// Only text inside those two hidden structures is left out.
function readGeometry() {
	return page.evaluate(() => {
		const px = (value) => parseFloat(value) || 0;
		const box = (element) => element.getBoundingClientRect();
		const range = document.createRange();
		const hiddenOnPurpose = (element) => {
			if (element.closest('.visually-hidden')) return true;
			const head = element.closest('thead');
			return Boolean(head) && getComputedStyle(head).position === 'absolute';
		};
		const textEdges = (table) => {
			const edges = [];
			const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const host = node.parentElement;
				if (!host || !node.data.trim() || hiddenOnPurpose(host)) continue;
				range.selectNodeContents(node);
				const rect = range.getBoundingClientRect();
				if (rect.width <= 0 && rect.height <= 0) continue;
				edges.push({ right: rect.right, host });
			}
			return edges;
		};
		const name = (element) => {
			const classes = Array.from(element.classList).filter((each) => !each.startsWith('svelte-'));
			const row = element.closest('tr[data-notice]');
			const tag = element.tagName.toLowerCase() + classes.map((each) => `.${each}`).join('');
			return row ? `${tag} ${row.getAttribute('data-notice')}` : tag;
		};
		const rendered = (table) => {
			const head = table.querySelector('thead');
			const heads =
				head && getComputedStyle(head).position !== 'absolute'
					? Array.from(head.querySelectorAll('th, th *'))
					: [];
			return [table, ...table.querySelectorAll('tbody *'), ...heads].filter((element) => {
				const rect = box(element);
				return rect.width > 0 || rect.height > 0;
			});
		};
		const cells = [];
		const tables = [];
		for (const id of ['open', 'closed']) {
			const leaf = document.getElementById(id);
			const table = leaf && leaf.querySelector('table');
			if (!table) continue;
			const leafStyle = getComputedStyle(leaf);
			const contentRight =
				box(leaf).right - px(leafStyle.borderRightWidth) - px(leafStyle.paddingRight);
			let right = -Infinity;
			let worst = '';
			for (const element of rendered(table)) {
				const rect = box(element);
				if (rect.right > right) {
					right = rect.right;
					worst = name(element);
				}
				if (element.tagName === 'TH' || element.tagName === 'TD') cells.push({ element, rect });
			}
			for (const text of textEdges(table)) {
				if (text.right > right) {
					right = text.right;
					worst = `text in ${name(text.host)}`;
				}
			}
			const reading = table.querySelector('.vcell');
			tables.push({
				id,
				display: getComputedStyle(table).display,
				readingMin: reading ? getComputedStyle(reading).minWidth : 'none',
				contentRight,
				right,
				worst
			});
		}
		const hits = [];
		for (const tab of document.querySelectorAll('a.tab')) {
			const tabRect = box(tab);
			for (const cell of cells) {
				const across =
					Math.min(tabRect.right, cell.rect.right) - Math.max(tabRect.left, cell.rect.left);
				const down =
					Math.min(tabRect.bottom, cell.rect.bottom) - Math.max(tabRect.top, cell.rect.top);
				if (across > 1 && down > 1) {
					hits.push(`${tab.textContent.replace(/\s+/g, ' ').trim()} over ${name(cell.element)}`);
				}
			}
		}
		let longest = { text: '', width: 0 };
		for (const time of document.querySelectorAll('table time')) {
			const width = box(time).width;
			if (width > longest.width) longest = { text: time.textContent.trim(), width };
		}
		return {
			theme: document.documentElement.getAttribute('data-theme'),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			rootPx: px(getComputedStyle(document.documentElement).fontSize),
			tables,
			hitCount: hits.length,
			hits: hits.slice(0, 3),
			longest
		};
	});
}

// A table with nothing rendered (hidden by display: none; a closed details still lays its table
// out when measured) leaves its right edge at -Infinity, which is below any leaf edge, so a table
// only fits when something was measured. Planted on the closed group, 14 checks went red.
function fits(read, theme) {
	return (
		read.theme === theme &&
		read.tables.length > 0 &&
		read.overflow <= 0 &&
		read.tables.every(
			(table) => Number.isFinite(table.right) && table.right <= table.contentRight + 0.5
		) &&
		read.hitCount === 0
	);
}

function describe(read) {
	const tables = read.tables
		.map(
			(table) =>
				`${table.id} right ${table.right.toFixed(1)} of ${table.contentRight.toFixed(1)} (${table.worst})`
		)
		.join(', ');
	const hits = read.hitCount ? `${read.hitCount} tab hits: ${read.hits.join('; ')}` : 'no tab hits';
	return `${read.theme}: overflow ${read.overflow}, ${tables || 'no table measured'}, ${hits}`;
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

function checkSweep(path, light, dark, seconds) {
	WIDTHS.forEach((width, i) => {
		const timing = i === 0 ? `, sweep ${seconds.toFixed(1)} s` : '';
		check(
			`at ${width}px ${path} does not scroll sideways, keeps its tables inside their leaves and no tab over a header, in Light and Dark`,
			fits(light[i], 'light') && fits(dark[i], 'dark'),
			`${describe(light[i])} | ${describe(dark[i])}${timing}`
		);
	});
	// Asserted on both themes' reads, so a rule in one theme alone cannot move the switch unseen.
	const switched = (read, width) => {
		const floor = 15 * read.rootPx;
		return (
			read.tables.length > 0 &&
			read.tables.every((table) =>
				width <= CARDS_UP_TO
					? table.display === 'block' && parseFloat(table.readingMin) === 0
					: table.display === 'table' && Math.abs(parseFloat(table.readingMin) - floor) < 0.01
			)
		);
	};
	const seen = (read) =>
		read.tables.map((table) => `${table.display} ${table.readingMin}`).join(' and ') || 'no table';
	const layouts = WIDTHS.map((width, i) => ({
		right: switched(light[i], width) && switched(dark[i], width),
		text: `${width} light ${seen(light[i])}, dark ${seen(dark[i])}`
	}));
	const wrong = layouts.filter((layout) => !layout.right).map((layout) => layout.text);
	check(
		`${path} shows cards up to ${CARDS_UP_TO}px and the five-column table from ${CARDS_UP_TO + 1}px, the reading cell floor switching with it, in Light and Dark`,
		wrong.length === 0,
		`wrong at ${wrong.join(', ') || 'none'}; read ${layouts.map((layout) => layout.text).join(', ')}`
	);
}
// shared-sweep:end

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

// The test browser draws no scrollbar, while Chromium on Windows takes a classic one's 17px (15px in
// its Fluent style) from the page's width and not from the width the media query reads. Padding on
// the root takes the same 17px from the layout and leaves the media query and vw alone.
async function readWithScrollbar(width) {
	const before = page.viewportSize() ?? { width: 1280, height: 720 };
	await page.setViewportSize({ width, height: 900 });
	await page.evaluate(() => {
		document.documentElement.style.paddingRight = '17px';
	});
	await page.waitForTimeout(150);
	const read = await readGeometry();
	await page.evaluate(() => {
		document.documentElement.style.paddingRight = '';
	});
	await page.setViewportSize(before);
	return read;
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	const response = await page.goto(URL);
	check('tenders list answers 200', response.status() === 200, `status ${response.status()}`);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const facts = await readTables();

	// Once every captured deadline has passed (after 9 Oct 2027), the page shows a note in place of
	// the open table, so the order and caption checks read the closed table and that note instead.
	const noneOpen = facts.open.length === 0;
	const ordered = noneOpen ? facts.closed : facts.open;
	const times = ordered.map((row) => Date.parse(row.datetime));
	const ascending = times.every((at, i) => i === 0 || at >= times[i - 1]);
	check(
		`the ${noneOpen ? 'closed' : 'open'} table runs by deadline, soonest first, in document order`,
		ordered.length > 0 && ascending,
		`${ordered.length} ${noneOpen ? 'closed' : 'open'} rows read, non-decreasing ${ascending}, first ${ordered[0] && ordered[0].datetime}, last ${ordered.length && ordered[ordered.length - 1].datetime}`
	);

	const passedInOpen = facts.open.filter((row) => Date.parse(row.datetime) <= facts.now);
	const openInClosed = facts.closed.filter((row) => Date.parse(row.datetime) > facts.now);
	check(
		'no notice whose deadline has passed is listed as open, and no open one as closed',
		passedInOpen.length === 0 && openInClosed.length === 0 && facts.closed.length > 0,
		`${facts.open.length} open and ${facts.closed.length} closed rows read against the browser clock; passed but open: ${passedInOpen.map((row) => row.notice).join(' ') || 'none'}; open but closed: ${openInClosed.map((row) => row.notice).join(' ') || 'none'}`
	);

	check(
		noneOpen
			? 'with no tender open, the page says so in place of the open table'
			: 'the open table is captioned as the soonest-first list of open tenders',
		noneOpen
			? facts.openCaption === '' &&
					facts.body.includes('No tender in this list is still open. The closed ones are below.')
			: facts.openCaption === 'Open tenders, soonest deadline first',
		`caption "${facts.openCaption}", ${facts.open.length} open rows`
	);

	const all = facts.open.concat(facts.closed);
	const untagged = all.filter((row) => !row.tag || !row.reason);
	check(
		'every row carries a reading-status tag and its reason',
		all.length === 362 && untagged.length === 0,
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
		servedRows === 362 && served.includes('<details') && served.includes('<summary'),
		`${servedRows} rows in the served HTML, details ${served.includes('<details')}`
	);
	check(
		'the served HTML writes every deadline in Central European Time',
		servedLabels.length > 0 && notCentral.length === 0,
		`${servedLabels.length} served labels, ${notCentral.length} not CET or CEST${notCentral.length ? `: ${notCentral[0][2]}` : ''}`
	);

	const sweepStart = Date.now();
	await page.goto('http://127.0.0.1:8788/tenders?theme=light');
	await openClosedGroup();
	const light = await readAtWidths(WIDTHS);
	await page.goto('http://127.0.0.1:8788/tenders?theme=dark');
	await openClosedGroup();
	const dark = await readAtWidths(WIDTHS);
	checkSweep('/tenders', light, dark, (Date.now() - sweepStart) / 1000);

	// Positive control for the text measure: text that cannot wrap runs past its card while the
	// cell's own box stays inside the leaf and clips it, so only a text measure that ignores the
	// clipping can see it. The cell comes from the open table while it lists a row, else from the
	// closed one, so the control still runs once every captured deadline has passed.
	const beforePlant = page.viewportSize() ?? { width: 1280, height: 720 };
	await page.goto('http://127.0.0.1:8788/tenders?theme=light');
	await openClosedGroup();
	await page.setViewportSize({ width: 1000, height: 900 });
	const planted = await page.evaluate(() => {
		for (const id of ['open', 'closed']) {
			const cell = document.querySelector(`#${id} tbody tr[data-notice] td[data-label="Country"]`);
			if (!cell) continue;
			cell.style.whiteSpace = 'nowrap';
			cell.style.overflow = 'hidden';
			cell.textContent = 'text-plant '.repeat(40);
			const inside =
				cell.getBoundingClientRect().right <=
				document.getElementById(id).getBoundingClientRect().right;
			return { id, inside };
		}
		return { id: null, inside: false };
	});
	await page.waitForTimeout(150);
	const textPlant = await readGeometry();
	await page.setViewportSize(beforePlant);
	const plantedTable = textPlant.tables.find((table) => table.id === planted.id);
	check(
		'the table measure counts text planted past its card while the cell itself stays inside and clips it',
		planted.inside &&
			Boolean(plantedTable) &&
			plantedTable.right > plantedTable.contentRight + 0.5 &&
			plantedTable.worst.startsWith('text in td'),
		`planted in the ${planted.id ?? 'no'} table, cell inside its leaf ${planted.inside}; ${describe(textPlant)}`
	);

	// Probe once whether this sandbox can move the page to another zone. When it can, the hydrated
	// labels must move with it; when it cannot, they must match the zone the browser reports. The
	// browser session is opened on its own, since the larger-font check below needs the session and
	// not the zone.
	let form = 'browser zone';
	let zone = facts.zone;
	let cdp = null;
	let zoneRefused = '';
	try {
		cdp = await page.context().newCDPSession(page);
	} catch (error) {
		form = `browser zone (no browser session: ${String(error).slice(0, 80)})`;
	}
	if (cdp) {
		try {
			await cdp.send('Emulation.setTimezoneOverride', { timezoneId: ZONE });
			form = 'emulated America/New_York';
			zone = ZONE;
		} catch (error) {
			zoneRefused = String(error).slice(0, 80);
			form = `browser zone (override refused: ${zoneRefused})`;
		}
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

	// The widest deadline label sets the switch width: a zone with no short name is written as an
	// offset ('GMT+13:45', five characters past 'CEST'), and the table must still fit its leaf at the
	// first width that shows it, with a classic scrollbar too. Measured at e7ca483: at 1341px the
	// closed leaf offers 1035px and its table needs 1007.5px, so a 17px scrollbar leaves 10.5px.
	const widest =
		'with every deadline in Pacific/Chatham (GMT+13:45, the widest zone label) /tenders keeps its tables inside their leaves at 320, 390 and 1341px, with and without a 17px classic scrollbar';
	if (!cdp || zoneRefused) {
		check(widest, false, `no zone override in this sandbox, so nothing was measured: ${form}`);
	} else {
		try {
			await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Pacific/Chatham' });
			zone = 'Pacific/Chatham';
			await page.goto('http://127.0.0.1:8788/tenders?theme=light');
			await openClosedGroup();
			await page.waitForFunction(
				() =>
					Array.from(document.querySelectorAll('table time')).some((time) =>
						/GMT\+1[23]:45$/.test(time.textContent.trim())
					),
				null,
				{ timeout: 10000 }
			);
			// 320px is the reflow width, where the whole label (252px) is wider than a card (242px).
			const [narrow, phone, first] = await readAtWidths([320, 390, 1341]);
			const classic = await readWithScrollbar(1341);
			check(
				widest,
				fits(narrow, 'light') &&
					fits(phone, 'light') &&
					fits(first, 'light') &&
					fits(classic, 'light') &&
					/GMT\+1[23]:45$/.test(first.longest.text),
				`longest label "${first.longest.text}" ${first.longest.width.toFixed(1)}px | 320 ${describe(narrow)} | 390 ${describe(phone)} | 1341 ${describe(first)} | 1341 with a 17px scrollbar ${describe(classic)}`
			);
		} catch (error) {
			check(widest, false, `the Chatham run stopped: ${String(error).slice(0, 160)}`);
		}
	}

	// A reader who raises the browser's default font (20px is Chrome's Large) widens every column,
	// so the switch is written in em and moves with the text: 83.75em is 1340px at 16px and 1675px
	// at 20px, so 1676px is the first table width. Before it moved, at 20px and 1341px in the Chatham
	// zone the closed table ran 279.8px past its leaf and the page scrolled 84px sideways. The check
	// runs in whatever zone the run above left, Chatham when the sandbox allows it, and names it.
	const larger = `with a 20px default font, deadlines in ${zone}, /tenders shows cards at 1341px and the five-column table at 1676px, each inside its leaf`;
	if (!cdp) {
		check(larger, false, `no browser session in this sandbox, so nothing was measured: ${form}`);
	} else {
		try {
			await cdp.send('Page.setFontSizes', { fontSizes: { standard: 20, fixed: 13 } });
			await page.goto('http://127.0.0.1:8788/tenders?theme=light');
			await openClosedGroup();
			const [cards, table] = await readAtWidths([1341, 1676]);
			const shows = (read, display) =>
				read.rootPx === 20 && read.tables.every((each) => each.display === display);
			check(
				larger,
				shows(cards, 'block') &&
					fits(cards, 'light') &&
					shows(table, 'table') &&
					fits(table, 'light'),
				`root ${cards.rootPx}px | 1341 ${cards.tables.map((each) => each.display).join(' and ')}, ${describe(cards)} | 1676 ${table.tables.map((each) => each.display).join(' and ')}, ${describe(table)}`
			);
		} catch (error) {
			check(larger, false, `the larger-font run stopped: ${String(error).slice(0, 160)}`);
		} finally {
			await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
		}
	}
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'tenders', checks }));
	await browser.closePage(PAGE);
}

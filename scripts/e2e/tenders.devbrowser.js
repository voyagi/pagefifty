// tenders.devbrowser.js - the tenders list on the built Worker: order, groups, reading statuses, the capture
// line, the page without scripts, the layout at every width from 320 to 1440 px (and with a 20px
// default font), and each deadline served in Central European Time, then shown in the browser's own
// zone after hydration without a hydration warning.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// The run uses the real clock, so rows move from the open group to the closed one day by day, and
// no check assumes a given notice is open: each one reads which group a row sits in first. The
// list serves the newest capture, so its counts and days come from config.latest.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-tenders';
const URL = 'http://127.0.0.1:8788/tenders';
const ZONE = 'America/New_York';
// The closed section's note while no row of the live list has closed (TenderSplit.svelte).
const NONE_CLOSED = 'No tender in this list has closed.';
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

// Reads both lists in document order: the open one first, the closed one inside the details. A row
// shows its reading status as one line; the reason behind it is on the tender's own page.
function readTables() {
	return page.evaluate(() => {
		const rowsOf = (list) =>
			list
				? Array.from(list.querySelectorAll(':scope > li[data-notice]')).map((row) => {
						const time = row.querySelector('time');
						const status = row.querySelector('.status');
						return {
							notice: row.getAttribute('data-notice'),
							datetime: time ? time.getAttribute('datetime') : null,
							label: time ? time.textContent.trim() : '',
							status: status ? status.textContent.replace(/\s+/g, ' ').trim() : ''
						};
					})
				: [];
		const open = document.querySelector('#open ul.rows');
		const closed = document.querySelector('#closed details ul.rows');
		return {
			now: Date.now(),
			zone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
			open: rowsOf(open),
			closed: rowsOf(closed),
			openLabel: open ? open.getAttribute('aria-label') : '',
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
	// the open list, so the order and label checks read the closed list and that note instead.
	const noneOpen = facts.open.length === 0;
	const ordered = noneOpen ? facts.closed : facts.open;
	const times = ordered.map((row) => Date.parse(row.datetime));
	const ascending = times.every((at, i) => i === 0 || at >= times[i - 1]);
	check(
		`the ${noneOpen ? 'closed' : 'open'} list runs by deadline, soonest first, in document order`,
		ordered.length > 0 && ascending,
		`${ordered.length} ${noneOpen ? 'closed' : 'open'} rows read, non-decreasing ${ascending}, first ${ordered[0] && ordered[0].datetime}, last ${ordered.length && ordered[ordered.length - 1].datetime}`
	);

	const passedInOpen = facts.open.filter((row) => Date.parse(row.datetime) <= facts.now);
	const openInClosed = facts.closed.filter((row) => Date.parse(row.datetime) > facts.now);
	// A capture taken with --open-after leaves out every notice that closes before that time, so
	// until its first deadline passes no row is closed and the closed group has nothing to hold.
	// Every row must then read as open, which the row count proves.
	const anyPassed = facts.open
		.concat(facts.closed)
		.some((row) => Date.parse(row.datetime) <= facts.now);
	check(
		anyPassed
			? 'no notice whose deadline has passed is listed as open, and no open one as closed'
			: 'with no captured deadline passed yet, every row is listed as open and none as closed',
		passedInOpen.length === 0 &&
			openInClosed.length === 0 &&
			(anyPassed ? facts.closed.length > 0 : facts.open.length === config.latest.rows),
		`${facts.open.length} open and ${facts.closed.length} closed rows read against the browser clock; passed but open: ${passedInOpen.map((row) => row.notice).join(' ') || 'none'}; open but closed: ${openInClosed.map((row) => row.notice).join(' ') || 'none'}`
	);

	check(
		noneOpen
			? 'with no tender open, the page says so in place of the open list'
			: 'the open list is labelled as the soonest-first list of open tenders',
		noneOpen
			? facts.openLabel === '' &&
					facts.body.includes('No tender in this list is still open. The closed ones are below.')
			: facts.openLabel === 'Open tenders, soonest deadline first',
		`label "${facts.openLabel}", ${facts.open.length} open rows`
	);

	// The redesign shows each row's reading status as one line and keeps the reason behind it for the
	// tender's own page, so a row is held to its status line alone.
	const all = facts.open.concat(facts.closed);
	const untagged = all.filter((row) => !row.status);
	check(
		'every row of the newest capture carries its reading status',
		all.length === config.latest.rows && untagged.length === 0,
		`${all.length} rows of ${config.latest.rows} in the built index, ${untagged.length} without a status`
	);

	// A notice whose criteria sit partly in the documents is a fact of the example capture's own
	// notices, so the example's documents probe (config.example, from the build) is read on the
	// example list as served.
	const documents = config.example.probes.documents;
	const exampleList = await page.evaluate(async () =>
		(await fetch('http://127.0.0.1:8788/example')).text()
	);
	const rowMatch = new RegExp(`<li[^>]*\\sdata-notice="${documents.notice}"`).exec(exampleList);
	const rowStart = rowMatch ? rowMatch.index : -1;
	const exampleRow =
		rowStart < 0 ? '' : exampleList.slice(rowStart, exampleList.indexOf('</li>', rowStart));
	check(
		'the documents probe reads "Criteria in the documents" on the served example list',
		exampleRow.includes('Criteria in the documents'),
		rowStart < 0
			? `row ${documents.notice} not found in /example`
			: `row ${documents.notice} of ${exampleRow.length} characters read`
	);

	const captureLine = `Snapshot captured from TED on ${config.latest.capturedOn}`;
	const caveat = `A snapshot, not live: tenders published before ${config.latest.firstPublished} or after ${config.latest.capturedOn} are missing.`;
	check(
		"shows the newest capture's capture line and snapshot caveat",
		facts.body.includes(captureLine) && facts.body.includes(caveat),
		`capture line ${facts.body.includes(captureLine)}, caveat ${facts.body.includes(caveat)}, expected "${caveat}"`
	);

	// The page as a browser with scripts off receives it: fetched inside the page, never run.
	const served = await page.evaluate(async (url) => (await fetch(url)).text(), URL);
	const servedRows = (served.match(/<li[^>]*\sdata-notice="/g) || []).length;
	const servedLabels = [
		...served.matchAll(/<time class="[^"]*" datetime="([^"]+)">([^<]+)<\/time>/g)
	];
	const notCentral = servedLabels.filter((match) => !/ (CEST|CET)$/.test(match[2]));
	// The closed group's fold is served only once a captured deadline has passed; before that the
	// closed section holds its none-closed note in its place.
	const noneClosed = served.includes(NONE_CLOSED);
	check(
		anyPassed
			? 'without scripts the served page holds every row and the closed group'
			: 'without scripts the served page holds every row and the closed section says none has closed',
		servedRows === config.latest.rows &&
			(anyPassed ? served.includes('<details') && served.includes('<summary') : noneClosed),
		`${servedRows} rows in the served HTML of ${config.latest.rows} in the built index, details ${served.includes('<details')}, none-closed note ${noneClosed}`
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
	checkSweep('/tenders', light, dark, (Date.now() - sweepStart) / 1000, facts.open.length > 0);

	// Positive control for the text measure: text that cannot wrap runs past its row while its own
	// block stays inside the list column and clips it, so only a text measure that ignores the
	// clipping can see it. The row comes from the open list while it holds one, else from the closed
	// one, so the control still runs once every captured deadline has passed.
	const beforePlant = page.viewportSize() ?? { width: 1280, height: 720 };
	await page.goto('http://127.0.0.1:8788/tenders?theme=light');
	await openClosedGroup();
	await page.setViewportSize({ width: 1000, height: 900 });
	const planted = await page.evaluate(() => {
		for (const id of ['open', 'closed']) {
			const body = document.querySelector(`#${id} ul.rows > li[data-notice] .body`);
			if (!body) continue;
			const plant = document.createElement('p');
			plant.style.whiteSpace = 'nowrap';
			plant.style.overflow = 'hidden';
			plant.textContent = 'text-plant '.repeat(40);
			body.append(plant);
			const inside =
				plant.getBoundingClientRect().right <=
				document.querySelector('.list-col').getBoundingClientRect().right;
			return { id, inside };
		}
		return { id: null, inside: false };
	});
	await page.waitForTimeout(150);
	const textPlant = await readGeometry();
	await page.setViewportSize(beforePlant);
	const plantedList = textPlant.lists.find((list) => list.id === planted.id);
	check(
		'the list measure counts text planted past its row while its own block stays inside and clips it',
		planted.inside &&
			Boolean(plantedList) &&
			plantedList.right > textPlant.contentRight + 0.5 &&
			plantedList.worst.startsWith('text in p'),
		`planted in the ${planted.id ?? 'no'} list, block inside the column ${planted.inside}; ${describe(textPlant)}`
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
		`browser zone ${hydrated.zone}, ${Math.min(sample.length, 25)} labels read from the ${hydrated.open.length ? 'open' : 'closed'} list, first "${sample[0] && sample[0].label}", ${wrong.length} wrong${wrong.length ? `: ${wrong[0].label}` : ''}`
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

	// The widest deadline label: a zone with no short name is written as an offset ('GMT+13:45', five
	// characters past 'CEST'), and every row must still fit the list column where it is narrowest: at
	// the 320px reflow width, and at the first split width, where the column is 42% of the page, with a
	// classic scrollbar too.
	const widest =
		'with every deadline in Pacific/Chatham (GMT+13:45, the widest zone label) /tenders keeps every row inside the list column at 320, 390 and 721px, with and without a 17px classic scrollbar';
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
					Array.from(document.querySelectorAll('ul.rows time')).some((time) =>
						/GMT\+1[23]:45$/.test(time.textContent.trim())
					),
				null,
				{ timeout: 10000 }
			);
			const [narrow, phone, first] = await readAtWidths([320, 390, SPLIT_FROM]);
			const classic = await readWithScrollbar(SPLIT_FROM);
			check(
				widest,
				fits(narrow, 'light') &&
					fits(phone, 'light') &&
					fits(first, 'light') &&
					fits(classic, 'light') &&
					/GMT\+1[23]:45$/.test(first.longest.text),
				`longest label "${first.longest.text}" ${first.longest.width.toFixed(1)}px | 320 ${describe(narrow)} | 390 ${describe(phone)} | ${SPLIT_FROM} ${describe(first)} | ${SPLIT_FROM} with a 17px scrollbar ${describe(classic)}`
			);
		} catch (error) {
			check(widest, false, `the Chatham run stopped: ${String(error).slice(0, 160)}`);
		}
	}

	// A reader who raises the browser's default font (20px is Chrome's Large) widens every row, so
	// the split switch is written in em and moves with the text: 45em is 720px at 16px and 900px at
	// 20px. The list stands alone at 900px and the tender sits beside it from 901px, where the list
	// column is at its narrowest for that font; a row's notice number ran 1.7px past the column there
	// until the buyer line could wrap (found on 2026-10-22). The check runs in whatever zone the run
	// above left, Chatham when the sandbox allows it, and names it.
	const larger = `with a 20px default font, deadlines in ${zone}, /tenders shows the list alone at 900px and the tender beside it at 901px, every row inside the list column`;
	if (!cdp) {
		check(larger, false, `no browser session in this sandbox, so nothing was measured: ${form}`);
	} else {
		try {
			await cdp.send('Page.setFontSizes', { fontSizes: { standard: 20, fixed: 13 } });
			await page.goto('http://127.0.0.1:8788/tenders?theme=light');
			await openClosedGroup();
			const [alone, beside] = await readAtWidths([900, 901]);
			// A list with no row open opens no tender, so it stands alone at both widths.
			const opens = facts.open.length > 0;
			check(
				larger,
				alone.rootPx === 20 &&
					!alone.paneShown &&
					fits(alone, 'light') &&
					beside.paneShown === opens &&
					(!opens || beside.beside) &&
					fits(beside, 'light'),
				`root ${alone.rootPx}px | 900 ${describe(alone)} | 901 ${describe(beside)}`
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

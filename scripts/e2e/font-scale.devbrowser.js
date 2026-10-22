// font-scale.devbrowser.js - every page with a reader's larger default font (20px is Chrome's
// Large, 24px its Very large): nothing runs out of its box and no page scrolls sideways, at the
// first width past each layout switch. A box is a page's panel, or on a list page the filter row,
// the list column and the opened tender's pane.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// Every layout switch is in em (45em, 68.75em, 83.75em: 720, 1100 and 1340px at 16px), so it
// moves with the font: at 20px they sit at 900, 1375 and 1675px, at 24px at 1080, 1650 and
// 2010px. With pixel switches a 24px font pushed every page 16 to 85px sideways at 721 to 768px.
// 320px is below the 320px reflow floor at both sizes: a 256px window at the default size with a
// 20px font, 213px with 24px. 320px at 20px stays in because it passes clean; 320px at 24px is
// left out because some chips, an amount and the deadline lines reached the box padding there, a
// design question for the design pass.
//
// dev-browser-nav-guard: dynamic-ok the loop below only visits the literal URLs listed in ROUTES

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-font-scale';
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

// One route per layout: the start page, both lists, the largest notice, the filled profile, the
// empty filter state, the error page and the two trust pages, /ai and /privacy. The largest notice is
// the example capture's notice with the most lots (config.example, from the build), reached by its
// row on the example list; no deadline lies in 2099.
const MOST_LOTS = config.example.probes.mostLots;
const ROUTES = [
	{ path: '/', url: 'http://127.0.0.1:8788/?theme=light' },
	{ path: '/tenders', url: 'http://127.0.0.1:8788/tenders?theme=light' },
	{ path: '/example', url: 'http://127.0.0.1:8788/example?theme=light' },
	{
		path: 'the example notice with the most lots',
		url: 'http://127.0.0.1:8788/example?theme=light',
		row: MOST_LOTS.notice
	},
	{ path: '/profile (demo firm)', url: 'http://127.0.0.1:8788/profile?theme=light', demo: true },
	{
		path: '/tenders with no match',
		url: 'http://127.0.0.1:8788/tenders?country=BE&from=2099-01-01&theme=light'
	},
	{ path: 'an unknown page', url: 'http://127.0.0.1:8788/no-such-page?theme=light' },
	{ path: '/ai', url: 'http://127.0.0.1:8788/ai?theme=light' },
	{ path: '/privacy', url: 'http://127.0.0.1:8788/privacy?theme=light' }
];
const FONTS = [
	{ px: 20, widths: [320, 768, 901, 1376, 1676] },
	{ px: 24, widths: [390, 768, 1081, 1651, 2011] }
];
const BOXES = '.panel, .filter-row, .list-col, .pane';

// What runs past its box's content edge, and what past the window's right edge. A visually hidden
// label is clipped to 1px, so it does not count; any other box 1px or smaller is hidden too. Each
// line of text is measured as well as each box, at its own edge: text that cannot wrap runs past
// its block while the block's own box stays inside (75px past a box read as no spill on
// 2026-10-01), and text clipped inside its block is cut off, so clipping does not hide it. The one
// cut that is meant is a line that ends in an ellipsis (a list row's buyer, whose whole name is on
// its tender), so text in an element set to text-overflow: ellipsis does not count.
function readSpill() {
	return page.evaluate((selector) => {
		const px = (value) => parseFloat(value) || 0;
		const range = document.createRange();
		const label = (element) => {
			const classes = Array.from(element.classList).filter((each) => !each.startsWith('svelte-'));
			const text = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
			return `${element.tagName.toLowerCase()}${classes.map((each) => `.${each}`).join('')} "${text}"`;
		};
		const skipped = (element) => Boolean(element.closest('.visually-hidden'));
		const ellipsis = (element) => {
			const style = getComputedStyle(element);
			return style.textOverflow === 'ellipsis' && style.overflowX === 'hidden';
		};
		const shown = (rect) => rect.width > 1 && rect.height > 1;
		const spills = [];
		let boxes = 0;
		for (const box of document.querySelectorAll(selector)) {
			if (!shown(box.getBoundingClientRect())) continue;
			boxes += 1;
			const style = getComputedStyle(box);
			const edge =
				box.getBoundingClientRect().right - px(style.borderRightWidth) - px(style.paddingRight);
			let worst = null;
			const consider = (right, what) => {
				const past = right - edge;
				if (past > 0.5 && (!worst || past > worst.past)) worst = { past, what };
			};
			for (const element of box.querySelectorAll('*')) {
				if (skipped(element)) continue;
				const rect = element.getBoundingClientRect();
				if (shown(rect)) consider(rect.right, label(element));
			}
			const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const host = node.parentElement;
				if (!host || !node.data.trim() || skipped(host) || ellipsis(host)) continue;
				range.selectNodeContents(node);
				const rect = range.getBoundingClientRect();
				if (shown(rect)) consider(rect.right, `text in ${label(host)}`);
			}
			if (worst)
				spills.push(
					`${box.id || label(box).split(' ')[0]}: ${worst.what} +${worst.past.toFixed(1)}px`
				);
		}
		return {
			rootPx: px(getComputedStyle(document.documentElement).fontSize),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			boxes,
			spills
		};
	}, BOXES);
}

// A route with a row is the notice that row leads to, reached by clicking it, never by a typed
// number; a row closed at the capture instant sits in the folded closed group, opened first.
async function load(route) {
	await page.evaluate((demo) => {
		localStorage.clear();
		if (demo) localStorage.setItem('pagefifty-active-firm', 'demo');
	}, Boolean(route.demo));
	await page.goto(route.url);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	if (route.row === undefined) return;
	const folded = await page.evaluate(
		(number) =>
			Boolean(
				document.querySelector(`li[data-notice="${number}"]`)?.closest('details:not([open])')
			),
		route.row
	);
	if (folded) await page.click('#closed summary');
	await page.click(`li[data-notice="${route.row}"] a.t`);
	await page.waitForFunction((path) => location.pathname === path, `/example/${route.row}`, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	await page.waitForLoadState('networkidle');
}

try {
	await page.goto('http://127.0.0.1:8788/');
	const cdp = await page.context().newCDPSession(page);
	try {
		// Positive control: an element planted wider than its box must read as a spill, or a clean
		// read below proves nothing.
		await load(ROUTES[1]);
		await page.setViewportSize({ width: 768, height: 900 });
		await page.evaluate(() => {
			const plant = document.createElement('div');
			plant.id = 'font-scale-plant';
			plant.textContent = 'planted';
			plant.style.width = '2000px';
			document.querySelector('.list-col').append(plant);
		});
		const planted = await readSpill();
		check(
			'the spill reader names an element planted wider than its box',
			planted.spills.some((spill) => spill.includes('"planted"')),
			planted.spills.join('; ') || 'nothing read'
		);

		// The second shape: text that cannot wrap, in a block whose own box stays inside the list
		// column and clips it, so only a text measure that ignores the clipping can see it.
		await load(ROUTES[1]);
		await page.setViewportSize({ width: 768, height: 900 });
		const blockInside = await page.evaluate(() => {
			const plant = document.createElement('p');
			plant.style.whiteSpace = 'nowrap';
			plant.style.overflow = 'hidden';
			plant.textContent = 'bare-text-plant '.repeat(60);
			const box = document.querySelector('.list-col');
			box.append(plant);
			return plant.getBoundingClientRect().right <= box.getBoundingClientRect().right;
		});
		const plantedText = await readSpill();
		check(
			'the spill reader names text planted past its box while its own block stays inside and clips it',
			blockInside &&
				plantedText.spills.some((spill) => spill.includes('text in p "bare-text-plant')),
			`block inside its box ${blockInside}; ${plantedText.spills.join('; ') || 'nothing read'}`
		);

		for (const font of FONTS) {
			await cdp.send('Page.setFontSizes', { fontSizes: { standard: font.px, fixed: 13 } });
			for (const route of ROUTES) {
				const bad = [];
				let reads = 0;
				try {
					await load(route);
					for (const width of font.widths) {
						await page.setViewportSize({ width, height: 900 });
						await page.waitForTimeout(100);
						const read = await readSpill();
						reads += 1;
						if (read.rootPx !== font.px || read.boxes === 0) {
							bad.push(`${width}: root ${read.rootPx}px, ${read.boxes} boxes`);
						} else if (read.overflow > 0 || read.spills.length > 0) {
							bad.push(
								`${width}: overflow ${read.overflow}, ${read.spills.join('; ') || 'no spill'}`
							);
						}
					}
				} catch (error) {
					bad.push(`stopped: ${String(error).slice(0, 120)}`);
				}
				check(
					`with a ${font.px}px default font ${route.path} keeps everything inside its boxes and does not scroll sideways at ${font.widths.join(', ')}px`,
					reads === font.widths.length && bad.length === 0,
					bad.length ? bad.join(' | ') : `${reads} widths read, all clean`
				);
			}
		}
	} finally {
		await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
	}
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'font-scale', checks }));
	await browser.closePage(PAGE);
}

// font-scale.devbrowser.js - every page with a reader's larger default font (20px is Chrome's
// Large, 24px its Very large): nothing runs out of its leaf and no page scrolls sideways, at the
// first width past each layout switch.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// Every layout switch is in em (45em, 68.75em, 83.75em: 720, 1100 and 1340px at 16px), so it
// moves with the font: at 20px they sit at 900, 1375 and 1675px, at 24px at 1080, 1650 and
// 2010px. With pixel switches a 24px font pushed every page 16 to 85px sideways at 721 to 768px.
// 320px is below the 320px reflow floor at both sizes: a 256px window at the default size with a
// 20px font, 213px with 24px. 320px at 20px stays in because it passes clean; 320px at 24px is
// left out because some chips, an amount and the deadline lines reach the leaf padding there, a
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
// empty filter state, the error page and the two trust pages, /ai and /privacy. The largest notice,
// 600457-2026 with its 17 lots, is read on the example, which stays on the 2026-09-15 capture that
// holds it; no deadline lies in 2099.
const ROUTES = [
	{ path: '/', url: 'http://127.0.0.1:8788/?theme=light' },
	{ path: '/tenders', url: 'http://127.0.0.1:8788/tenders?theme=light' },
	{ path: '/example', url: 'http://127.0.0.1:8788/example?theme=light' },
	{ path: '/example/600457-2026', url: 'http://127.0.0.1:8788/example/600457-2026?theme=light' },
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

// What runs past its leaf's content edge, and what past the window's right edge. The card layout
// clips the header row to 1px on purpose, a visually hidden label is clipped to 1px, and a tab
// stands outside its leaf by design, so none of them counts; any other box 1px or smaller is
// hidden too. Each line of text is measured as well as each box, at its own edge: text that cannot
// wrap runs past its block while the block's own box stays inside (75px past a leaf read as no spill
// on 2026-10-01), and text clipped inside its block is cut off, so clipping does not hide it.
function readSpill() {
	return page.evaluate(() => {
		const px = (value) => parseFloat(value) || 0;
		const range = document.createRange();
		const label = (element) => {
			const classes = Array.from(element.classList).filter((each) => !each.startsWith('svelte-'));
			const text = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
			return `${element.tagName.toLowerCase()}${classes.map((each) => `.${each}`).join('')} "${text}"`;
		};
		const skipped = (element) => {
			if (element.closest('.tab, .visually-hidden')) return true;
			const head = element.closest('thead');
			return Boolean(head) && getComputedStyle(head).position === 'absolute';
		};
		const shown = (rect) => rect.width > 1 && rect.height > 1;
		const spills = [];
		let leaves = 0;
		for (const leaf of document.querySelectorAll('.leaf')) {
			leaves += 1;
			const style = getComputedStyle(leaf);
			const edge =
				leaf.getBoundingClientRect().right - px(style.borderRightWidth) - px(style.paddingRight);
			let worst = null;
			const consider = (right, what) => {
				const past = right - edge;
				if (past > 0.5 && (!worst || past > worst.past)) worst = { past, what };
			};
			for (const element of leaf.querySelectorAll('*')) {
				if (skipped(element)) continue;
				const rect = element.getBoundingClientRect();
				if (shown(rect)) consider(rect.right, label(element));
			}
			const walker = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const host = node.parentElement;
				if (!host || !node.data.trim() || skipped(host)) continue;
				range.selectNodeContents(node);
				const rect = range.getBoundingClientRect();
				if (shown(rect)) consider(rect.right, `text in ${label(host)}`);
			}
			if (worst) spills.push(`${leaf.id || 'a leaf'}: ${worst.what} +${worst.past.toFixed(1)}px`);
		}
		return {
			rootPx: px(getComputedStyle(document.documentElement).fontSize),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			leaves,
			spills
		};
	});
}

async function load(route) {
	await page.evaluate((demo) => {
		localStorage.clear();
		if (demo) localStorage.setItem('pagefifty-active-firm', 'demo');
	}, Boolean(route.demo));
	await page.goto(route.url);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
}

try {
	await page.goto('http://127.0.0.1:8788/');
	const cdp = await page.context().newCDPSession(page);
	try {
		// Positive control: an element planted wider than its leaf must read as a spill, or a clean
		// read below proves nothing.
		await load(ROUTES[1]);
		await page.setViewportSize({ width: 768, height: 900 });
		await page.evaluate(() => {
			const plant = document.createElement('div');
			plant.id = 'font-scale-plant';
			plant.textContent = 'planted';
			plant.style.width = '2000px';
			document.querySelector('.leaf').append(plant);
		});
		const planted = await readSpill();
		check(
			'the spill reader names an element planted wider than its leaf',
			planted.spills.some((spill) => spill.includes('"planted"')),
			planted.spills.join('; ') || 'nothing read'
		);

		// The second shape: text that cannot wrap, in a block whose own box stays inside the leaf and
		// clips it, so only a text measure that ignores the clipping can see it.
		await load(ROUTES[1]);
		await page.setViewportSize({ width: 768, height: 900 });
		const blockInside = await page.evaluate(() => {
			const plant = document.createElement('p');
			plant.style.whiteSpace = 'nowrap';
			plant.style.overflow = 'hidden';
			plant.textContent = 'bare-text-plant '.repeat(60);
			const leaf = document.querySelector('.leaf');
			leaf.append(plant);
			return plant.getBoundingClientRect().right <= leaf.getBoundingClientRect().right;
		});
		const plantedText = await readSpill();
		check(
			'the spill reader names text planted past its leaf while its own block stays inside and clips it',
			blockInside &&
				plantedText.spills.some((spill) => spill.includes('text in p "bare-text-plant')),
			`block inside its leaf ${blockInside}; ${plantedText.spills.join('; ') || 'nothing read'}`
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
						if (read.rootPx !== font.px || read.leaves === 0) {
							bad.push(`${width}: root ${read.rootPx}px, ${read.leaves} leaves`);
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
					`with a ${font.px}px default font ${route.path} keeps everything inside its leaves and does not scroll sideways at ${font.widths.join(', ')}px`,
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

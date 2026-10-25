// a11y-live.devbrowser.js - axe-core over every route of the built Worker in one theme.
// Runs in the dev-browser QuickJS sandbox under scripts/a11y-live.mjs, which stages axe-core as
// text, runs this driver once per theme, owns the verdict and sets the exit code.
//
// dev-browser-nav-guard: dynamic-ok the loop below only visits the literal URLs listed in AUDITS

// One entry per route and theme. The theme is forced through ?theme=, so every entry's data-theme
// check applies: a page that did not paint the theme it was asked for is not audited. A new route
// adds its two entries here, since both palettes reach every page through the desk bar. An entry
// expecting a status other than 200 says so; any other status still leaves the page unaudited.
const AUDITS = [
	{ slug: 'root', theme: 'light', url: 'http://127.0.0.1:8788/?theme=light' },
	{ slug: 'root', theme: 'dark', url: 'http://127.0.0.1:8788/?theme=dark' },
	// A list page has two layouts: from 721px (45em) the tender the list opens sits in a pane beside
	// the list ('split'), and up to 720px a phone shows the list alone, its filters folded behind one
	// button under 640px ('list'). So each list is audited in both layouts in both themes, the split
	// view at 1440px and the phone view at 390px. Each list entry names the width for its layout, and
	// the layout is read from the page, so a moved switch cannot audit one layout twice. A list with
	// no tender open opens none beside it, so the runner then expects its wide entry to show the list
	// alone (expectedListLayout in scripts/harness.mjs). The phone
	// entry takes no screenshots (shots: false), since its route and theme already have them, a 390px
	// width shot among them; the full-page shots are most of the run's time. Retired with the
	// redesign (PR #79): the table at 1440px and the cards at 1280px, as no width has a table now.
	{
		slug: 'tenders',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?theme=light',
		width: 1440,
		layout: 'split'
	},
	{
		slug: 'tenders',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?theme=light',
		width: 390,
		layout: 'list',
		shots: false
	},
	{
		slug: 'tenders',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?theme=dark',
		width: 1440,
		layout: 'split'
	},
	{
		slug: 'tenders',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?theme=dark',
		width: 390,
		layout: 'list',
		shots: false
	},
	{ slug: 'profile', theme: 'light', url: 'http://127.0.0.1:8788/profile?theme=light' },
	{ slug: 'profile', theme: 'dark', url: 'http://127.0.0.1:8788/profile?theme=dark' },
	// The tender page twice. The live one serves the newest capture, so it is reached by clicking the
	// list's first row (follow: 'first-row'), never by a typed notice number. The example capture's
	// notice with the most lots, which brings the lot index and one panel per lot, is reached by its
	// row on the example list (follow: 'example-probe'; 600457-2026 with 17 lots on 2026-09-15).
	{
		slug: 'tender-from-list',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?theme=light',
		follow: 'first-row'
	},
	{
		slug: 'tender-from-list',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?theme=dark',
		follow: 'first-row'
	},
	{
		slug: 'tender-17-lots',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example?theme=light',
		follow: 'example-probe',
		probe: 'mostLots'
	},
	{
		slug: 'tender-17-lots',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		follow: 'example-probe',
		probe: 'mostLots'
	},
	// A well-formed number no snapshot holds (no capture has a notice of 2099) takes the error page's
	// own notice branch, which the unknown path below never renders.
	{
		slug: 'unknown-notice',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders/999991-2099?theme=light',
		expectStatus: 404
	},
	{
		slug: 'unknown-notice',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders/999991-2099?theme=dark',
		expectStatus: 404
	},
	{
		slug: 'not-found',
		theme: 'light',
		url: 'http://127.0.0.1:8788/no-such-page?theme=light',
		expectStatus: 404
	},
	{
		slug: 'not-found',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/no-such-page?theme=dark',
		expectStatus: 404
	},
	// No captured deadline lies in 2099, so this filter ends in the empty state whichever capture
	// the live list serves.
	{
		slug: 'tenders-empty',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?country=BE&from=2099-01-01&theme=light',
		expectText: 'No tenders match these filters'
	},
	{
		slug: 'tenders-empty',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?country=BE&from=2099-01-01&theme=dark',
		expectText: 'No tenders match these filters'
	},
	{
		slug: 'profile-demo',
		theme: 'light',
		url: 'http://127.0.0.1:8788/profile?theme=light',
		storage: { 'pagefifty-active-firm': 'demo' },
		expectText: 'Brink Data B.V.'
	},
	{
		slug: 'profile-demo',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/profile?theme=dark',
		storage: { 'pagefifty-active-firm': 'demo' },
		expectText: 'Brink Data B.V.'
	},
	// The main nav names "Example run" on every page, so the example list is known by its closed
	// group, which only the example words against the capture time. The group's heading renders
	// whether or not any tender had closed (visually hidden when none had, as on the final capture),
	// which the e2e example driver holds to the page through a filter that leaves no closed row.
	{
		slug: 'example',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example?theme=light',
		expectText: 'Closed at the capture time',
		width: 1440,
		layout: 'split'
	},
	{
		slug: 'example',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example?theme=light',
		expectText: 'Closed at the capture time',
		width: 390,
		layout: 'list',
		shots: false
	},
	{
		slug: 'example',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		expectText: 'Closed at the capture time',
		width: 1440,
		layout: 'split'
	},
	{
		slug: 'example',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		expectText: 'Closed at the capture time',
		width: 390,
		layout: 'list',
		shots: false
	},
	// A one-lot notice with criteria in the notice (600017-2026 on 2026-09-15), reached by its row.
	{
		slug: 'example-one-lot',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example?theme=light',
		follow: 'example-probe',
		probe: 'oneLot'
	},
	{
		slug: 'example-one-lot',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		follow: 'example-probe',
		probe: 'oneLot'
	},
	// A lot the model read: its verdict, reason, state words, AI labels and the run record
	// (610242-2026 on 2026-09-15), reached by its row.
	{
		slug: 'example-verdict',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example?theme=light',
		follow: 'example-probe',
		probe: 'read'
	},
	{
		slug: 'example-verdict',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		follow: 'example-probe',
		probe: 'read'
	},
	// The AI page: the model facts from the run record, the limits and the compact run record.
	{
		slug: 'ai',
		theme: 'light',
		url: 'http://127.0.0.1:8788/ai?theme=light',
		expectText: 'Zero Data Retention'
	},
	{
		slug: 'ai',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/ai?theme=dark',
		expectText: 'Zero Data Retention'
	},
	// The privacy page: each processing step with its provider and source, and how the profile goes.
	{
		slug: 'privacy',
		theme: 'light',
		url: 'http://127.0.0.1:8788/privacy?theme=light',
		expectText: 'Cloudflare hosts the site'
	},
	{
		slug: 'privacy',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/privacy?theme=dark',
		expectText: 'Cloudflare hosts the site'
	},
	// The two example pages the README and the story send a reader to: the near miss, and the
	// criterion whose every quote was refused. Both are pinned to the 2026-10-22 example capture, so
	// an example capture without them fails here as a page that did not load, which is the cue to
	// pick the pages again with the story.
	{
		slug: 'example-713597',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example/713597-2026?theme=light',
		expectText: 'Quoted from TED notice 713597-2026'
	},
	{
		slug: 'example-713597',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example/713597-2026?theme=dark',
		expectText: 'Quoted from TED notice 713597-2026'
	},
	{
		slug: 'example-699142',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example/699142-2026?theme=light',
		expectText: 'Quoted from TED notice 699142-2026'
	},
	{
		slug: 'example-699142',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example/699142-2026?theme=dark',
		expectText: 'Quoted from TED notice 699142-2026'
	}
];

// The held-out visual checks (longest titles, the most lots, chip wrapping, the demo label at 390)
// are judged by a person from these shots; the automated run proves none of them.
const WIDTHS = [390, 768, 1440];
// A list page at phone width runs past 100,000 px; beyond this height a width shot keeps the first
// screens only, and the full page stays in the shot taken at the audit width.
const FULL_PAGE_LIMIT = 16000;

// axe "incomplete" means it could not decide, which is not clean. An entry here accepts one
// rule's undecided result only when every node's message matches and, where the entry names places,
// every node sits in one of them (runAxe's place), and says why.
const SCROLLED_OUT = 'scrolled out of the list column';
const CUT_BY_EDGE = 'cut by the list column edge';
const ACCEPTED_INCOMPLETE = [
	{
		rule: 'color-contrast',
		match: 'partially obscured by another element|too short to determine if it is actual text',
		places: [SCROLLED_OUT, CUT_BY_EDGE],
		why:
			'rows the list column has scrolled wholly or partly out of its visible box, where the head ' +
			'and the band sit over them on the screen, so axe composites the colours of whatever covers ' +
			'the row; the list alone at 390px draws every row in full, its closed group unfolded (the ' +
			'runner stops on one left folded), and a row inside the box stays undecided and fails'
	}
];

const config = JSON.parse(await readFile('pagefifty-a11y-run.json'));
const axeSource = await readFile(config.axeFile);
// Only the theme this run names. The runner refuses a run that audited none, fewer than its entries
// or another theme's, and a route list naming a theme it never runs.
const audits = AUDITS.filter((entry) => entry.theme === config.theme);
const PAGE = 'pagefifty-a11y';
const page = await browser.getPage(PAGE);
// axe runs at 1280 x 720, the browser's default size, and the width shots return to it. It is a
// fixed size rather than the page's current one: a run stopped during its width shots leaves this
// named page open at another width, and the next run would audit every page there. The only other
// width is one an entry names itself (the list entries above), and the entry records the width it
// was audited at.
const AUDIT_VIEWPORT = { width: 1280, height: 720 };
await page.setViewportSize(AUDIT_VIEWPORT);

// Storage is set on the origin before the audited page loads: addInitScript crashes this sandbox
// (probe A9 in plan 01-02). Every entry starts from empty storage, so one entry's demo firm never
// reaches the next.
async function prepareStorage(storage) {
	await page.goto('http://127.0.0.1:8788/', { waitUntil: 'networkidle' });
	await page.evaluate((items) => {
		localStorage.clear();
		for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
	}, storage ?? {});
}

// The theme switch marks its pressed button only once the app has started.
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';

// A click before the app has started is a full load of the tender page without ?theme=, which
// paints the stored or device theme and fails the data-theme check, so the row waits for hydration.
// The landing page is fetched again for the status the server gives its address.
async function followFirstRow() {
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const folded = await page.evaluate(() =>
		Boolean(document.querySelector('ul.rows > li[data-notice]')?.closest('details:not([open])'))
	);
	if (folded) await page.click('#closed summary');
	await page.click('ul.rows > li[data-notice] a.t');
	await page.waitForFunction(() => /^\/tenders\/\d+-\d{4}$/.test(location.pathname), null, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	await page.waitForLoadState('networkidle');
	return page.evaluate(async () => ({
		path: location.pathname,
		status: (await fetch(location.href)).status
	}));
}

// An example probe's notice (config.example, chosen from the build by scripts/a11y-live.mjs) is
// reached by clicking its row on the example list, the folded closed group opened first when the
// notice had closed at the capture instant, so the audit follows the example to any capture.
async function followExampleProbe(notice) {
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
	return page.evaluate(async () => ({
		path: location.pathname,
		status: (await fetch(location.href)).status
	}));
}

// The text a probe's page must show: the notice's title, or for the read notice the verdict word
// decided for the first lot the example read.
function probeText(probe) {
	if (probe === config.example.probes.read) {
		return probe.lotFacts.find((lot) => lot.verdict !== null).verdict;
	}
	return probe.title.replace(/\s+/g, ' ').trim();
}

async function loadState(entry) {
	await prepareStorage(entry.storage);
	const response = await page.goto(entry.url, { waitUntil: 'networkidle' });
	entry.status = response ? response.status() : 0;
	if (entry.follow === 'first-row' && entry.status === 200) {
		const landed = await followFirstRow();
		entry.followed = landed.path;
		entry.status = landed.status;
	}
	if (entry.follow === 'example-probe' && entry.status === 200) {
		const landed = await followExampleProbe(entry.notice);
		entry.followed = landed.path;
		entry.status = landed.status;
	}
	// A page reached from the example list keeps that list's serialized data, every row's title with
	// it, in a script in the body, so the expected text is looked for in the page without its scripts.
	const state = await page.evaluate(() => {
		const shown = document.body.cloneNode(true);
		shown.querySelectorAll('script').forEach((node) => node.remove());
		return {
			h1: document.querySelectorAll('h1').length,
			theme: document.documentElement.getAttribute('data-theme'),
			text: shown.textContent.replace(/\s+/g, ' ')
		};
	});
	entry.h1Count = state.h1;
	entry.themeApplied = state.theme;
	const problems = [];
	const expected = entry.expectStatus ?? 200;
	if (entry.status !== expected) problems.push(`status ${entry.status}, expected ${expected}`);
	if (state.h1 === 0) problems.push('no h1');
	if (entry.theme !== 'none' && state.theme !== entry.theme) {
		problems.push(`data-theme is "${state.theme}", expected "${entry.theme}"`);
	}
	if (entry.expectText && !state.text.includes(entry.expectText)) {
		problems.push(`"${entry.expectText}" is not on the page`);
	}
	if (entry.follow === 'example-probe' && entry.followed !== `/example/${entry.notice}`) {
		problems.push(
			`landed on ${entry.followed}, not the ${entry.probe} probe /example/${entry.notice}`
		);
	}
	return problems.join(', ');
}

async function widthShots(slug, theme) {
	const saved = [];
	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		await page.waitForTimeout(150);
		const height = await page.evaluate(() => document.documentElement.scrollHeight);
		const shot = await page.screenshot({ fullPage: height <= FULL_PAGE_LIMIT });
		saved.push(await saveScreenshot(shot, `a11y-${slug}-${theme}-${width}.png`));
	}
	await page.setViewportSize(AUDIT_VIEWPORT);
	return saved;
}

async function runAxe() {
	await page.evaluate(axeSource);
	return page.evaluate(
		async (places) => {
			const result = await window.axe.run(document, {
				runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
				// Named so it runs whether or not this axe version still ships it as experimental.
				rules: { 'target-size': { enabled: true } },
				// Each node comes back with its element, so its place on the screen is read below.
				elementRef: true
			});
			// Where a node sits against the list column, which scrolls on its own beside a tender: outside
			// it, inside its box, cut by the box's edge, or scrolled wholly out of the box, above or below.
			// A column that does not scroll (the list alone) holds every row inside it.
			const place = (element) => {
				const column = element?.closest('.list-col');
				if (!column) return 'outside the list column';
				if (getComputedStyle(column).overflowY === 'visible') return 'inside the list column';
				const view = column.getBoundingClientRect();
				const box = element.getBoundingClientRect();
				if (box.bottom <= view.top || box.top >= view.bottom) return places.scrolledOut;
				if (box.top < view.top || box.bottom > view.bottom) return places.cutByEdge;
				return 'inside the list column';
			};
			// A rule reports its failing checks under any, all or none, so every one of them is read.
			const messages = (node) =>
				[...node.any, ...node.all, ...node.none]
					.map((check) => check.message)
					.filter(Boolean)
					.join('; ');
			const shape = (items) =>
				items.map((item) => ({
					id: item.id,
					impact: item.impact,
					help: item.help,
					nodes: item.nodes.map((node) => ({
						target: node.target.join(' '),
						message: messages(node),
						place: place(node.element)
					}))
				}));
			const ran = result.passes.concat(result.violations, result.incomplete, result.inapplicable);
			return {
				violations: shape(result.violations),
				incomplete: shape(result.incomplete),
				targetSizeRan: ran.some((rule) => rule.id === 'target-size')
			};
		},
		{ scrolledOut: SCROLLED_OUT, cutByEdge: CUT_BY_EDGE }
	);
}

function isAccepted(item) {
	return ACCEPTED_INCOMPLETE.find(
		(accepted) =>
			accepted.rule === item.id &&
			item.nodes.every(
				(node) =>
					new RegExp(accepted.match, 'i').test(node.message) &&
					(!accepted.places || accepted.places.includes(node.place))
			)
	);
}

// How many of an accepted result's nodes sat in each place, so the report shows what was accepted.
function countPlaces(nodes) {
	const counts = {};
	for (const node of nodes) counts[node.place] = (counts[node.place] ?? 0) + 1;
	return counts;
}

// axe leaves a text's contrast undecided when it cannot composite what lies behind it: a picture, a
// gradient, or one element laid over another (the start page's text over its place picture, and the
// records floating over it). Those are decided from the painted pixels instead. Every text on the
// page turns transparent, a background image no taller than 4px is taken off (a drawn underline is
// one, and no stripe that thin can be the ground a text reads on), the node's box is captured, and
// each pixel in it is measured against the text's own colour. The worst pixel has to clear WCAG's
// floor: 3:1 for large text (24px, or 18.66px at weight 700), 4.5:1 for the rest. A colour that is
// not opaque rgb is left unmeasured, and an unmeasured node stays undecided.
const PAINT_HIDE = 'pagefifty-paint-hide';

async function measureNode(target) {
	const locator = page.locator(target).first();
	const style = await locator.evaluate((element, hideId) => {
		const css = getComputedStyle(element);
		const read = {
			color: css.color,
			size: parseFloat(css.fontSize),
			weight: Number(css.fontWeight)
		};
		// A constructed sheet, since the site's CSP (style-src 'self' and its nonce) refuses a style
		// element added by script, and a refused one would leave the text painted into the capture.
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(
			'*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; ' +
				'text-decoration-color: transparent !important; text-shadow: none !important; ' +
				'transition: none !important; animation: none !important; }'
		);
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
		window[hideId] = sheet;
		for (const each of document.querySelectorAll('*')) {
			const own = getComputedStyle(each);
			if (own.backgroundImage === 'none') continue;
			const height = own.backgroundSize.split(' ')[1] ?? '';
			if (height.endsWith('px') && parseFloat(height) <= 4) {
				each.setAttribute('data-paint-hidden', each.style.backgroundImage);
				each.style.backgroundImage = 'none';
			}
		}
		return read;
	}, PAINT_HIDE);
	try {
		const png = Array.from(await locator.screenshot());
		const worst = await page.evaluate(
			async ({ bytes, color }) => {
				const rgb = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(color);
				if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 1)) return null;
				const linear = Array.from({ length: 256 }, (_, value) => {
					const v = value / 255;
					return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
				});
				const luminance = (r, g, b) =>
					0.2126 * linear[Math.round(r)] +
					0.7152 * linear[Math.round(g)] +
					0.0722 * linear[Math.round(b)];
				const text = luminance(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
				const bitmap = await createImageBitmap(
					new Blob([new Uint8Array(bytes)], { type: 'image/png' })
				);
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const context = canvas.getContext('2d');
				context.drawImage(bitmap, 0, 0);
				const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
				let lowest = Infinity;
				for (let i = 0; i < data.length; i += 4) {
					const back = luminance(data[i], data[i + 1], data[i + 2]);
					lowest = Math.min(lowest, (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05));
				}
				return Number.isFinite(lowest) ? lowest : null;
			},
			{ bytes: png, color: style.color }
		);
		const large = style.size >= 24 || (style.size >= 18.66 && style.weight >= 700);
		return { target, worst, floor: large ? 3 : 4.5 };
	} finally {
		await page.evaluate((hideId) => {
			const sheet = window[hideId];
			document.adoptedStyleSheets = document.adoptedStyleSheets.filter((each) => each !== sheet);
			delete window[hideId];
			for (const each of document.querySelectorAll('[data-paint-hidden]')) {
				each.style.backgroundImage = each.getAttribute('data-paint-hidden');
				each.removeAttribute('data-paint-hidden');
			}
		}, PAINT_HIDE);
	}
}

// The measure has to be able to fail. Before any route, grey text over a grey picture (about 1.4:1)
// must measure under its floor and near-black text over a white one (about 19:1) over it; a run
// whose controls do not split that way accepts nothing by measure. The controls are laid over the
// start page itself, so they run under the same CSP and stylesheets as every node measured after.
const PIXEL_CONTROLS = `<div style="position:relative;width:400px">
<img alt="" style="position:absolute;inset:0;width:100%;height:100%" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23808080'/%3E%3C/svg%3E">
<p id="pixel-low" style="position:relative;margin:0;padding:8px;color:#999999;font:16px sans-serif">Grey over a grey picture</p></div>
<div style="position:relative;width:400px">
<img alt="" style="position:absolute;inset:0;width:100%;height:100%" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23ffffff'/%3E%3C/svg%3E">
<p id="pixel-high" style="position:relative;margin:0;padding:8px;color:#111111;font:16px sans-serif">Ink over a white picture</p></div>`;

async function provePixelMeasure() {
	await page.goto('http://127.0.0.1:8788/', { waitUntil: 'networkidle' });
	await page.evaluate((controls) => {
		const holder = document.createElement('div');
		holder.id = 'pixel-controls';
		holder.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:#ffffff';
		holder.innerHTML = controls;
		document.body.append(holder);
	}, PIXEL_CONTROLS);
	await page.waitForFunction(() =>
		[...document.querySelectorAll('#pixel-controls img')].every((img) => img.complete)
	);
	const low = await measureNode('#pixel-low');
	const high = await measureNode('#pixel-high');
	await page.evaluate(() => document.getElementById('pixel-controls')?.remove());
	const proven =
		low.worst !== null && high.worst !== null && low.worst < low.floor && high.worst >= high.floor;
	return { proven, low: low.worst, high: high.worst };
}

const ratio = (value) => (value === null ? 'unmeasured' : `${value.toFixed(2)}:1`);

// An undecided colour-contrast result the allowlist does not cover is accepted only when every node
// measures at or over its floor, with the readings and the controls in its reason; otherwise each
// node carries its reading into the report and the result stays undecided.
async function measuredContrast(item, controls) {
	if (item.id !== 'color-contrast') return null;
	const proof = `controls: grey on grey ${ratio(controls.low)}, ink on white ${ratio(controls.high)}`;
	if (!controls.proven) {
		for (const node of item.nodes) node.message += `; pixel measure not proven (${proof})`;
		return null;
	}
	const readings = [];
	for (const node of item.nodes) {
		const reading = await measureNode(node.target);
		node.message += `; painted pixels worst ${ratio(reading.worst)}, floor ${reading.floor}:1`;
		readings.push(reading);
	}
	if (!readings.every((reading) => reading.worst !== null && reading.worst >= reading.floor))
		return null;
	const list = readings
		.map((reading) => `${reading.target} ${ratio(reading.worst)} (floor ${reading.floor}:1)`)
		.join(', ');
	return `decided from the painted pixels behind each text, worst pixel per node: ${list}; ${proof}`;
}

// The list layout the audited page shows, read from its list column and tender pane: 'split' when
// the pane is drawn beside the column, 'list' when the column is drawn and the pane is absent or
// hidden (a phone's bare list), and any other arrangement in its own words, so a pane under the
// list or a hidden column matches neither layout and the runner stops on it. 'none' on a page
// without a list column. The group is the one whose rows were audited, the open list, or the closed
// one once no tender is open (after 9 Oct 2027 a note takes the open list's place); when only the
// closed group holds rows, it is opened here, so axe audits its rows and not a folded group. A phone
// entry (unfoldClosed) opens the closed group whatever the open one holds, as a visitor does with its
// summary, so the run decides every closed row's contrast at least once: the rows the column scrolls
// out of view beside a tender are accepted undecided on that ground. The closed group is reported as
// 'unfolded', 'folded' or 'none' for the runner's check.
function readLayout(unfoldClosed) {
	return page.evaluate((unfold) => {
		const split = document.querySelector('.split');
		const column = split?.querySelector('.list-col');
		if (!column) return { layout: 'none', group: null, closedGroup: 'none' };
		const open = column.querySelector('#open ul.rows');
		const closed = column.querySelector('#closed ul.rows');
		const details = closed?.closest('details');
		if (details && (!open || unfold)) details.open = true;
		let closedGroup = 'none';
		if (closed) closedGroup = details && !details.open ? 'folded' : 'unfolded';
		const drawn = (element) => Boolean(element) && getComputedStyle(element).display !== 'none';
		const pane = split.querySelector('.pane');
		let layout = 'pane under the list';
		if (!drawn(column)) layout = 'list column hidden';
		else if (!drawn(pane)) layout = 'list';
		else if (pane.getBoundingClientRect().left >= column.getBoundingClientRect().right - 0.5) {
			layout = 'split';
		}
		return { layout, group: open ? 'open' : closed ? 'closed' : null, closedGroup };
	}, unfoldClosed);
}

async function audit({
	slug,
	theme,
	url,
	expectStatus,
	expectText,
	storage,
	width,
	layout,
	shots,
	follow,
	probe
}) {
	const probed = probe === undefined ? null : config.example.probes[probe];
	const entry = {
		slug,
		theme,
		url,
		follow,
		probe,
		notice: probed?.notice,
		expectStatus,
		expectText: probed ? probeText(probed) : expectText,
		storage,
		layout,
		shots: shots !== false,
		width: width ?? AUDIT_VIEWPORT.width,
		violations: [],
		incomplete: [],
		acceptedIncomplete: [],
		widthShots: []
	};
	await page.setViewportSize({ width: entry.width, height: AUDIT_VIEWPORT.height });
	entry.loadProblem = await loadState(entry);
	entry.auditedWidth = await page.evaluate(() => innerWidth);
	const read = await readLayout(layout === 'list');
	entry.auditedLayout = read.layout;
	entry.auditedGroup = read.group;
	entry.auditedClosed = read.closedGroup;
	if (entry.loadProblem) {
		await page.setViewportSize(AUDIT_VIEWPORT);
		return entry;
	}
	const result = await runAxe();
	entry.violations = result.violations;
	entry.targetSizeRan = result.targetSizeRan;
	for (const item of result.incomplete) {
		const accepted = isAccepted(item);
		const why = accepted ? accepted.why : await measuredContrast(item, pixelControls);
		if (why) {
			entry.acceptedIncomplete.push({
				id: item.id,
				nodes: item.nodes.length,
				places: countPlaces(item.nodes),
				why
			});
		} else entry.incomplete.push(item);
	}
	if (!entry.shots) {
		await page.setViewportSize(AUDIT_VIEWPORT);
		return entry;
	}
	const shot = await page.screenshot({ fullPage: true });
	entry.screenshot = await saveScreenshot(shot, `a11y-${slug}-${theme}.png`);
	entry.widthShots = await widthShots(slug, theme);
	return entry;
}

const pages = [];
let pixelControls = { proven: false, low: null, high: null };
try {
	pixelControls = await provePixelMeasure();
	for (const entry of audits) pages.push(await audit(entry));
} finally {
	// The runner compares both with its own theme list and with the pages it gets back, so an entry
	// in a theme it never runs, or one this run skipped, cannot drop out unseen.
	const listedThemes = [...new Set(AUDITS.map((entry) => entry.theme))];
	await writeFile(
		config.resultName,
		JSON.stringify({
			driver: 'a11y-live',
			pages,
			entries: audits.length,
			listedThemes,
			pixelControls
		})
	);
	await browser.closePage(PAGE);
}

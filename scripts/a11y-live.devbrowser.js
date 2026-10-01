// a11y-live.devbrowser.js - axe-core over every route in every theme of the built Worker.
// Runs in the dev-browser QuickJS sandbox under scripts/a11y-live.mjs, which stages axe-core as
// text, owns the verdict and sets the exit code.
//
// dev-browser-nav-guard: dynamic-ok the loop below only visits the literal URLs listed in AUDITS

// One entry per route and theme. The theme is forced through ?theme=, so every entry's data-theme
// check applies: a page that did not paint the theme it was asked for is not audited. A new route
// adds its two entries here, since both palettes reach every page through the desk bar. An entry
// expecting a status other than 200 says so; any other status still leaves the page unaudited.
const AUDITS = [
	{ slug: 'root', theme: 'light', url: 'http://127.0.0.1:8788/?theme=light' },
	{ slug: 'root', theme: 'dark', url: 'http://127.0.0.1:8788/?theme=dark' },
	// A list is a table only above 1340px and cards at the audit width, so each list is audited as
	// the table in Light and as cards in Dark: both layouts meet axe, at no extra entry. The layout
	// each entry names is read from the page, so a moved switch cannot audit one layout twice.
	{
		slug: 'tenders',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?theme=light',
		width: 1440,
		layout: 'table'
	},
	{
		slug: 'tenders',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?theme=dark',
		layout: 'cards'
	},
	{ slug: 'profile', theme: 'light', url: 'http://127.0.0.1:8788/profile?theme=light' },
	{ slug: 'profile', theme: 'dark', url: 'http://127.0.0.1:8788/profile?theme=dark' },
	// The tender page twice: one lot with the face-down Documents leaf, then the capture's largest
	// notice, whose 17 lots bring the lot index and seventeen leaf tabs.
	{
		slug: 'tender-one-lot',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders/609955-2026?theme=light'
	},
	{
		slug: 'tender-one-lot',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders/609955-2026?theme=dark'
	},
	{
		slug: 'tender-17-lots',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders/600457-2026?theme=light'
	},
	{
		slug: 'tender-17-lots',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders/600457-2026?theme=dark'
	},
	// A well-formed number the snapshot does not hold takes the error page's own notice branch,
	// which the unknown path below never renders.
	{
		slug: 'unknown-notice',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders/999991-2026?theme=light',
		expectStatus: 404
	},
	{
		slug: 'unknown-notice',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders/999991-2026?theme=dark',
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
	// No Belgian notice in the capture is due in 2027, so this filter always ends in the empty state.
	{
		slug: 'tenders-empty',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?country=BE&from=2027-01-01&theme=light',
		expectText: 'No tenders match these filters'
	},
	{
		slug: 'tenders-empty',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?country=BE&from=2027-01-01&theme=dark',
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
	// group, which only the example words against the capture time.
	{
		slug: 'example',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example?theme=light',
		expectText: 'Closed at the capture time',
		width: 1440,
		layout: 'table'
	},
	{
		slug: 'example',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		expectText: 'Closed at the capture time',
		layout: 'cards'
	},
	{
		slug: 'example-one-lot',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example/609955-2026?theme=light',
		expectText: 'Example run from a snapshot'
	},
	{
		slug: 'example-one-lot',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example/609955-2026?theme=dark',
		expectText: 'Example run from a snapshot'
	}
];

// The held-out visual checks (longest titles, the most lots, chip wrapping, the demo label at 390)
// are judged by a person from these shots; the automated run proves none of them.
const WIDTHS = [390, 768, 1440];
// A list page at phone width runs past 100,000 px; beyond this height a width shot keeps the first
// screens only, and the full page stays in the shot taken at the audit width.
const FULL_PAGE_LIMIT = 16000;

// axe "incomplete" means it could not decide, which is not clean. An entry here accepts one
// rule's undecided result only when every node's message matches, and says why.
const ACCEPTED_INCOMPLETE = [];

const config = JSON.parse(await readFile('pagefifty-a11y-run.json'));
const axeSource = await readFile(config.axeFile);
const PAGE = 'pagefifty-a11y';
const page = await browser.getPage(PAGE);
// axe runs at the browser's own width, as before the width shots existed; they return to it. It is
// set before the first audit too, so a browser that reports no size of its own (null) still has
// every page audited at one width, never the first at another. The only other width is one an
// entry names itself (the list tables above), and the entry records the width it was audited at.
const AUDIT_VIEWPORT = page.viewportSize() ?? { width: 1280, height: 720 };
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

async function loadState(entry) {
	await prepareStorage(entry.storage);
	const response = await page.goto(entry.url, { waitUntil: 'networkidle' });
	entry.status = response ? response.status() : 0;
	const state = await page.evaluate(() => ({
		h1: document.querySelectorAll('h1').length,
		theme: document.documentElement.getAttribute('data-theme'),
		text: document.body.textContent.replace(/\s+/g, ' ')
	}));
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
	return page.evaluate(async () => {
		const result = await window.axe.run(document, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
			// Named so it runs whether or not this axe version still ships it as experimental.
			rules: { 'target-size': { enabled: true } }
		});
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
					message: messages(node)
				}))
			}));
		const ran = result.passes.concat(result.violations, result.incomplete, result.inapplicable);
		return {
			violations: shape(result.violations),
			incomplete: shape(result.incomplete),
			targetSizeRan: ran.some((rule) => rule.id === 'target-size')
		};
	});
}

function isAccepted(item) {
	return ACCEPTED_INCOMPLETE.find(
		(accepted) =>
			accepted.rule === item.id &&
			item.nodes.every((node) => new RegExp(accepted.match, 'i').test(node.message))
	);
}

// The list layout the audited page shows: 'table' or 'cards' by the open table's display, and
// 'none' on a page without a list table.
function readLayout() {
	return page.evaluate(() => {
		const table = document.querySelector('#open table.index');
		if (!table) return 'none';
		return getComputedStyle(table).display === 'table' ? 'table' : 'cards';
	});
}

async function audit({ slug, theme, url, expectStatus, expectText, storage, width, layout }) {
	const entry = {
		slug,
		theme,
		url,
		expectStatus,
		expectText,
		storage,
		layout,
		width: width ?? AUDIT_VIEWPORT.width,
		violations: [],
		incomplete: [],
		acceptedIncomplete: [],
		widthShots: []
	};
	await page.setViewportSize({ width: entry.width, height: AUDIT_VIEWPORT.height });
	entry.loadProblem = await loadState(entry);
	entry.auditedWidth = await page.evaluate(() => innerWidth);
	entry.auditedLayout = await readLayout();
	if (entry.loadProblem) {
		await page.setViewportSize(AUDIT_VIEWPORT);
		return entry;
	}
	const result = await runAxe();
	entry.violations = result.violations;
	entry.targetSizeRan = result.targetSizeRan;
	for (const item of result.incomplete) {
		const accepted = isAccepted(item);
		if (accepted) entry.acceptedIncomplete.push({ id: item.id, why: accepted.why });
		else entry.incomplete.push(item);
	}
	const shot = await page.screenshot({ fullPage: true });
	entry.screenshot = await saveScreenshot(shot, `a11y-${slug}-${theme}.png`);
	entry.widthShots = await widthShots(slug, theme);
	return entry;
}

const pages = [];
try {
	for (const entry of AUDITS) pages.push(await audit(entry));
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'a11y-live', pages }));
	await browser.closePage(PAGE);
}

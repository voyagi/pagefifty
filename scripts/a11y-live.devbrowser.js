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
	// A list is a table only above 1340px and cards at 1280px, so each list is audited in both
	// layouts in both themes: the cards hide the header row, so only a table entry checks its
	// contrast in that theme. Each list entry names the width for its layout, and the layout is read
	// from the page, so a moved switch cannot audit one layout twice. The second entry of a list in
	// a theme takes no screenshots (shots: false), since its route and theme already have them; the
	// full-page shots are most of the run's time.
	{
		slug: 'tenders',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?theme=light',
		width: 1440,
		layout: 'table'
	},
	{
		slug: 'tenders',
		theme: 'light',
		url: 'http://127.0.0.1:8788/tenders?theme=light',
		width: 1280,
		layout: 'cards',
		shots: false
	},
	{
		slug: 'tenders',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?theme=dark',
		width: 1280,
		layout: 'cards'
	},
	{
		slug: 'tenders',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/tenders?theme=dark',
		width: 1440,
		layout: 'table',
		shots: false
	},
	{ slug: 'profile', theme: 'light', url: 'http://127.0.0.1:8788/profile?theme=light' },
	{ slug: 'profile', theme: 'dark', url: 'http://127.0.0.1:8788/profile?theme=dark' },
	// The tender page twice. The live one serves the newest capture, so it is reached by clicking the
	// list's first row (follow: 'first-row'), never by a typed notice number. The 2026-09-15 capture's
	// largest notice, whose 17 lots bring the lot index and seventeen leaf tabs, is read on the
	// example, which stays on that capture.
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
		url: 'http://127.0.0.1:8788/example/600457-2026?theme=light'
	},
	{
		slug: 'tender-17-lots',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example/600457-2026?theme=dark'
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
		theme: 'light',
		url: 'http://127.0.0.1:8788/example?theme=light',
		expectText: 'Closed at the capture time',
		width: 1280,
		layout: 'cards',
		shots: false
	},
	{
		slug: 'example',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		expectText: 'Closed at the capture time',
		width: 1280,
		layout: 'cards'
	},
	{
		slug: 'example',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example?theme=dark',
		expectText: 'Closed at the capture time',
		width: 1440,
		layout: 'table',
		shots: false
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
	},
	// A lot the model read: its verdict, reason, state words, AI labels and the run record.
	{
		slug: 'example-verdict',
		theme: 'light',
		url: 'http://127.0.0.1:8788/example/610242-2026?theme=light',
		expectText: 'Ask first'
	},
	{
		slug: 'example-verdict',
		theme: 'dark',
		url: 'http://127.0.0.1:8788/example/610242-2026?theme=dark',
		expectText: 'Ask first'
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
		Boolean(document.querySelector('tbody tr[data-notice]')?.closest('details'))
	);
	if (folded) await page.click('#closed summary');
	await page.click('tbody tr[data-notice] a');
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

async function loadState(entry) {
	await prepareStorage(entry.storage);
	const response = await page.goto(entry.url, { waitUntil: 'networkidle' });
	entry.status = response ? response.status() : 0;
	if (entry.follow === 'first-row' && entry.status === 200) {
		const landed = await followFirstRow();
		entry.followed = landed.path;
		entry.status = landed.status;
	}
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

// The list layout the audited page shows, read from the open table, or from the closed one once no
// tender is open (after 9 Oct 2027 a note takes the open table's place): 'table' for display table,
// 'cards' for display block, any other display by its own name, so a hidden or broken table matches
// neither layout and the runner stops on it. 'none' on a page without a list table. When only the
// closed group holds rows, it is opened here, so axe audits the named layout and not a folded table.
function readLayout() {
	return page.evaluate(() => {
		const open = document.querySelector('#open table.index');
		const table = open ?? document.querySelector('#closed table.index');
		if (!table) return { layout: 'none', group: null };
		if (!open) {
			const details = table.closest('details');
			if (details) details.open = true;
		}
		const display = getComputedStyle(table).display;
		const layout =
			display === 'table' ? 'table' : display === 'block' ? 'cards' : `display ${display}`;
		return { layout, group: open ? 'open' : 'closed' };
	});
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
	follow
}) {
	const entry = {
		slug,
		theme,
		url,
		follow,
		expectStatus,
		expectText,
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
	const read = await readLayout();
	entry.auditedLayout = read.layout;
	entry.auditedGroup = read.group;
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
try {
	for (const entry of audits) pages.push(await audit(entry));
} finally {
	// The runner compares both with its own theme list and with the pages it gets back, so an entry
	// in a theme it never runs, or one this run skipped, cannot drop out unseen.
	const listedThemes = [...new Set(AUDITS.map((entry) => entry.theme))];
	await writeFile(
		config.resultName,
		JSON.stringify({ driver: 'a11y-live', pages, entries: audits.length, listedThemes })
	);
	await browser.closePage(PAGE);
}

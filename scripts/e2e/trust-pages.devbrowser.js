// trust-pages.devbrowser.js - the AI page on the built Worker: the model, region and providers the
// build recorded, the two limit sentences, the run record and the footer links on every page, read
// at every width of the shared sweep in Light and in Dark with no sideways scroll.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// dev-browser-nav-guard: dynamic-ok the loops below only visit the literal URLs listed in PAGES and FOOTER_PAGES

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-trust';
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

// The widths of the shared sweep, copied from scripts/e2e/tenders.devbrowser.js (its twin
// example.devbrowser.js holds the same list).
const WIDTHS = [320, 390, 721, 768, 1024, 1100, 1101, 1200, 1243, 1340, 1341, 1440];
const PROVIDERS = ['Nebius Token Factory', 'Tavily'];
const AI_LIMITS = [
	"A Go covers only the selection criteria read in the notice, never the exclusion grounds, the procurement documents or the buyer's shortlisting.",
	'Where a buyer names a category of references, staff or business lines, only the firm can judge whether its own match, so that criterion reads Ask first.'
];
const TRUST_LINKS = ['/ai'];

const PAGES = [
	{
		path: '/ai',
		light: 'http://127.0.0.1:8788/ai?theme=light',
		dark: 'http://127.0.0.1:8788/ai?theme=dark'
	}
];
const FOOTER_PAGES = [
	{ path: '/', url: 'http://127.0.0.1:8788/?theme=light', status: 200 },
	{ path: '/tenders', url: 'http://127.0.0.1:8788/tenders?theme=light', status: 200 },
	{ path: '/profile', url: 'http://127.0.0.1:8788/profile?theme=light', status: 200 },
	{ path: '/no-such-page', url: 'http://127.0.0.1:8788/no-such-page?theme=light', status: 404 }
];

function readPage() {
	return page.evaluate(() => {
		const squash = (text) => (text || '').replace(/\s+/g, ' ').trim();
		const facts = {};
		for (const element of document.querySelectorAll('[data-fact]')) {
			const name = element.getAttribute('data-fact');
			(facts[name] = facts[name] || []).push(squash(element.textContent));
		}
		const footer = document.querySelector('footer');
		return {
			theme: document.documentElement.getAttribute('data-theme'),
			body: squash(document.body.textContent),
			facts,
			runRecord: document.querySelectorAll('[data-run-record]').length,
			example: Array.from(document.querySelectorAll('main a[href]')).some(
				(link) => new URL(link.href).pathname === '/example'
			),
			footer: footer
				? Array.from(footer.querySelectorAll('a[href]')).map((link) => new URL(link.href).pathname)
				: null,
			leaves: document.querySelectorAll('.leaf').length,
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});
}

async function sweep(target, theme, url) {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(url);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const bad = [];
	let reads = 0;
	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		await page.waitForTimeout(50);
		const read = await readPage();
		reads += 1;
		if (read.theme !== theme || read.leaves === 0 || read.overflow > 0) {
			bad.push(`${width}: theme ${read.theme}, ${read.leaves} leaves, overflow ${read.overflow}`);
		}
	}
	check(
		`${target.path} in ${theme} paints its theme, holds its leaves and does not scroll sideways at every sweep width`,
		reads === WIDTHS.length && bad.length === 0,
		bad.length ? bad.join(' | ') : `${reads} of ${WIDTHS.length} widths read, all clean`
	);
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());
	const trust = config.trust;

	for (const target of PAGES) {
		await page.setViewportSize({ width: 1440, height: 900 });
		const response = await page.goto(target.light);
		await page.waitForSelector(HYDRATED, { timeout: 10000 });
		await saveScreenshot(
			await page.screenshot({ fullPage: true }),
			`pagefifty-trust${target.path.replace('/', '-')}-1440-light.png`
		);
		const read = await readPage();
		check(`${target.path} answers 200`, response.status() === 200, `status ${response.status()}`);
		const absent = PROVIDERS.filter((name) => !trust.providers.includes(name));
		check(
			`${target.path} names no provider the run record does not name`,
			absent.every((name) => !read.body.includes(name)),
			`absent from the run ${JSON.stringify(absent)}`
		);
		check(
			`${target.path} footer links the trust pages`,
			JSON.stringify(read.footer) === JSON.stringify(TRUST_LINKS),
			`footer ${JSON.stringify(read.footer)}`
		);
		if (target.path === '/ai') {
			check(
				'/ai names the model, region and provider of the newest reading run, byte for byte',
				JSON.stringify(read.facts.model) === JSON.stringify([trust.model]) &&
					JSON.stringify(read.facts.region) === JSON.stringify([trust.region]) &&
					JSON.stringify(read.facts.provider) === JSON.stringify([trust.providers[0]]),
				`model ${JSON.stringify(read.facts.model)}, region ${JSON.stringify(read.facts.region)}, provider ${JSON.stringify(read.facts.provider)}; run ${trust.model} ${trust.region}`
			);
			check(
				'/ai names the search provider only when the run searched',
				trust.providers.includes('Tavily')
					? JSON.stringify(read.facts['search-provider']) === JSON.stringify(['Tavily'])
					: read.facts['search-provider'] === undefined,
				`search provider ${JSON.stringify(read.facts['search-provider'])}, run providers ${JSON.stringify(trust.providers)}`
			);
			check(
				'/ai holds the two limit sentences, the run record, Zero Data Retention and the example link',
				AI_LIMITS.every((sentence) => read.body.includes(sentence)) &&
					read.runRecord === 1 &&
					read.body.includes('Zero Data Retention') &&
					read.example,
				`limits ${AI_LIMITS.map((sentence) => read.body.includes(sentence)).join(', ')}, run records ${read.runRecord}, example link ${read.example}`
			);
		}
		await sweep(target, 'light', target.light);
		await sweep(target, 'dark', target.dark);
	}

	// Positive control: an element far wider than the window must read as sideways scroll, or a
	// clean sweep above proves nothing.
	await page.setViewportSize({ width: 390, height: 900 });
	await page.goto(PAGES[0].light);
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const planted = await page.evaluate(() => {
		const plant = document.createElement('div');
		plant.textContent = 'planted';
		plant.style.width = '2000px';
		document.body.append(plant);
		return document.documentElement.scrollWidth - document.documentElement.clientWidth;
	});
	check(
		'the overflow read sees an element planted 2000px wide on /ai',
		planted > 0,
		`overflow ${planted}`
	);

	const footers = [];
	for (const each of FOOTER_PAGES) {
		await page.setViewportSize({ width: 1440, height: 900 });
		const response = await page.goto(each.url);
		const read = await readPage();
		footers.push({
			path: each.path,
			ok:
				response.status() === each.status &&
				JSON.stringify(read.footer) === JSON.stringify(TRUST_LINKS),
			detail: `${each.path} ${response.status()} ${JSON.stringify(read.footer)}`
		});
	}
	check(
		'every page carries the trust page links in its footer, the 404 included',
		footers.every((each) => each.ok),
		footers.map((each) => each.detail).join('; ')
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'trust-pages', checks }));
	await browser.closePage(PAGE);
}

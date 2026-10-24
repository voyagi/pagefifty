// trust-pages.devbrowser.js - the AI and privacy pages on the built Worker: the model, region and
// providers the build recorded, the two limit sentences, the run record, the processing statement,
// the contact address and complaint link, and the footer links on every page, each trust page read
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
const TRUST_LINKS = ['/privacy', '/ai'];
const PRIVACY_SENTENCES = [
	'Cloudflare hosts the site and serves its pages from its network.',
	'As data processor under its privacy policy, Cloudflare receives the technical data of each request, such as your IP address.',
	'The firm profile you enter is kept in this browser only, in its local storage, and is never sent to a server.',
	'No firm profile, contact or personal data is sent to the model or the search provider.',
	'On the firm profile page, Remove the stored profile deletes it from this browser after you confirm.',
	'The maintainer of Pagefifty is the controller of the personal data this site processes, and answers by email.',
	"The maintainer keeps no log of these requests, because the site's request logging at Cloudflare is switched off.",
	'You can also complain to a data protection authority: the Dutch one, the Autoriteit Persoonsgegevens, or the one in the EU country where you live or work.'
];
const CONTACT = 'mailto:pagefifty@taranity.com';
const AUTHORITY =
	'https://www.autoriteitpersoonsgegevens.nl/en/submitting-a-tip-off-or-a-complaint-to-the-ap';

const PAGES = [
	{
		path: '/ai',
		light: 'http://127.0.0.1:8788/ai?theme=light',
		dark: 'http://127.0.0.1:8788/ai?theme=dark'
	},
	{
		path: '/privacy',
		light: 'http://127.0.0.1:8788/privacy?theme=light',
		dark: 'http://127.0.0.1:8788/privacy?theme=dark'
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
			links: Array.from(document.querySelectorAll('main a[href]')).map((link) =>
				link.getAttribute('href')
			),
			footer: footer
				? Array.from(footer.querySelectorAll('a[href]')).map((link) => new URL(link.href).pathname)
				: null,
			panels: document.querySelectorAll('main .panel').length,
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
		if (read.theme !== theme || read.panels === 0 || read.overflow > 0) {
			bad.push(`${width}: theme ${read.theme}, ${read.panels} panels, overflow ${read.overflow}`);
		}
	}
	check(
		`${target.path} in ${theme} paints its theme, holds its panels and does not scroll sideways at every sweep width`,
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
		if (target.path === '/privacy') {
			const missing = PRIVACY_SENTENCES.filter((sentence) => !read.body.includes(sentence));
			check(
				'/privacy names each processing step and provider, what stays in the browser and how the profile is removed',
				missing.length === 0 &&
					JSON.stringify(read.facts.region) === JSON.stringify([trust.region]) &&
					JSON.stringify(read.facts.provider) === JSON.stringify([trust.providers[0]]),
				`missing ${JSON.stringify(missing)}, region ${JSON.stringify(read.facts.region)}, provider ${JSON.stringify(read.facts.provider)}`
			);
			const mail = read.links.filter((href) => href.startsWith('mailto:'));
			check(
				'/privacy gives one contact address, links the Dutch authority and no public issue page',
				JSON.stringify(mail) === JSON.stringify([CONTACT]) &&
					read.links.includes(AUTHORITY) &&
					!read.links.some((href) => href.includes('github.com')),
				`mail ${JSON.stringify(mail)}, links ${JSON.stringify(read.links)}`
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

// partner-line.devbrowser.js - the Article 63 line on a real lot (SPEC R6). The fixture firm (three
// completed years, every general net turnover 1 euro, every other field empty) is entered through
// the profile form, and the first notice of the live list with a lot that reads PARTNER NEEDED for
// it (config.partner, chosen from the build with the site's own rules by scripts/e2e.mjs) is reached
// by its row. That lot shows the PARTNER NEEDED word and the Article 63 line, the page holds no
// partner brief and no partner conditions, and no request leaves the site.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const partner = config.partner;
const PAGE = 'pagefifty-e2e-partner-line';
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

// The theme switch marks its pressed button only once the app has started.
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';
const SITE = '127.0.0.1:8788';
const OWN_FIRM = 'Compared with the firm profile kept in this browser.';
// What a partner brief or partner conditions would say; the page offers neither.
const BRIEF = /partner brief|partner conditions|commitment to provide|why a partner can close it/i;

const CHECKS = [
	'the profile form stores the fixture firm the partner probe was chosen for',
	'the partner probe lot shows the PARTNER NEEDED word and the Article 63 line',
	'the partner probe page holds no partner brief and no partner conditions',
	`the partner probe page makes no request to any host but ${SITE}`
];

// Keys in one order, so the stored profile and the probe's firm compare by content alone.
function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonical(value[key])])
		);
	}
	return value;
}

if (partner === null) {
	// No lot of the newest capture reads PARTNER NEEDED for the fixture firm, so the checks are
	// printed as not run, never as passed.
	for (const name of CHECKS) {
		checks.push({
			name: `${name} did not run: no lot of the newest capture reads PARTNER NEEDED for the fixture firm`,
			ok: true,
			didNotRun: true,
			detail: `no partner probe in ${config.latest.id}`
		});
	}
	await writeFile(config.resultName, JSON.stringify({ driver: 'partner-line', checks }));
} else {
	const page = await browser.getPage(PAGE);
	const captured = [];
	page.on('request', (request) => {
		captured.push(request.url());
	});
	try {
		await page.goto('http://127.0.0.1:8788/');
		await page.evaluate(() => localStorage.clear());

		await page.goto('http://127.0.0.1:8788/profile');
		await page.waitForSelector('#total-staff', { timeout: 10000 });
		for (const year of partner.years) {
			await page.getByLabel(String(year), { exact: true }).fill(partner.turnover);
		}
		await page.getByLabel('Completed financial years').fill('3');
		await page.waitForSelector('text=Saved in this browser', { timeout: 10000 });
		const stored = await page.evaluate(() => localStorage.getItem('pagefifty-profile') || '');
		let saved = null;
		try {
			saved = JSON.parse(stored).profile ?? null;
		} catch {
			saved = null;
		}
		const want = JSON.stringify(canonical(partner.profile));
		const got = JSON.stringify(canonical(saved));
		check(CHECKS[0], saved !== null && got === want, `stored ${got}; probe firm ${want}`);

		await page.goto('http://127.0.0.1:8788/tenders');
		await page.waitForSelector(HYDRATED, { timeout: 10000 });
		const group = await page.evaluate(
			(notice) =>
				document.querySelector(`tr[data-notice="${notice}"]`)?.closest('details')
					? 'closed'
					: 'open',
			partner.notice
		);
		if (group === 'closed') await page.click('#closed summary');
		const from = captured.length;
		await page.click(`tr[data-notice="${partner.notice}"] a`);
		await page.waitForFunction((path) => location.pathname === path, `/tenders/${partner.notice}`, {
			timeout: 10000
		});
		await page.waitForFunction(
			([anchor, line]) =>
				(document.querySelector(`#${anchor} [data-verdict]`)?.textContent ?? '').includes(line),
			[partner.anchor, OWN_FIRM],
			{ timeout: 10000 }
		);
		await page.waitForLoadState('networkidle');
		const shown = await page.evaluate((anchor) => {
			const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
			const region = document.querySelector(`#${anchor} [data-verdict]`);
			return {
				word: text(region?.querySelector('[data-verdict-word]')),
				region: text(region),
				page: text(document.body)
			};
		}, partner.anchor);

		check(
			CHECKS[1],
			shown.word === partner.word &&
				shown.region.includes(partner.article63) &&
				shown.region.includes(OWN_FIRM),
			`${partner.notice} ${partner.anchor}: word "${shown.word}", expected "${partner.word}"; Article 63 line ${shown.region.includes(partner.article63) ? 'shown' : 'missing'}; region "${shown.region.slice(0, 400)}"`
		);
		const brief = BRIEF.exec(shown.page);
		check(
			CHECKS[2],
			brief === null && shown.page.length > 200,
			`${partner.notice}: ${brief ? `found "${brief[0]}"` : `${shown.page.length} characters read`}`
		);
		const requests = captured.slice(from);
		const network = requests.filter((url) => /^https?:/.test(url));
		// The sandbox has no URL class, so the host is cut from the address by hand.
		const offSite = network.filter((url) => url.replace(/^https?:\/\//, '').split('/')[0] !== SITE);
		check(
			CHECKS[3],
			network.length > 0 && offSite.length === 0,
			`${partner.notice}: ${network.length} requests, off the site ${JSON.stringify(offSite)}`
		);
	} finally {
		await writeFile(config.resultName, JSON.stringify({ driver: 'partner-line', checks }));
		await browser.closePage(PAGE);
	}
}

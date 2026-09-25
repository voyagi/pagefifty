// smoke.devbrowser.js - the built Worker's entry page and a real 404 status.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-smoke';
const page = await browser.getPage(PAGE);
const checks = [];

try {
	// Named pages persist between runs. The app keeps its state in localStorage alone (the profile, by
	// the stack decision; no cookie, IndexedDB, cache or service worker), so that is cleared first. A
	// driver for a feature that adds another kind of state clears that too, or runs a fresh browser.
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	const entry = await page.goto('http://127.0.0.1:8788/');
	const lang = await page.evaluate(() => document.documentElement.lang);
	checks.push({
		name: 'entry page answers 200 with lang en',
		ok: entry.status() === 200 && lang === 'en',
		detail: `status ${entry.status()}, lang "${lang}"`
	});

	const unknown = await page.goto('http://127.0.0.1:8788/no-such-page');
	checks.push({
		name: 'unknown path answers 404',
		ok: unknown.status() === 404,
		detail: `status ${unknown.status()}`
	});
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'smoke', checks }));
	await browser.closePage(PAGE);
}

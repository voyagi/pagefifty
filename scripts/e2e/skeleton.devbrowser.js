// skeleton.devbrowser.js - the read path end to end: /tenders on the built Worker lists every
// notice of the tracked capture from the records the build wrote.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-skeleton';
const page = await browser.getPage(PAGE);
const checks = [];

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	const response = await page.goto('http://127.0.0.1:8788/tenders');
	checks.push({
		name: 'tenders list answers 200',
		ok: response.status() === 200,
		detail: `status ${response.status()}`
	});

	const facts = await page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll('tr[data-notice]'));
		const row = document.querySelector('tr[data-notice="609955-2026"]');
		const title = row ? row.querySelector('[lang]') : null;
		return {
			rows: rows.length,
			distinct: new Set(rows.map((each) => each.getAttribute('data-notice'))).size,
			titleText: title ? title.textContent.trim() : '',
			titleLang: title ? title.getAttribute('lang') : null,
			body: document.body.textContent
		};
	});

	checks.push({
		name: 'lists all 362 notices of the capture, each once',
		ok: facts.rows === 362 && facts.distinct === 362,
		detail: `${facts.rows} rows, ${facts.distinct} distinct notice numbers`
	});
	checks.push({
		name: 'row 609955-2026 shows its title in German with lang de',
		ok: facts.titleText.length > 0 && facts.titleLang === 'de',
		detail: `lang "${facts.titleLang}", title "${facts.titleText.slice(0, 60)}"`
	});
	checks.push({
		name: 'shows the capture line',
		ok: facts.body.includes('Snapshot captured from TED on 15 Sep 2026'),
		detail: facts.body.includes('Snapshot captured from TED')
			? 'capture line present'
			: 'no capture line in the page text'
	});
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'skeleton', checks }));
	await browser.closePage(PAGE);
}

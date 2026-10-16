// skeleton.devbrowser.js - the read path end to end: /tenders on the built Worker lists every
// notice of the newest built capture from the records the build wrote.
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
		const row = rows[0] || null;
		const title = row ? row.querySelector('[lang]') : null;
		return {
			rows: rows.length,
			distinct: new Set(rows.map((each) => each.getAttribute('data-notice'))).size,
			firstNotice: row ? row.getAttribute('data-notice') : null,
			titleText: title ? title.textContent.trim() : '',
			titleLang: title ? title.getAttribute('lang') : null,
			body: document.body.textContent
		};
	});

	const expectedRows = config.latest.rows;
	checks.push({
		name: 'lists every notice of the newest capture, each once',
		ok: facts.rows === expectedRows && facts.distinct === expectedRows,
		detail: `${facts.rows} rows, ${facts.distinct} distinct notice numbers, ${expectedRows} in the built index`
	});
	checks.push({
		name: "the first row's title carries its language",
		ok: facts.titleText.length > 0 && Boolean(facts.titleLang),
		detail: `row ${facts.firstNotice}, lang "${facts.titleLang}", title "${facts.titleText.slice(0, 60)}"`
	});
	const captureLine = `Snapshot captured from TED on ${config.latest.capturedOn}`;
	checks.push({
		name: "shows the capture line with the newest capture's day",
		ok: facts.body.includes(captureLine),
		detail: facts.body.includes(captureLine)
			? `"${captureLine}" present`
			: facts.body.includes('Snapshot captured from TED')
				? `a capture line without "${captureLine}"`
				: 'no capture line in the page text'
	});
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'skeleton', checks }));
	await browser.closePage(PAGE);
}

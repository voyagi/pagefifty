// defect.devbrowser.js - a driver whose one check is wrong on purpose. `node scripts/e2e.mjs
// --prove` runs it alone and passes only when this check fails, which shows the runner reports
// a failing check instead of reading every run as green.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-prove';
const page = await browser.getPage(PAGE);
const checks = [];

try {
	const unknown = await page.goto('http://127.0.0.1:8788/no-such-page');
	checks.push({
		name: 'planted: unknown path answers 200',
		ok: unknown.status() === 200,
		detail: `status ${unknown.status()}`
	});
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'prove-defect', checks }));
	await browser.closePage(PAGE);
}

// a11y-prove.devbrowser.js - the a11y driver's axe run pointed at one planted page, an image
// with no alt text, served by scripts/a11y-prove.mjs from a copy of the build on port 8789.
// The axe options match scripts/a11y-live.devbrowser.js; the sandbox cannot import, so they are
// repeated here.

const config = JSON.parse(await readFile('pagefifty-a11y-run.json'));
const axeSource = await readFile(config.axeFile);
const PAGE = 'pagefifty-a11y-prove';
const page = await browser.getPage(PAGE);
const entry = { slug: 'a11y-prove-defect', theme: 'light', violations: [] };

try {
	const response = await page.goto('http://127.0.0.1:8789/a11y-prove-defect.html', {
		waitUntil: 'networkidle'
	});
	entry.status = response ? response.status() : 0;
	const state = await page.evaluate(() => ({
		h1: document.querySelectorAll('h1').length,
		theme: document.documentElement.getAttribute('data-theme')
	}));
	if (entry.status !== 200 || state.h1 === 0 || state.theme !== entry.theme) {
		entry.loadProblem = `status ${entry.status}, ${state.h1} h1, data-theme "${state.theme}"`;
	} else {
		await page.evaluate(axeSource);
		entry.violations = await page.evaluate(async () => {
			const result = await window.axe.run(document, {
				runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
				rules: { 'target-size': { enabled: true } }
			});
			return result.violations.map((item) => ({
				id: item.id,
				help: item.help,
				targets: item.nodes.map((node) => node.target.join(' '))
			}));
		});
	}
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'a11y-prove', pages: [entry] }));
	await browser.closePage(PAGE);
}

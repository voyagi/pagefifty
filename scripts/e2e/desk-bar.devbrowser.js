// desk-bar.devbrowser.js - the header's layout on a phone and on a desk, measured in a real browser.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-desk-bar';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

async function measure() {
	return page.evaluate(() => {
		const box = (selector) => {
			const element = document.querySelector(selector);
			if (!element) return null;
			const rect = element.getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
		};
		return {
			bar: box('header.deskbar'),
			wordmark: box('header.deskbar a[href="/"]'),
			nav: box('nav[aria-label="Main"]'),
			theme: box('[role="group"][aria-label="Theme"]'),
			firm: box('[data-firm-slot]'),
			firmShown: getComputedStyle(document.querySelector('[data-firm-slot]')).display !== 'none',
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('http://127.0.0.1:8788/?theme=dark');
	await saveScreenshot(await page.screenshot(), 'pagefifty-desk-bar-390-dark.png');
	await page.goto('http://127.0.0.1:8788/?theme=light');
	await saveScreenshot(await page.screenshot(), 'pagefifty-desk-bar-390-light.png');
	const phone = await measure();
	check(
		'on a 390px phone the nav takes its own full-width row under the wordmark and switch',
		phone.nav.top >= phone.wordmark.bottom &&
			phone.nav.top >= phone.theme.bottom &&
			phone.nav.width >= phone.bar.width * 0.8 &&
			phone.overflow <= 0,
		`wordmark bottom ${phone.wordmark.bottom}, switch bottom ${phone.theme.bottom}, nav top ${phone.nav.top}, nav width ${phone.nav.width} of ${phone.bar.width}, overflow ${phone.overflow}`
	);
	check(
		'on a phone the own-firm slot is hidden and there is no menu toggle',
		!phone.firmShown &&
			(await page.evaluate(() => document.querySelectorAll('header [aria-expanded]').length)) === 0,
		`firm slot shown ${phone.firmShown}`
	);

	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('http://127.0.0.1:8788/?theme=light');
	await saveScreenshot(await page.screenshot(), 'pagefifty-desk-bar-1440-light.png');
	const desk = await measure();
	check(
		'on a 1440px desk the bar is one row with the firm slot at its two-line height',
		desk.nav.top < desk.wordmark.bottom &&
			desk.theme.top < desk.wordmark.bottom &&
			desk.firmShown &&
			desk.firm.height >= 37 &&
			desk.overflow <= 0,
		`wordmark ${desk.wordmark.top}-${desk.wordmark.bottom}, nav top ${desk.nav.top}, switch top ${desk.theme.top}, firm height ${desk.firm.height}, overflow ${desk.overflow}`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'desk-bar', checks }));
	await browser.closePage(PAGE);
}

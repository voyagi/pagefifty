// errors.devbrowser.js - the error pages on the built Worker: a real 404 with a way back, a skip
// link that lands, and a stranger's 300-character path echoed as text without sideways scroll.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-errors';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

async function read() {
	return page.evaluate(() => {
		const squash = (text) => (text || '').replace(/\s+/g, ' ').trim();
		const main = document.getElementById('main');
		const echo = document.querySelector('.path');
		return {
			title: document.title,
			h1: squash((document.querySelector('h1') || {}).textContent),
			mainTag: main ? main.tagName : null,
			echo: echo ? echo.textContent : null,
			echoChildren: echo ? echo.children.length : -1,
			pathname: location.pathname,
			tenders: Array.from(document.querySelectorAll('a[href="/tenders"]')).map((a) =>
				squash(a.textContent)
			),
			scrollWidth: document.documentElement.scrollWidth,
			clientWidth: document.documentElement.clientWidth
		};
	});
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	await page.setViewportSize({ width: 1440, height: 900 });
	const missing = await page.goto('http://127.0.0.1:8788/no-such-page?theme=light');
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-404-1440-light.png');
	const desk = await read();
	check('/no-such-page answers 404', missing.status() === 404, `status ${missing.status()}`);
	check(
		'the 404 is headed "No page at this address" under the 404 title',
		desk.h1 === 'No page at this address' && desk.title === 'Page not found - Pagefifty',
		`h1 "${desk.h1}", title "${desk.title}"`
	);
	check(
		'the 404 leads back to /tenders',
		desk.tenders.includes('Browse open tenders'),
		`links to /tenders: ${JSON.stringify(desk.tenders)}`
	);
	check(
		'the skip link target #main is the main element on the 404',
		desk.mainTag === 'MAIN',
		`#main is ${desk.mainTag}`
	);
	check(
		'the 404 echoes the requested path as text',
		desk.echo === '/no-such-page' && desk.echoChildren === 0,
		`echo "${desk.echo}", child elements ${desk.echoChildren}`
	);

	await page.goto('http://127.0.0.1:8788/no-such-page?theme=dark');
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-404-1440-dark.png');

	await page.setViewportSize({ width: 390, height: 844 });
	const long = await page.goto(
		'http://127.0.0.1:8788/abcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghijabcdefghi'
	);
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-404-390-long.png');
	const phone = await read();
	check(
		'a 300-character path answers 404 and is echoed whole as text',
		long.status() === 404 &&
			phone.pathname.length === 300 &&
			phone.echo === phone.pathname &&
			phone.echoChildren === 0,
		`status ${long.status()}, path length ${phone.pathname.length}, echo length ${(phone.echo || '').length}`
	);
	check(
		'at 390px the long path wraps with no sideways scroll',
		phone.clientWidth === 390 && phone.scrollWidth <= 390,
		`scroll width ${phone.scrollWidth}, client width ${phone.clientWidth}`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'errors', checks }));
	await browser.closePage(PAGE);
}

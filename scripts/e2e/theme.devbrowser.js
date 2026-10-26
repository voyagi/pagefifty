// theme.devbrowser.js - the theme is right before first paint, under the CSP, on the built Worker.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
//
// Probe A9 (plan 01-02): addInitScript crashes the sandbox and page.route hangs navigation, so no
// script here can watch the moment of first paint. "Before first paint" is proven by order and
// decision instead: the served HTML runs the nonce head script before any stylesheet link, the vm
// truth table in src/lib/theme/theme.test.ts proves what that script decides, and this driver
// checks the theme a real browser ends up with under each emulated colour scheme.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-theme';
const page = await browser.getPage(PAGE);
const checks = [];
const cspMessages = [];

page.on('console', (message) => {
	const text = message.text();
	if (/Content Security Policy/i.test(text)) cspMessages.push(text);
});

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

async function rootTheme() {
	return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

async function deskColour() {
	return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	const served = await page.evaluate(async () => {
		const response = await fetch('http://127.0.0.1:8788/');
		return { html: await response.text(), csp: response.headers.get('content-security-policy') };
	});
	const html = served.html;
	const firstScript = html.indexOf('<script');
	const headScript = html.slice(firstScript, html.indexOf('</script>', firstScript));
	const firstLink = html.indexOf('<link');
	const stylesheetLinks = html.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || [];
	const firstStylesheet = stylesheetLinks.length ? html.indexOf(stylesheetLinks[0]) : -1;
	check(
		'served HTML runs the nonce head script before every link and stylesheet',
		firstScript > -1 &&
			/nonce="[^"%]+"/.test(headScript) &&
			headScript.includes('pagefifty-theme') &&
			firstStylesheet > firstScript &&
			firstLink > firstScript,
		`first script at ${firstScript}, first link at ${firstLink}, first stylesheet at ${firstStylesheet}, ${stylesheetLinks.length} stylesheet links`
	);

	const csp = served.csp || '';
	const scriptSrc = (
		csp.split(';').find((part) => part.trim().startsWith('script-src ')) || ''
	).trim();
	const scriptNonce = (/nonce="([^"]+)"/.exec(headScript) || [])[1];
	check(
		'CSP header admits the head script by nonce and never unsafe-inline for scripts',
		/'nonce-[^']+'/.test(scriptSrc) &&
			!scriptSrc.includes('unsafe-inline') &&
			scriptSrc.includes(`'nonce-${scriptNonce}'`),
		`content-security-policy: ${csp}`
	);

	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('http://127.0.0.1:8788/');
	const darkTheme = await rootTheme();
	const darkDesk = await deskColour();
	check(
		'Device under an emulated dark scheme paints dark with the dark ground',
		darkTheme === 'dark' && darkDesk === 'rgb(13, 16, 15)',
		`data-theme "${darkTheme}", body background ${darkDesk}`
	);

	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('http://127.0.0.1:8788/');
	const lightTheme = await rootTheme();
	const lightDesk = await deskColour();
	check(
		'Device under an emulated light scheme paints light with the light ground',
		lightTheme === 'light' && lightDesk === 'rgb(255, 255, 255)',
		`data-theme "${lightTheme}", body background ${lightDesk}`
	);

	await page.evaluate(() => localStorage.setItem('pagefifty-theme', 'purple'));
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('http://127.0.0.1:8788/');
	const junkDark = await rootTheme();
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('http://127.0.0.1:8788/');
	const junkLight = await rootTheme();
	check(
		'a stored unknown value falls back to Device',
		junkDark === 'dark' && junkLight === 'light',
		`stored "purple": dark scheme "${junkDark}", light scheme "${junkLight}"`
	);
	await page.evaluate(() => localStorage.clear());

	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('http://127.0.0.1:8788/?theme=dark');
	const forced = await rootTheme();
	check(
		'?theme=dark under a light scheme paints dark',
		forced === 'dark',
		`data-theme "${forced}"`
	);

	// The live follow needs the runtime controller, so the switch has to have hydrated first: its
	// pressed button only appears once the controller is mounted.
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('http://127.0.0.1:8788/');
	await page.waitForSelector('[role="group"][aria-label="Theme"] [aria-pressed="true"]', {
		timeout: 10000
	});
	const pressed = await page.evaluate(() =>
		document.querySelector('[aria-label="Theme"] [aria-pressed="true"]').textContent.trim()
	);
	await page.evaluate(() => {
		window.__pagefiftySameView = true;
	});
	const beforeFlip = await rootTheme();
	await page.emulateMedia({ colorScheme: 'light' });
	await page.waitForFunction(
		() => document.documentElement.getAttribute('data-theme') === 'light',
		null,
		{ timeout: 5000 }
	);
	const afterFlip = await rootTheme();
	const sameView = await page.evaluate(() => window.__pagefiftySameView === true);
	check(
		'with Device active, flipping the emulated scheme flips the theme without a reload',
		pressed === 'Device' && beforeFlip === 'dark' && afterFlip === 'light' && sameView,
		`pressed "${pressed}", dark scheme "${beforeFlip}", light scheme "${afterFlip}", same page view ${sameView}`
	);

	await page.getByRole('button', { name: 'Dark', exact: true }).click();
	await page.emulateMedia({ colorScheme: 'light' });
	const picked = await rootTheme();
	const stored = await page.evaluate(() => localStorage.getItem('pagefifty-theme'));
	await page.goto('http://127.0.0.1:8788/');
	const afterReload = await rootTheme();
	check(
		'a click on Dark is stored and survives a reload under a light scheme',
		picked === 'dark' && stored === 'dark' && afterReload === 'dark',
		`after click "${picked}", stored "${stored}", after reload "${afterReload}"`
	);
	await page.evaluate(() => localStorage.clear());

	// Every route is loaded and hydrated once under the policy, so a violation only one page causes
	// (its serialised server data, a component's own style) reaches the listener too. The pressed
	// theme button appears only once the page has hydrated.
	const hydrated = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';
	await page.goto('http://127.0.0.1:8788/tenders');
	await page.waitForSelector(hydrated, { timeout: 10000 });
	await page.goto('http://127.0.0.1:8788/profile');
	await page.waitForSelector(hydrated, { timeout: 10000 });
	await page.waitForSelector('#total-staff', { timeout: 10000 });

	check(
		'no page logged a Content Security Policy violation on /, /tenders or /profile',
		cspMessages.length === 0,
		cspMessages.length ? cspMessages.join(' | ') : 'none'
	);

	// Positive control for the check above: an inline script added after load has no nonce, so the
	// policy must refuse it and the refusal must reach the console listener.
	const before = cspMessages.length;
	await page.evaluate(() => {
		const script = document.createElement('script');
		script.textContent = 'window.__pagefiftyInlineRan = true';
		document.head.append(script);
	});
	await page.waitForTimeout(300);
	const inlineRan = await page.evaluate(() => window.__pagefiftyInlineRan === true);
	check(
		'an inline script without the nonce is refused and the refusal is logged',
		!inlineRan && cspMessages.length > before,
		`ran ${inlineRan}, ${cspMessages.length - before} new CSP messages`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'theme', checks }));
	await browser.closePage(PAGE);
}

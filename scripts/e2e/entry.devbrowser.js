// entry.devbrowser.js - the entry page on the built Worker: the decided tagline, the purpose line,
// the capture count read from the tracked snapshot, and the ways on.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-entry';
const page = await browser.getPage(PAGE);
const checks = [];

const TAGLINE = "The rule your firm can't meet alone is on page fifty. Read it first.";
const PURPOSE =
	"Pagefifty checks whether your firm meets a tender's published selection criteria, and quotes each clause from the tender's own text with its source.";

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

async function read() {
	return page.evaluate(() => {
		const squash = (text) => (text || '').replace(/\s+/g, ' ').trim();
		const h1 = document.querySelector('h1');
		return {
			h1: squash(h1 && h1.textContent),
			h1Size: h1 ? getComputedStyle(h1).fontSize : '',
			body: squash(document.body.textContent),
			capture: squash((document.querySelector('.capture') || {}).textContent),
			// Where each link leads, not its raw text: the server writes relative links (./tenders) and
			// the started app rewrites them, so a raw read depends on whether hydration has finished.
			hrefs: Array.from(document.querySelectorAll('a[href]')).map((a) => new URL(a.href).pathname),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
		};
	});
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	await page.setViewportSize({ width: 1440, height: 900 });
	const response = await page.goto('http://127.0.0.1:8788/?theme=light');
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-entry-1440-light.png');
	const desk = await read();

	check('entry page answers 200', response.status() === 200, `status ${response.status()}`);
	check('the h1 is the decided tagline exactly', desk.h1 === TAGLINE, `h1 "${desk.h1}"`);
	check(
		'the purpose line is on the page',
		desk.body.includes(PURPOSE),
		desk.body.includes(PURPOSE) ? 'present' : 'missing'
	);
	const latest = config.latest;
	const counted =
		latest.rows === latest.total ? `${latest.rows}` : `${latest.rows} of the ${latest.total}`;
	const expectedCapture = latest.firstPublished
		? `Snapshot: ${counted} IT notices published from ${latest.firstPublished} that TED listed as active on ${latest.capturedOn}.`
		: `Snapshot: ${counted} IT notices TED listed as active on ${latest.capturedOn}.`;
	check(
		"the capture line gives the newest capture's served and TED counts, window and day",
		desk.capture === expectedCapture,
		`capture "${desk.capture}", expected "${expectedCapture}"`
	);
	check(
		'links lead to /tenders and /profile',
		desk.hrefs.includes('/tenders') && desk.hrefs.includes('/profile'),
		`hrefs ${JSON.stringify(desk.hrefs)}`
	);
	const promises = await page.evaluate(
		() => (document.querySelector('main .promises') || {}).textContent || ''
	);
	check(
		'says it is not legal advice',
		promises.includes('Not legal advice.'),
		promises.includes('Not legal advice.') ? 'present in the promises' : `promises "${promises}"`
	);
	// The first action opens the verdict of the tender the bare example list opens by itself, so the
	// button and the list's own pick are read from two pages and must name the same notice.
	const example = await page.evaluate(async () => {
		const link = Array.from(document.querySelectorAll('main a[href]')).find(
			(each) => each.textContent.trim() === 'Open the example verdict'
		);
		if (!link) return { path: null, status: 0 };
		return { path: new URL(link.href).pathname, status: (await fetch(link.href)).status };
	});
	await page.goto('http://127.0.0.1:8788/example');
	const listOpens = await page.evaluate(() => {
		const opened = document.querySelector('ul.rows a.t[aria-current]');
		return opened ? new URL(opened.href).pathname : null;
	});
	check(
		'"Open the example verdict" leads to the tender the example list opens, which answers 200',
		example.path !== null &&
			/^\/example\/\d+-\d{4}$/.test(example.path) &&
			example.path === listOpens &&
			example.status === 200,
		`path ${example.path}, status ${example.status}, /example opens ${listOpens}`
	);

	await page.goto('http://127.0.0.1:8788/?theme=dark');
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-entry-1440-dark.png');
	await page.setViewportSize({ width: 768, height: 1024 });
	await page.goto('http://127.0.0.1:8788/?theme=light');
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-entry-768-light.png');
	const tablet = await read();

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('http://127.0.0.1:8788/?theme=dark');
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-entry-390-dark.png');
	await page.goto('http://127.0.0.1:8788/?theme=light');
	await saveScreenshot(await page.screenshot({ fullPage: true }), 'pagefifty-entry-390-light.png');
	const phone = await read();

	// The tagline is clamp(step 3, 9vw, step 4), and at 390px the 9vw term is the one in force.
	const phoneSize = Number.parseFloat(phone.h1Size);
	check(
		'at 390px the tagline is 9vw (35.1px) and nothing scrolls sideways; at 768px nothing does either',
		Math.abs(phoneSize - 35.1) < 0.05 && phone.overflow <= 0 && tablet.overflow <= 0,
		`h1 ${phone.h1Size}, overflow 390 ${phone.overflow}, overflow 768 ${tablet.overflow}`
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'entry', checks }));
	await browser.closePage(PAGE);
}

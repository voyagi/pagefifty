// tender-page.devbrowser.js - the tender page on the built Worker: a notice's lots and criteria as
// published with their languages, the page reached from the list, and real 404s for unknown and
// malformed notice numbers, one at a time and in parallel.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.
//
// The run uses the real clock and every captured tender will have closed by the time the entry is
// judged, so no check here depends on a notice being open.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-tender-page';
const page = await browser.getPage(PAGE);
const checks = [];

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

// Page text outside the buyer's own words: notice text may contain any word, so it is left out
// before the page's own copy is searched for verdict words.
function readPage() {
	return page.evaluate(() => {
		const copy = document.body.cloneNode(true);
		copy.querySelectorAll('[data-notice-text]').forEach((node) => node.remove());
		const h1 = document.querySelector('h1');
		return {
			path: location.pathname,
			h1: h1 ? h1.textContent.trim() : '',
			h1Lang: h1 ? h1.getAttribute('lang') : null,
			quoteLangs: Array.from(document.querySelectorAll('blockquote')).map((quote) =>
				quote.getAttribute('lang')
			),
			body: document.body.textContent.replace(/\s+/g, ' '),
			ownCopy: copy.textContent.replace(/\s+/g, ' '),
			listLinks: document.querySelectorAll('main a[href="/tenders"]').length,
			title: document.title
		};
	});
}

async function notFound(path, answer) {
	const shown = await readPage();
	const worded =
		shown.h1 === 'No tender with this notice number' || shown.h1 === 'No page at this address';
	check(
		`${path} answers 404 with the not-found page and a link to /tenders`,
		answer.status() === 404 && worded && shown.listLinks > 0,
		`status ${answer.status()}, h1 "${shown.h1}", ${shown.listLinks} links to /tenders`
	);
}

const VERDICT_WORDS =
	/\b(GO|NO-GO|No-go|PARTNER NEEDED|Partner needed|ASK FIRST|Ask first|Out alone|Go)\b/;

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	const response = await page.goto('http://127.0.0.1:8788/tenders/609955-2026');
	const facts = await readPage();
	check(
		'/tenders/609955-2026 answers 200 with its German title',
		response.status() === 200 && facts.h1Lang === 'de' && facts.h1.length > 0,
		`status ${response.status()}, h1 lang ${facts.h1Lang}, title "${facts.title}"`
	);
	check(
		'every quote on 609955-2026 carries lang de',
		facts.quoteLangs.length === 6 && facts.quoteLangs.every((lang) => lang === 'de'),
		`${facts.quoteLangs.length} quotes, langs ${[...new Set(facts.quoteLangs)].join(' ')}`
	);
	check(
		'the page names the criteria as published and says it is not legal advice',
		facts.body.includes('Selection criteria as published') &&
			facts.body.includes('This is not legal advice.'),
		`criteria label ${facts.body.includes('Selection criteria as published')}, legal line ${facts.body.includes('This is not legal advice.')}`
	);
	const verdict = VERDICT_WORDS.exec(facts.ownCopy);
	check(
		'the page shows no verdict word in its own copy',
		verdict === null && facts.ownCopy.length > 200,
		verdict ? `found "${verdict[0]}"` : `${facts.ownCopy.length} characters of page copy read`
	);
	check(
		'the page title names the tender and its notice',
		facts.title.endsWith('(609955-2026) - Pagefifty'),
		`"${facts.title}"`
	);

	// The row a visitor would click, clicked; the landing page is then fetched again to read the
	// status the server gives that address.
	await page.goto('http://127.0.0.1:8788/tenders');
	await page.click('tr[data-notice="609955-2026"] a');
	await page.waitForFunction(() => location.pathname === '/tenders/609955-2026', null, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	const landed = await page.evaluate(async () => ({
		path: location.pathname,
		status: (await fetch(location.href)).status,
		h1: document.querySelector('h1').textContent.trim()
	}));
	check(
		"following 609955-2026's row link from /tenders lands on its page with 200",
		landed.path === '/tenders/609955-2026' && landed.status === 200 && landed.h1.length > 0,
		`path ${landed.path}, status ${landed.status}, h1 "${landed.h1.slice(0, 60)}"`
	);

	await notFound(
		'/tenders/000000-0000',
		await page.goto('http://127.0.0.1:8788/tenders/000000-0000')
	);
	await notFound('/tenders/%20', await page.goto('http://127.0.0.1:8788/tenders/%20'));
	await notFound('/tenders/12345', await page.goto('http://127.0.0.1:8788/tenders/12345'));

	const trailing = await page.goto('http://127.0.0.1:8788/tenders/');
	const list = await readPage();
	check(
		'/tenders/ with a trailing slash ends at the list with 200',
		trailing.status() === 200 && list.path === '/tenders' && list.h1 === 'Open IT tenders',
		`status ${trailing.status()}, path ${list.path}, h1 "${list.h1}"`
	);

	const parallel = await page.evaluate(() =>
		Promise.all(
			[
				'http://127.0.0.1:8788/tenders/000000-0001',
				'http://127.0.0.1:8788/tenders/000000-0002',
				'http://127.0.0.1:8788/tenders/000000-0003'
			].map(async (address) => {
				const answer = await fetch(address);
				const text = await answer.text();
				return {
					address,
					status: answer.status,
					worded: text.includes('No tender with this notice number')
				};
			})
		)
	);
	check(
		'three parallel requests for unknown notices each answer 404',
		parallel.length === 3 && parallel.every((each) => each.status === 404 && each.worded),
		parallel.map((each) => `${each.address} ${each.status} worded ${each.worded}`).join(', ')
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'tender-page', checks }));
	await browser.closePage(PAGE);
}

// tender-page.devbrowser.js - the tender page on the built Worker: a notice's lots and criteria as
// published with their languages, the page reached from the list, and real 404s for unknown and
// malformed notice numbers, one at a time and in parallel.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.
//
// The run uses the real clock, so the captured tenders close day by day (on 1 Dec 2026 two of the
// 363 are still open), and no check here depends on a notice being open.

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
			// The server writes relative hrefs ("../tenders") and hydration rewrites them, so the link is
			// matched by the address it resolves to, never by the attribute text.
			listLinks: Array.from(document.querySelectorAll('main a[href]')).filter(
				(link) => new URL(link.href).pathname === '/tenders'
			).length,
			title: document.title
		};
	});
}

// The parts of the tender page Task 2 adds, read from the rendered page.
function readTender() {
	return page.evaluate(() => {
		const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
		const links = {};
		document.querySelectorAll('main a[href^="http"]').forEach((link) => {
			links[text(link)] = link.getAttribute('href');
		});
		return {
			coverage: Array.from(document.querySelectorAll('.coverage')).map(text),
			strip: text(document.querySelector('.unread-strip')),
			links,
			documentsLeaf: Boolean(document.querySelector('section#documents')),
			documentsText: text(document.querySelector('section#documents')),
			foot: text(document.querySelector('.leaf-foot')),
			lotNote: text(document.querySelector('#lot-1'))
		};
	});
}

const NO_TENDER = 'No tender with this notice number';
const NO_PAGE = 'No page at this address';

// Each address names the heading it must get: a number, well formed or not, is named back as a
// notice; a blank one names nothing, so it reads as an unknown address.
async function notFound(path, answer, heading) {
	const shown = await readPage();
	check(
		`${path} answers 404 with "${heading}" and a link to /tenders`,
		answer.status() === 404 && shown.h1 === heading && shown.listLinks > 0,
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

	const tender = await readTender();
	check(
		'609955-2026 lists what was read and what was not, the pointer line included',
		tender.coverage.length === 1 &&
			tender.coverage[0].includes(
				'Read: 6 selection criteria published in the notice for this lot.'
			) &&
			tender.coverage[0].includes('Not read: the documents a criterion refers to.') &&
			tender.coverage[0].includes('Not compared: your firm profile.'),
		`${tender.coverage.length} coverage lists: ${tender.coverage.join(' | ').slice(0, 300)}`
	);
	check(
		'609955-2026 shows the unread strip, the TED link and the documents link as published',
		tender.strip.startsWith('Shown as published in the notice.') &&
			tender.links['Open notice on TED'] ===
				'https://ted.europa.eu/en/notice/-/detail/609955-2026' &&
			tender.links['Open the procurement documents'] ===
				'https://www.evergabe-online.de/tenderdocuments.html?id=887787',
		`strip "${tender.strip.slice(0, 40)}", links ${JSON.stringify(tender.links)}`
	);
	check(
		'609955-2026 ends with the face-down Documents leaf and the leaf foot naming the capture day',
		tender.documentsLeaf &&
			tender.foot ===
				"Criteria as published in TED notice 609955-2026. Source: TED, the EU's Tenders Electronic Daily, snapshot captured 15 Sep 2026. Not legal advice.",
		`documents leaf ${tender.documentsLeaf}, foot "${tender.foot}"`
	);
	const served = await page.evaluate(async () =>
		(await fetch('http://127.0.0.1:8788/tenders/609955-2026')).text()
	);
	check(
		'without scripts the served page holds the criteria, the coverage list and the Documents leaf',
		(served.match(/<blockquote/g) || []).length === 6 &&
			served.includes('What was read and what was not') &&
			served.includes('id="documents"'),
		`${(served.match(/<blockquote/g) || []).length} quotes, coverage ${served.includes('What was read and what was not')}, documents leaf ${served.includes('id="documents"')}`
	);
	check(
		'copy read for PLAW-09: 609955-2026, no verdict word in it',
		facts.ownCopy.length > 0 && VERDICT_WORDS.exec(facts.ownCopy) === null,
		facts.ownCopy
	);

	await page.goto('http://127.0.0.1:8788/tenders/600954-2026');
	const restricted = await readTender();
	check(
		'600954-2026 words its restricted documents link as access on request',
		restricted.links['Request access to the restricted procurement documents'] ===
			'https://app.tenpu.eu/public/tender/dps/1167' &&
			!('Open the procurement documents' in restricted.links),
		JSON.stringify(restricted.links)
	);

	await page.goto('http://127.0.0.1:8788/tenders/600367-2026');
	const documentsOnly = await readTender();
	const documentsCopy = await readPage();
	check(
		'600367-2026 says the procurement documents were not read and links them by name',
		documentsOnly.coverage[0].includes(
			'Not read: the procurement documents, which the buyer names as a source of criteria.'
		) &&
			documentsOnly.coverage[0].includes(
				'Read: the notice, which publishes no selection criteria for this lot.'
			) &&
			documentsOnly.lotNote.includes('This lot publishes no selection criteria in the notice.') &&
			documentsOnly.documentsLeaf,
		`${documentsOnly.coverage[0].slice(0, 200)}, documents leaf ${documentsOnly.documentsLeaf}`
	);
	check(
		'600367-2026 shows no criteria, so its Documents leaf points at none "shown above"',
		documentsOnly.documentsText.includes(
			'The notice itself publishes no selection criteria, and those sources may set some.'
		) && !documentsOnly.documentsText.includes('shown above'),
		`"${documentsOnly.documentsText.slice(0, 160)}"`
	);
	check(
		'copy read for PLAW-09: 600367-2026, no verdict word in it',
		documentsCopy.ownCopy.length > 0 && VERDICT_WORDS.exec(documentsCopy.ownCopy) === null,
		documentsCopy.ownCopy
	);

	// The row a visitor would click, clicked; the landing page is then fetched again to read the
	// status the server gives that address. Once its deadline has passed (6 Oct 2026) the row sits in
	// the closed group, folded shut, so the group is opened by its summary first, as a visitor would.
	await page.goto('http://127.0.0.1:8788/tenders');
	await page.waitForSelector('[role="group"][aria-label="Theme"] [aria-pressed="true"]', {
		timeout: 10000
	});
	const rowGroup = await page.evaluate(() =>
		document.querySelector('tr[data-notice="609955-2026"]')?.closest('details') ? 'closed' : 'open'
	);
	if (rowGroup === 'closed') await page.click('#closed summary');
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
		`row in the ${rowGroup} group; path ${landed.path}, status ${landed.status}, h1 "${landed.h1.slice(0, 60)}"`
	);

	await notFound(
		'/tenders/000000-0000',
		await page.goto('http://127.0.0.1:8788/tenders/000000-0000'),
		NO_TENDER
	);
	await notFound('/tenders/%20', await page.goto('http://127.0.0.1:8788/tenders/%20'), NO_PAGE);
	await notFound(
		'/tenders/12345',
		await page.goto('http://127.0.0.1:8788/tenders/12345'),
		NO_TENDER
	);

	// Well formed, so the real record lookup runs and misses: the one 404 the unit test reaches only
	// through a mocked reader.
	await notFound(
		'/tenders/999991-2026',
		await page.goto('http://127.0.0.1:8788/tenders/999991-2026'),
		NO_TENDER
	);
	const unknownLede = await page.evaluate(() =>
		document.querySelector('.lede').textContent.replace(/\s+/g, ' ').trim()
	);
	check(
		'/tenders/999991-2026 names the number back and the snapshot day',
		unknownLede.startsWith('Notice 999991-2026 is not in the 15 Sep 2026 snapshot.'),
		`"${unknownLede.slice(0, 90)}"`
	);

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

// tender-page.devbrowser.js - the tender page on the built Worker: a notice's lots and criteria as
// published with their languages, the page reached from the list, and real 404s for unknown and
// malformed notice numbers, one at a time and in parallel.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.
//
// The run uses the real clock, so the captured tenders close day by day, and no check here depends
// on a notice being open. The live routes serve the newest capture, so /tenders is reached through
// its first row's link, never a typed notice number. The checks about particular kinds of notice
// read them on /example, each the notice of the example capture with that property (config.example,
// chosen from the build by scripts/e2e.mjs), reached by its row.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const example = config.example;
const PAGE = 'pagefifty-e2e-tender-page';
const page = await browser.getPage(PAGE);
const checks = [];
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';

function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
}

// A check whose notice the example capture lacks is printed as one that did not run, never as a
// pass, and fails the run only when its probe is one the example must hold.
function didNotRun(name, probe) {
	checks.push({
		name: `${name} did not run: the example capture holds no ${probe} notice (${example.properties[probe]})`,
		ok: !example.required.includes(probe),
		didNotRun: true,
		detail: `no ${probe} probe in ${example.id}`
	});
}

// A notice of the example is reached by clicking its row on /example, opening the folded closed
// group first when the notice had closed at the capture instant. The landing page is fetched again
// for the status the server gives its address.
async function followExampleRow(notice) {
	await page.goto('http://127.0.0.1:8788/example');
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const folded = await page.evaluate(
		(number) =>
			Boolean(
				document.querySelector(`li[data-notice="${number}"]`)?.closest('details:not([open])')
			),
		notice
	);
	if (folded) await page.click('#closed summary');
	await page.click(`li[data-notice="${notice}"] a.t`);
	await page.waitForFunction((path) => location.pathname === path, `/example/${notice}`, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	await page.waitForLoadState('networkidle');
	return page.evaluate(async () => (await fetch(location.href)).status);
}

// The coverage list a lot shows, from the facts the build read for it, in the words of
// src/lib/core/reading.ts written a second time on purpose. A lot with a verdict drops the line
// about the firm profile, since its verdict compares the profile.
function coverageExpected(lot) {
	const facts = lot.coverage;
	const criteria = facts.criteriaInNotice;
	const lines = [
		criteria === 0
			? 'Read: the notice, which publishes no selection criteria for this lot.'
			: `Read: ${criteria === 1 ? '1 selection criterion' : `${criteria} selection criteria`} published in the notice for this lot.`
	];
	if (facts.namesDocuments) {
		lines.push(
			'Not read: the procurement documents, which the buyer names as a source of criteria.'
		);
	}
	if (facts.namesEspd) {
		lines.push('Not read: the ESPD, which the buyer names as a source of criteria.');
	}
	if (facts.sourceUnnamed) {
		lines.push(
			'Not read: any criteria outside the notice, which names no source of criteria this version can read for this lot.'
		);
	}
	if (facts.pointsToDocuments) lines.push('Not read: the documents a criterion refers to.');
	return { lines, profileLine: lot.verdict === null };
}

function coverageShows(shown, lot) {
	const { lines, profileLine } = coverageExpected(lot);
	return (
		lines.every((line) => shown.includes(line)) &&
		shown.includes('Not compared: your firm profile.') === profileLine
	);
}

const verdictsOf = (probe) =>
	probe.lotFacts.filter((lot) => lot.verdict !== null).map((lot) => lot.verdict);

// Page text outside the buyer's own words and outside the verdict regions: notice text may contain
// any word, and a lot the example read carries its verdict, so both are left out before the page's
// own copy is searched for verdict words. The verdict words are read on their own. Scripts are left
// out too: a page reached from the example list keeps that list's serialized data, every row's
// title with it, in a script in the body, which no reader sees.
function readPage() {
	return page.evaluate(() => {
		const copy = document.body.cloneNode(true);
		copy
			.querySelectorAll('[data-notice-text], [data-web-text], [data-verdict], script')
			.forEach((node) => node.remove());
		const h1 = document.querySelector('h1');
		// Beside the list the page holds two headings of the first rank, the list's and the tender's,
		// so the tender's title is read by its own id.
		const title = document.getElementById('tender-title');
		return {
			path: location.pathname,
			h1: h1 ? h1.textContent.trim() : '',
			tenderTitle: title ? title.textContent.trim() : '',
			tenderLang: title ? title.getAttribute('lang') : null,
			quoteLangs: Array.from(document.querySelectorAll('blockquote')).map((quote) =>
				quote.getAttribute('lang')
			),
			body: document.body.textContent.replace(/\s+/g, ' '),
			ownCopy: copy.textContent.replace(/\s+/g, ' '),
			verdictWords: Array.from(document.querySelectorAll('[data-verdict-word]')).map((word) =>
				word.textContent.replace(/\s+/g, ' ').trim()
			),
			// The server writes relative hrefs ("../tenders") and hydration rewrites them, so the link is
			// matched by the address it resolves to, never by the attribute text.
			listLinks: Array.from(document.querySelectorAll('main a[href]')).filter(
				(link) => new URL(link.href).pathname === '/tenders'
			).length,
			title: document.title
		};
	});
}

// The parts of the tender page Task 2 adds, read from the rendered page. The redesign dropped the
// section tabs: the main navigation marks the section a tender belongs to, and the record ends with
// its own foot line instead of a leaf foot.
function readTender() {
	return page.evaluate(() => {
		const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
		const links = {};
		document.querySelectorAll('main a[href^="http"]').forEach((link) => {
			links[text(link)] = link.getAttribute('href');
		});
		// Each lot labels its requirements: the clause that decides a lot with a verdict, the
		// requirements in this lot on any other.
		const labelled = Array.from(document.querySelectorAll('article.record > .panel[id^="lot-"]'))
			.map((lot) => text(lot.querySelector('.requirements')))
			.filter(
				(shown) =>
					shown.startsWith('The clause that decides') ||
					shown.startsWith('Requirements in this lot')
			).length;
		return {
			coverage: Array.from(document.querySelectorAll('.coverage')).map(text),
			strip: text(document.querySelector('.unread-strip')),
			links,
			section: text(document.querySelector('nav[aria-label="Main"] a[aria-current="true"]')),
			labelled,
			documentsPanel: Boolean(document.querySelector('section#documents')),
			documentsText: text(document.querySelector('section#documents')),
			foot: text(document.querySelector('.record-foot')),
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

	const documents = example.probes.documents;
	const status = await followExampleRow(documents.notice);
	const facts = await readPage();
	check(
		'the documents probe answers 200 with its title in its own language',
		status === 200 && facts.tenderLang === documents.language && facts.tenderTitle.length > 0,
		`${documents.notice}: status ${status}, tender title lang ${facts.tenderLang} of ${documents.language}, title "${facts.title}"`
	);
	check(
		'every quote on the documents probe carries the language of its clause',
		facts.quoteLangs.length > 0 &&
			JSON.stringify(facts.quoteLangs) === JSON.stringify(documents.quoteLangs),
		`${facts.quoteLangs.length} quotes of ${documents.quoteLangs.length}, langs ${[...new Set(facts.quoteLangs)].join(' ')}`
	);
	const verdict = VERDICT_WORDS.exec(facts.ownCopy);
	check(
		'the page shows no verdict word in its own copy, and a verdict only on each lot the example read',
		verdict === null &&
			facts.ownCopy.length > 200 &&
			JSON.stringify(facts.verdictWords) === JSON.stringify(verdictsOf(documents)),
		`${verdict ? `found "${verdict[0]}"` : `${facts.ownCopy.length} characters of page copy read`}, verdicts ${JSON.stringify(facts.verdictWords)} of ${JSON.stringify(verdictsOf(documents))}`
	);
	check(
		'the page title names the tender, its notice and the example run',
		facts.title.endsWith(`(${documents.notice}), example run - Pagefifty`),
		`"${facts.title}"`
	);

	const tender = await readTender();
	check(
		'every lot labels its requirements and the record foot says it is not legal advice',
		tender.labelled === documents.lots && tender.foot.endsWith('Not legal advice.'),
		`${tender.labelled} lots of ${documents.lots} labelled, foot "${tender.foot.slice(-40)}"`
	);
	check(
		'the documents probe lists what was read and what was not on each lot, every unread source named',
		tender.coverage.length === documents.lots &&
			documents.lotFacts.every((lot, index) => coverageShows(tender.coverage[index] ?? '', lot)),
		`${tender.coverage.length} coverage lists of ${documents.lots}, expected ${JSON.stringify(coverageExpected(documents.lotFacts[0]))}: ${tender.coverage.join(' | ').slice(0, 300)}`
	);
	// The unread strip says nothing on the page was compared with the firm, so it shows only on a
	// notice where no lot carries a verdict (TenderPage.svelte), and the documents probe may be one the
	// example read. When every probe carries a verdict, as on 2026-10-22, the strip's shown case rests
	// on LotVerdict.svelte.test.ts.
	const stripExpected = verdictsOf(documents).length === 0;
	check(
		'the documents probe shows the unread strip only when no lot carries a verdict, and the TED link and the documents link as published',
		(stripExpected
			? tender.strip.startsWith('Shown as published in the notice.')
			: tender.strip === '') &&
			tender.links['Open notice on TED'] ===
				`https://ted.europa.eu/en/notice/-/detail/${documents.notice}` &&
			tender.links['Open the procurement documents'] === documents.documents.href,
		`strip expected ${stripExpected}, strip "${tender.strip.slice(0, 40)}", links ${JSON.stringify(tender.links)}, documents ${documents.documents.href}`
	);
	check(
		'the documents probe sits under Example run in the nav and holds the Documents not read yet panel and the record foot naming the example snapshot day',
		tender.section === 'Example run' &&
			tender.documentsPanel &&
			tender.foot ===
				`Criteria as published in TED notice ${documents.notice}. Source: TED, the EU's Tenders Electronic Daily, snapshot captured ${example.capturedOn}. Not legal advice.`,
		`section "${tender.section}", documents panel ${tender.documentsPanel}, foot "${tender.foot}"`
	);
	// The page reached by its row is fetched again at its own address, as a browser with scripts off
	// receives it.
	const served = await page.evaluate(async () => (await fetch(location.href)).text());
	check(
		'without scripts the served page holds the criteria, the coverage list and the Documents not read yet panel',
		(served.match(/<blockquote/g) || []).length === documents.quoteLangs.length &&
			served.includes('What was read and what was not') &&
			served.includes('id="documents"'),
		`${(served.match(/<blockquote/g) || []).length} quotes of ${documents.quoteLangs.length}, coverage ${served.includes('What was read and what was not')}, documents panel ${served.includes('id="documents"')}`
	);
	check(
		'copy read for PLAW-09: the documents probe, no verdict word in it',
		facts.ownCopy.length > 0 && VERDICT_WORDS.exec(facts.ownCopy) === null,
		`${documents.notice}: ${facts.ownCopy}`
	);

	const RESTRICTED_CHECK =
		'the restricted probe words its restricted documents link as access on request';
	const restricted = example.probes.restricted;
	if (restricted === null) {
		didNotRun(RESTRICTED_CHECK, 'restricted');
	} else {
		await followExampleRow(restricted.notice);
		const shown = await readTender();
		check(
			RESTRICTED_CHECK,
			shown.links['Request access to the restricted procurement documents'] ===
				restricted.documents.href && !('Open the procurement documents' in shown.links),
			`${restricted.notice}: ${JSON.stringify(shown.links)}, documents ${restricted.documents.href}`
		);
	}

	const NO_CRITERIA_CHECKS = [
		'the no-criteria probe says the procurement documents were not read and links them by name',
		'the no-criteria probe shows no criteria, so its Documents not read yet panel points at none "shown above"',
		'copy read for PLAW-09: the no-criteria probe, no verdict word in it',
		'the no-criteria probe shows the unread strip exactly when none of its lots carries a verdict'
	];
	const noCriteria = example.probes.noCriteria;
	if (noCriteria === null) {
		for (const name of NO_CRITERIA_CHECKS) didNotRun(name, 'noCriteria');
	} else {
		await followExampleRow(noCriteria.notice);
		const documentsOnly = await readTender();
		const documentsCopy = await readPage();
		check(
			NO_CRITERIA_CHECKS[0],
			documentsOnly.coverage[0].includes(
				'Not read: the procurement documents, which the buyer names as a source of criteria.'
			) &&
				documentsOnly.coverage[0].includes(
					'Read: the notice, which publishes no selection criteria for this lot.'
				) &&
				documentsOnly.lotNote.includes('This lot publishes no selection criteria in the notice.') &&
				documentsOnly.documentsPanel,
			`${noCriteria.notice}: ${documentsOnly.coverage[0].slice(0, 200)}, documents panel ${documentsOnly.documentsPanel}`
		);
		check(
			NO_CRITERIA_CHECKS[1],
			documentsOnly.documentsText.includes(
				'The notice itself publishes no selection criteria, and those sources may set some.'
			) && !documentsOnly.documentsText.includes('shown above'),
			`${noCriteria.notice}: "${documentsOnly.documentsText.slice(0, 160)}"`
		);
		check(
			NO_CRITERIA_CHECKS[2],
			documentsCopy.ownCopy.length > 0 &&
				VERDICT_WORDS.exec(documentsCopy.ownCopy) === null &&
				JSON.stringify(documentsCopy.verdictWords) === JSON.stringify(verdictsOf(noCriteria)),
			`${noCriteria.notice}: verdicts ${JSON.stringify(documentsCopy.verdictWords)}, ${documentsCopy.ownCopy}`
		);
		const unverdicted = verdictsOf(noCriteria).length === 0;
		check(
			NO_CRITERIA_CHECKS[3],
			unverdicted
				? documentsOnly.strip.startsWith('Shown as published in the notice.')
				: documentsOnly.strip === '',
			`${noCriteria.notice}: ${verdictsOf(noCriteria).length} verdicts, strip "${documentsOnly.strip.slice(0, 60)}"`
		);
	}

	// The row a visitor would click, clicked; the landing page is then fetched again to read the
	// status the server gives that address. The first row sits in the closed group, folded shut, only
	// once no tender is open, so the group is then opened by its summary first, as a visitor would.
	await page.goto('http://127.0.0.1:8788/tenders');
	await page.waitForSelector('[role="group"][aria-label="Theme"] [aria-pressed="true"]', {
		timeout: 10000
	});
	const firstRow = await page.evaluate(() => {
		const row = document.querySelector('ul.rows > li[data-notice]');
		return row
			? {
					notice: row.getAttribute('data-notice'),
					group: row.closest('details') ? 'closed' : 'open'
				}
			: { notice: null, group: null };
	});
	if (firstRow.group === 'closed') await page.click('#closed summary');
	await page.click('ul.rows > li[data-notice] a.t');
	await page.waitForFunction((path) => location.pathname === path, `/tenders/${firstRow.notice}`, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	const landed = await page.evaluate(async () => ({
		path: location.pathname,
		status: (await fetch(location.href)).status,
		h1: document.querySelector('h1').textContent.trim()
	}));
	check(
		"following the first row's link from /tenders lands on that notice's page with 200",
		firstRow.notice !== null &&
			landed.path === `/tenders/${firstRow.notice}` &&
			landed.status === 200 &&
			landed.h1.length > 0,
		`row ${firstRow.notice} in the ${firstRow.group} group; path ${landed.path}, status ${landed.status}, h1 "${landed.h1.slice(0, 60)}"`
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
	// through a mocked reader. No capture holds a notice published in 2099.
	await notFound(
		'/tenders/999991-2099',
		await page.goto('http://127.0.0.1:8788/tenders/999991-2099'),
		NO_TENDER
	);
	const unknownLede = await page.evaluate(() =>
		document.querySelector('.lede').textContent.replace(/\s+/g, ' ').trim()
	);
	const unknownStart = `Notice 999991-2099 is not in the ${config.latest.capturedOn} snapshot.`;
	check(
		"/tenders/999991-2099 names the number back and the newest capture's day",
		unknownLede.startsWith(unknownStart),
		`"${unknownLede.slice(0, 90)}", expected to start "${unknownStart}"`
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

// verdict.devbrowser.js - the example pages the capture's model read: each lot's verdict and reason
// for the demo firm, one AI label per reading, the run record in its fixed order, no verdict word
// outside a verdict region, and no request to any host but the site's own, after hydration too.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.
//
// The pages are the example capture's first read notice and, when it holds one, a read notice in a
// second language (config.example, chosen from the build by scripts/e2e.mjs), each reached by its row
// on /example. Every expectation comes from the build too: each lot's verdict word and reason as
// decideLotStatus decides it for the demo firm at the capture instant, the reading count, and the
// readings run as RunRecord.svelte shows it.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const example = config.example;
const PAGE = 'pagefifty-e2e-verdict';
const page = await browser.getPage(PAGE);
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

// The theme switch marks its pressed button only once the app has started.
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';
const SITE = '127.0.0.1:8788';
const COMPARED = 'Compared with the demo firm, Brink Data B.V.';

const CHECKS = [
	'answers 200 with one verdict on each lot the example read, the word decided for the demo firm',
	'gives the reason decided for each lot and names the demo firm',
	'labels each of its readings as AI reading',
	"lists the run record in its fixed order with the run's values",
	'shows no verdict word outside a verdict region',
	`makes no request to any host but ${SITE}, after hydration too`
];
const PROBES = ['read', 'readOtherLanguage'];

const VERDICT_WORDS =
	/\b(GO|NO-GO|No-go|PARTNER NEEDED|Partner needed|ASK FIRST|Ask first|Not met alone|Out alone|Go)\b/;

const captured = [];
page.on('request', (request) => {
	captured.push(request.url());
});

// A notice of the example is reached by clicking its row on /example, the folded closed group
// opened first when the notice had closed at the capture instant; the landing page is fetched again
// for the status the server gives its address.
async function followExampleRow(notice) {
	await page.goto('http://127.0.0.1:8788/example');
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	const folded = await page.evaluate(
		(number) =>
			Boolean(
				document.querySelector(`tr[data-notice="${number}"]`)?.closest('details:not([open])')
			),
		notice
	);
	if (folded) await page.click('#closed summary');
	await page.click(`tr[data-notice="${notice}"] a.t`);
	await page.waitForFunction((path) => location.pathname === path, `/example/${notice}`, {
		timeout: 10000
	});
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	await page.waitForLoadState('networkidle');
	return page.evaluate(async () => (await fetch(location.href)).status);
}

function readVerdictPage() {
	return page.evaluate(() => {
		const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
		const lots = Array.from(document.querySelectorAll('[id^="lot-"]')).filter((leaf) =>
			/^lot-\d+$/.test(leaf.id)
		);
		// A page reached from the example list keeps that list's serialized data, every row's title
		// with it, in a script in the body, which no reader sees, so scripts are left out too.
		const outside = document.body.cloneNode(true);
		outside
			.querySelectorAll('[data-notice-text], [data-verdict], script')
			.forEach((node) => node.remove());
		const run = document.querySelector('section[data-run-record]');
		return {
			lots: lots.map((leaf) => {
				const words = leaf.querySelectorAll('[data-verdict-word]');
				const region = words.length === 1 ? words[0].closest('[data-verdict]') : null;
				return { words: words.length, word: text(words[0]), region: text(region) };
			}),
			labels: Array.from(document.querySelectorAll('.ai-label')).filter(
				(label) => text(label) === 'AI reading'
			).length,
			marked: document.querySelectorAll('[data-ai-generated]').length,
			record: run
				? Array.from(run.querySelectorAll('dt')).map((dt) => [
						text(dt),
						text(dt.nextElementSibling)
					])
				: [],
			outside: outside.textContent.replace(/\s+/g, ' ')
		};
	});
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	for (const name of PROBES) {
		const probe = example.probes[name];
		if (probe === null) {
			// A probe the example capture lacks leaves its checks printed as not run, never as passed,
			// and fails the run only when the example must hold one.
			for (const title of CHECKS) {
				checks.push({
					name: `the ${name} probe ${title} did not run: the example capture holds no ${name} notice (${example.properties[name]})`,
					ok: !example.required.includes(name),
					didNotRun: true,
					detail: `no ${name} probe in ${example.id}`
				});
			}
			continue;
		}
		const from = captured.length;
		const status = await followExampleRow(probe.notice);
		const shown = await readVerdictPage();
		const words = shown.lots.map(({ words, word }) => ({ words, word }));

		check(
			`the ${name} probe ${CHECKS[0]}`,
			status === 200 &&
				shown.lots.length === probe.lots &&
				probe.lotFacts.some((lot) => lot.verdict !== null) &&
				probe.lotFacts.every((lot, index) =>
					lot.verdict === null
						? words[index].words === 0
						: words[index].words === 1 && words[index].word === lot.verdict
				),
			`${probe.notice}: status ${status}, lots ${JSON.stringify(words)}, expected ${JSON.stringify(probe.lotFacts.map((lot) => lot.verdict))}`
		);
		check(
			`the ${name} probe ${CHECKS[1]}`,
			shown.lots.length === probe.lots &&
				probe.lotFacts.every(
					(lot, index) =>
						lot.verdict === null ||
						(shown.lots[index].region.includes(lot.reason) &&
							shown.lots[index].region.includes(COMPARED))
				),
			`${probe.notice}: ${shown.lots.map((lot) => lot.region.slice(0, 240)).join(' | ')}; expected ${JSON.stringify(probe.lotFacts.map((lot) => lot.reason))}`
		);
		check(
			`the ${name} probe ${CHECKS[2]}`,
			probe.readings > 0 && shown.labels === probe.readings && shown.marked === probe.readings,
			`${probe.notice}: ${shown.labels} labels, ${shown.marked} elements marked data-ai-generated, ${probe.readings} readings in the build`
		);
		check(
			`the ${name} probe ${CHECKS[3]}`,
			JSON.stringify(shown.record) === JSON.stringify(example.run),
			`${probe.notice}: ${JSON.stringify(shown.record)}`
		);
		const stray = VERDICT_WORDS.exec(shown.outside);
		check(
			`the ${name} probe ${CHECKS[4]}`,
			stray === null && shown.outside.length > 200,
			`${probe.notice}: ${stray ? `found "${stray[0]}"` : `${shown.outside.length} characters read`}`
		);
		const requests = captured.slice(from);
		const network = requests.filter((url) => /^https?:/.test(url));
		// The sandbox has no URL class, so the host is cut from the address by hand.
		const offSite = network.filter((url) => url.replace(/^https?:\/\//, '').split('/')[0] !== SITE);
		check(
			`the ${name} probe ${CHECKS[5]}`,
			network.length > 0 && offSite.length === 0,
			`${probe.notice}: ${network.length} requests, ${requests.length - network.length} not http, off the site ${JSON.stringify(offSite)}`
		);
	}
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'verdict', checks }));
	await browser.closePage(PAGE);
}

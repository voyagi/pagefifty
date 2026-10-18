// verdict.devbrowser.js - the two example pages the capture's model read: each lot's verdict and
// reason for the demo firm, one AI label per reading, the run record in its fixed order, no verdict
// word outside a verdict region, and no request to any host but the site's own, after hydration too.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-verdict';
const page = await browser.getPage(PAGE);
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

// The theme switch marks its pressed button only once the app has started.
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';
const SITE = '127.0.0.1:8788';

// The run of examples/2026-09-15/readings.json, as the records build serves it in reading-run.json,
// in the order of RUN_RECORD_FIELDS (src/lib/components/RunRecord.svelte).
const RUN_RECORD = [
	['Model', 'nvidia/nemotron-3-super-120b-a12b'],
	['Provider', 'Nebius Token Factory'],
	['Region', 'us-central1'],
	['Run date', '2026-10-15'],
	['Input tokens', '2,811'],
	['Output tokens', '2,563'],
	['Reasoning tokens', '0'],
	['Cost in USD', '0.003150'],
	['Quotes verified', '24'],
	['Quotes rejected', '0']
];

// The reasons the component tests pin for these two lots (src/lib/tenders/verdict-view.ts
// REASON_LINES): the German lot's references and staff are for the firm to judge, the Dutch lot's
// certificate is named in no form this version matches with a profile.
const PAGES = [
	{
		notice: '610242-2026',
		readings: 14,
		reason:
			'Only the firm can judge whether its references, staff or line of business fit what the buyer names.'
	},
	{
		notice: '634398-2026',
		readings: 10,
		reason: 'The buyer asks for a certificate this version cannot match by name with the profile.'
	}
];

const VERDICT_WORDS =
	/\b(GO|NO-GO|No-go|PARTNER NEEDED|Partner needed|ASK FIRST|Ask first|Not met alone|Out alone|Go)\b/;

const captured = [];
page.on('request', (request) => {
	captured.push(request.url());
});

function readVerdictPage() {
	return page.evaluate(() => {
		const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
		const lots = Array.from(document.querySelectorAll('[id^="lot-"]')).filter((leaf) =>
			/^lot-\d+$/.test(leaf.id)
		);
		const outside = document.body.cloneNode(true);
		outside.querySelectorAll('[data-notice-text], [data-verdict]').forEach((node) => node.remove());
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

	for (const expected of PAGES) {
		const from = captured.length;
		const answer =
			expected.notice === '610242-2026'
				? await page.goto('http://127.0.0.1:8788/example/610242-2026')
				: await page.goto('http://127.0.0.1:8788/example/634398-2026');
		await page.waitForSelector(HYDRATED, { timeout: 10000 });
		await page.waitForLoadState('networkidle');
		const shown = await readVerdictPage();
		const name = expected.notice;

		check(
			`/example/${name} answers 200 with one verdict per lot, Ask first`,
			answer.status() === 200 &&
				shown.lots.length > 0 &&
				shown.lots.every((lot) => lot.words === 1 && lot.word === 'Ask first'),
			`status ${answer.status()}, lots ${JSON.stringify(shown.lots.map(({ words, word }) => ({ words, word })))}`
		);
		check(
			`/example/${name} gives the reason the component tests pin and names the demo firm`,
			shown.lots.every(
				(lot) =>
					lot.region.includes(expected.reason) &&
					lot.region.includes('Compared with the demo firm, Brink Data B.V.')
			),
			shown.lots.map((lot) => lot.region.slice(0, 240)).join(' | ')
		);
		check(
			`/example/${name} labels each of its ${expected.readings} readings as AI reading`,
			shown.labels === expected.readings && shown.marked === expected.readings,
			`${shown.labels} labels, ${shown.marked} elements marked data-ai-generated`
		);
		check(
			`/example/${name} lists the run record in its fixed order with the run's values`,
			JSON.stringify(shown.record) === JSON.stringify(RUN_RECORD),
			JSON.stringify(shown.record)
		);
		const stray = VERDICT_WORDS.exec(shown.outside);
		check(
			`/example/${name} shows no verdict word outside a verdict region`,
			stray === null && shown.outside.length > 200,
			stray ? `found "${stray[0]}"` : `${shown.outside.length} characters read`
		);
		const requests = captured.slice(from);
		const network = requests.filter((url) => /^https?:/.test(url));
		// The sandbox has no URL class, so the host is cut from the address by hand.
		const offSite = network.filter((url) => url.replace(/^https?:\/\//, '').split('/')[0] !== SITE);
		check(
			`/example/${name} makes no request to any host but ${SITE}, after hydration too`,
			network.length > 0 && offSite.length === 0,
			`${network.length} requests, ${requests.length - network.length} not http, off the site ${JSON.stringify(offSite)}`
		);
	}
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'verdict', checks }));
	await browser.closePage(PAGE);
}

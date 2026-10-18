// canary.devbrowser.js - the profile never leaves the browser (SPEC R5, PROF-02). Every phase 1
// profile field is filled, the list, a tender page and the example are browsed, and every request
// the page sends (address, headers and body) is searched for the values typed. The markers go back
// to scripts/e2e.mjs as logMustNotContain, which searches the Worker's request log for them too.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Every address is a literal, as the navigation allowlist requires.
//
// Probe A9 (plan 01-02): page.on('request') is the only capture that works here. postData()
// throws in this sandbox, so bodies are read as base64 from postDataBuffer() and decoded below;
// page.route hangs the next goto, so it is not used.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-canary';
const page = await browser.getPage(PAGE);
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

// Only values of eight or more characters that occur nowhere else are searched for: short numbers
// and two-letter codes turn up in ordinary addresses and asset names ("de" sits inside
// "/_app/immutable/nodes/"). The completed financial years, the countries and the languages are
// filled but not searched for.
const thisYear = new Date().getFullYear();
const TURNOVER = [
	[thisYear - 3, '73104291'],
	[thisYear - 2, '73104292'],
	[thisYear - 1, '73104293']
];
const STAFF = '73119937';
const CERTIFICATE = 'pf-canary-7c1d';
const VALID_UNTIL = '2031-07-13';
const MARKERS = [...TURNOVER.map(([, value]) => value), STAFF, CERTIFICATE, VALID_UNTIL];
const PROBE = 'pf-probe-5e2a';
// The theme switch marks its pressed button only once the app has started.
const HYDRATED = '[role="group"][aria-label="Theme"] [aria-pressed="true"]';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Bytes to text, one byte per character: the markers are ASCII, so no marker can hide in a
// multi-byte sequence this reading splits.
function decodeBase64(text) {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const char of text.replace(/=+$/, '')) {
		const index = BASE64.indexOf(char);
		if (index < 0) continue;
		value = (value << 6) | index;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out += String.fromCharCode((value >> bits) & 0xff);
		}
	}
	return out;
}

const captured = [];
page.on('request', (request) => {
	let body = '';
	try {
		const buffer = request.postDataBuffer();
		if (buffer) body = decodeBase64(buffer.toString('base64'));
	} catch (error) {
		body = `unreadable body: ${error}`;
	}
	captured.push({
		method: request.method(),
		url: request.url(),
		headers: JSON.stringify(request.headers()),
		body
	});
});

function hitsIn(requests, needle) {
	return {
		url: requests.filter((request) => request.url.includes(needle)).length,
		headers: requests.filter((request) => request.headers.includes(needle)).length,
		body: requests.filter((request) => request.body.includes(needle)).length
	};
}

try {
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());

	// Positive controls: the capture must find a string where it was put, in the address, in a
	// header and in a body, before its silence about the markers means anything.
	await page.goto('http://127.0.0.1:8788/tenders?probe=pf-probe-5e2a');
	await page.evaluate(async () => {
		await fetch('http://127.0.0.1:8788/tenders', {
			method: 'POST',
			headers: { 'x-pf-probe': 'pf-probe-5e2a' },
			body: 'pf-probe-5e2a'
		});
	});
	const probe = hitsIn(captured, PROBE);
	check(
		'the capture finds a probe string in a request address, a header and a body',
		probe.url > 0 && probe.headers > 0 && probe.body > 0,
		`address ${probe.url}, header ${probe.headers}, body ${probe.body}`
	);
	const fromProfile = captured.length;

	const answer = await page.goto('http://127.0.0.1:8788/profile');
	await page.waitForSelector('#total-staff', { timeout: 10000 });
	for (const [year, value] of TURNOVER) {
		await page.getByLabel(String(year), { exact: true }).fill(value);
	}
	await page.getByLabel('Completed financial years').fill('7');
	await page.getByLabel('Total staff').fill(STAFF);
	await page.getByRole('button', { name: 'Add another' }).click();
	await page.getByLabel('Certificate name').fill(CERTIFICATE);
	await page.getByRole('button', { name: 'Add certificate' }).click();
	await page.getByLabel(`${CERTIFICATE} valid until`).fill(VALID_UNTIL);
	await page.getByLabel('Country of registration').selectOption('BE');
	await page.getByRole('checkbox', { name: 'Belgium' }).check();
	await page.getByRole('checkbox', { name: 'Germany' }).check();
	await page.getByRole('checkbox', { name: 'French' }).check();
	await page.waitForSelector('text=Saved in this browser', { timeout: 10000 });
	const stored = await page.evaluate(() => localStorage.getItem('pagefifty-profile') || '');
	check(
		'/profile answers 200 and every marker is saved in this browser',
		answer.status() === 200 && MARKERS.every((marker) => stored.includes(marker)),
		`status ${answer.status()}, missing from storage ${JSON.stringify(MARKERS.filter((marker) => !stored.includes(marker)))}`
	);

	const visited = [];
	const listed = await page.goto('http://127.0.0.1:8788/tenders');
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	visited.push(`/tenders ${listed.status()}`);
	// The live list serves the newest capture, so its tender page is reached by the link of the row
	// e2e.mjs picked from the built index, and the page is held to the facts written for that notice.
	const built = config.latest.probe;
	const builtPath = `/tenders/${built.notice}`;
	const builtGroup = await page.evaluate(
		(notice) =>
			document.querySelector(`tr[data-notice="${notice}"]`)?.closest('details') ? 'closed' : 'open',
		built.notice
	);
	if (builtGroup === 'closed') await page.click('#closed summary');
	await page.click(`tr[data-notice="${built.notice}"] a`);
	await page.waitForFunction((path) => location.pathname === path, builtPath, { timeout: 10000 });
	await page.waitForSelector('#tender-title', { timeout: 10000 });
	const shown = await page.evaluate(async () => {
		const term = (name) =>
			Array.from(document.querySelectorAll('dt')).find((dt) => dt.textContent.trim() === name);
		const value = (name) => {
			const dt = term(name);
			return dt && dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : '';
		};
		return {
			status: (await fetch(location.href)).status,
			notice: value('TED notice'),
			country: value('Country'),
			lots: Array.from(document.querySelectorAll('[id^="lot-"]')).filter((leaf) =>
				/^lot-\d+$/.test(leaf.id)
			).length
		};
	});
	visited.push(`${builtPath} ${shown.status}`);
	check(
		"a listed notice's page, reached from its row, shows the built index's number, lots and buyer country",
		shown.notice === built.notice &&
			shown.lots === built.lots &&
			shown.country === built.countries.join(', '),
		`notice "${shown.notice}", ${shown.lots} lots, country "${shown.country}"; built index: ${built.notice}, ${built.lots} lots, ${built.countries.join(', ')}`
	);
	// The last page computes a verdict in the browser, so its requests are searched for the markers
	// too: the verdict there is the demo firm's, and the stored profile must stay in storage.
	for (const url of [
		'http://127.0.0.1:8788/example',
		'http://127.0.0.1:8788/example/609955-2026',
		'http://127.0.0.1:8788/example/610242-2026'
	]) {
		const response = await page.goto(url);
		await page.waitForSelector('h1', { timeout: 10000 });
		visited.push(`${url.replace('http://127.0.0.1:8788', '')} ${response.status()}`);
	}
	// A client-side hop as well, so a request the started app makes is in the sample too. Before the
	// app starts the click is a full page load and samples nothing client-side, so the app must have
	// started, a flag set on the window (which a page load would drop) must survive the hop, and the
	// data request the router makes for the next page must be in the capture.
	await page.waitForSelector(HYDRATED, { timeout: 10000 });
	await page.evaluate(() => {
		window.pfCanaryHop = true;
	});
	const beforeHop = captured.length;
	await page.click('nav[aria-label="Main"] a[href$="/tenders"]');
	await page.waitForFunction(() => location.pathname === '/tenders', null, { timeout: 10000 });
	await page.waitForLoadState('networkidle');
	const hopKept = await page.evaluate(() => window.pfCanaryHop === true);
	const hopData = captured
		.slice(beforeHop)
		.filter(
			(request) => request.url.split('?')[0] === 'http://127.0.0.1:8788/tenders/__data.json'
		).length;

	const after = captured.slice(fromProfile);
	check(
		'the pages browsed answer 200 and requests were captured while they loaded',
		visited.every((line) => line.endsWith(' 200')) && after.length > 0,
		`${visited.join(', ')}; ${after.length} requests captured, ${after.filter((request) => request.method !== 'GET').length} not GET`
	);
	check(
		'the hop to /tenders from the main nav stays on the page and its data request is in the capture',
		hopKept && hopData > 0,
		`same page ${hopKept}, ${hopData} /tenders/__data.json requests captured`
	);
	const hits = MARKERS.map((marker) => ({ marker, ...hitsIn(after, marker) })).filter(
		(hit) => hit.url + hit.headers + hit.body > 0
	);
	check(
		'no captured request carries a profile marker in its address, headers or body',
		hits.length === 0,
		`${MARKERS.length} markers over ${after.length} requests, ${hits.length} hits ${JSON.stringify(hits)}`
	);
} finally {
	await writeFile(
		config.resultName,
		JSON.stringify({
			driver: 'canary',
			checks,
			logMustNotContain: MARKERS,
			// The probe POST is in the Worker's log by its method and path, which proves the log read
			// is this run's live log.
			logMustContain: ['POST /tenders', 'GET /profile']
		})
	);
	await browser.closePage(PAGE);
}

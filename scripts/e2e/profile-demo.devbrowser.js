// profile-demo.devbrowser.js - the demo firm and the header firm slot end to end: loading the demo
// never writes pagefifty-profile (the stored string is byte-identical before, during and after),
// the header names the demo firm on every page and fits a 390px phone, export stamps today's date,
// and a refusal with a 200-character file name wraps on a phone. Runs in the dev-browser QuickJS
// sandbox under scripts/e2e.mjs; see that file for the protocol.

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const PAGE = 'pagefifty-e2e-profile-demo';
const page = await browser.getPage(PAGE);
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

const readKey = () => page.evaluate(() => localStorage.getItem('pagefifty-profile'));
const slotText = () =>
	page.evaluate(() => {
		const slot = document.querySelector('[data-firm-slot]');
		return {
			tag: slot?.tagName ?? null,
			first: slot?.querySelector('strong')?.textContent.trim() ?? '',
			second: slot?.querySelector('.second')?.textContent.trim() ?? ''
		};
	});

// The label is filled once the browser has read storage, after hydration.
async function waitForSlot(first) {
	await page.waitForFunction(
		(expected) =>
			document.querySelector('[data-firm-slot] strong')?.textContent.trim() === expected,
		first,
		{ timeout: 10000 }
	);
	return slotText();
}

try {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('http://127.0.0.1:8788/');
	await page.evaluate(() => localStorage.clear());
	await page.goto('http://127.0.0.1:8788/profile');
	await page.waitForSelector('#total-staff', { timeout: 10000 });
	const lastYear = new Date().getFullYear() - 1;
	await page.getByLabel('Total staff').fill('23');
	await page.getByLabel(String(lastYear), { exact: true }).fill('980000');
	await page.waitForSelector('text=Saved in this browser', { timeout: 10000 });
	const own = await readKey();

	await page.getByRole('button', { name: 'Use the demo firm' }).click();
	await page.waitForSelector('h1:has-text("Brink Data B.V.")', { timeout: 10000 });
	const onProfile = await waitForSlot('Brink Data (demo firm)');
	const note = await page.evaluate(
		() => document.querySelector('.demo-note')?.textContent.trim() ?? ''
	);
	check(
		'the demo firm shows read-only under its label, with its footnote',
		onProfile.second === 'Invented figures' &&
			note === 'Brink Data B.V. is a demo firm. Every figure on this page is invented.' &&
			(await page.evaluate(() => document.querySelectorAll('main input').length)) === 0,
		`slot "${onProfile.first}" / "${onProfile.second}", note "${note}"`
	);

	const others = [];
	for (const url of ['http://127.0.0.1:8788/tenders', 'http://127.0.0.1:8788/']) {
		await page.goto(url);
		others.push({ url, slot: await waitForSlot('Brink Data (demo firm)') });
	}
	check(
		'the header names the demo firm on /profile, /tenders and /',
		others.every(({ slot }) => slot.tag === 'A' && slot.second === 'Invented figures'),
		others.map(({ url, slot }) => `${url} "${slot.first}"`).join(', ')
	);
	const during = await readKey();
	check(
		'pagefifty-profile is unchanged while the demo is active',
		during === own && own !== null,
		`same string: ${during === own}, length ${own === null ? 0 : own.length}`
	);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('http://127.0.0.1:8788/tenders');
	await waitForSlot('Brink Data (demo firm)');
	const phone = await page.evaluate(() => {
		const box = (element) => {
			const rect = element.getBoundingClientRect();
			return { left: rect.left, right: rect.right, top: rect.top, height: rect.height };
		};
		const label = document.querySelector('[data-firm-slot] strong');
		const second = document.querySelector('[data-firm-slot] .second');
		return {
			label: box(label),
			line: parseFloat(getComputedStyle(label).lineHeight),
			theme: box(document.querySelector('.theme')),
			wordmark: box(document.querySelector('.wordmark')),
			secondShown: getComputedStyle(second).display !== 'none',
			width: window.innerWidth,
			scroll: document.documentElement.scrollWidth
		};
	});
	await saveScreenshot(await page.screenshot(), 'pagefifty-desk-bar-390-demo.png');
	check(
		'at 390px the demo label and the theme switch are both fully inside the viewport',
		phone.label.left >= 0 &&
			phone.label.right <= phone.width &&
			phone.theme.left >= 0 &&
			phone.theme.right <= phone.width &&
			phone.scroll <= phone.width,
		`label ${Math.round(phone.label.left)} to ${Math.round(phone.label.right)}, theme ${Math.round(phone.theme.left)} to ${Math.round(phone.theme.right)}, scroll ${phone.scroll}`
	);
	check(
		'at 390px the demo label is one line, right after the wordmark, without its second line',
		phone.label.height <= phone.line * 1.5 &&
			phone.label.left >= phone.wordmark.right &&
			!phone.secondShown,
		`label height ${phone.label.height} (line ${phone.line}), label top ${Math.round(phone.label.top)}, wordmark top ${Math.round(phone.wordmark.top)}, theme top ${Math.round(phone.theme.top)}`
	);

	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('http://127.0.0.1:8788/profile');
	await page.getByRole('button', { name: 'Back to your own profile' }).click();
	await page.waitForSelector('#total-staff', { timeout: 10000 });
	const back = await page.evaluate(
		(year) => [
			document.getElementById('total-staff').value,
			document.getElementById(`turnover-${year}`).value
		],
		lastYear
	);
	const after = await readKey();
	check(
		'back on the own profile, pagefifty-profile is byte-identical and the own values show',
		after === own && back[0] === '23' && back[1] === '980000',
		`same string: ${after === own}, fields ${back.join(' and ')}`
	);

	await page.getByRole('button', { name: 'Export profile file' }).click();
	const today = await page.evaluate(() => {
		const months = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		];
		const now = new Date();
		return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
	});
	await page.waitForSelector(`text=Last exported: ${today}`, { timeout: 10000 });
	const exportSlot = await waitForSlot('Your firm');
	check(
		"export stamps today's date on the page and in the header",
		exportSlot.second === `Last exported: ${today}`,
		`header "${exportSlot.second}"`
	);

	// A refusal naming a 200-character file wraps on a phone; the file is handed to the input the
	// way a browser does after a pick.
	await page.setViewportSize({ width: 390, height: 844 });
	const refusal = await page.evaluate(async () => {
		const name = `${'a'.repeat(195)}.json`;
		const input = document.querySelector('input[type="file"]');
		const transfer = new DataTransfer();
		transfer.items.add(new File(['not json'], name, { type: 'application/json' }));
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		for (let tries = 0; tries < 50 && !document.querySelector('[role="alert"]'); tries += 1) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		const alert = document.querySelector('[role="alert"]');
		return {
			found: alert !== null,
			whole: alert !== null && alert.textContent.includes(name),
			right: alert === null ? 0 : alert.getBoundingClientRect().right,
			scroll: document.documentElement.scrollWidth
		};
	});
	await saveScreenshot(
		await page.screenshot({ fullPage: true }),
		'pagefifty-profile-refusal-390.png'
	);
	check(
		'at 390px a refusal with a 200-character file name wraps with no sideways scroll',
		refusal.found && refusal.whole && refusal.right <= 390 && refusal.scroll <= 390,
		`alert ${refusal.found}, name whole ${refusal.whole}, right edge ${Math.round(refusal.right)}, scroll ${refusal.scroll}`
	);
	check(
		'the refused file left pagefifty-profile as it was',
		(await readKey()) !== null && JSON.parse(await readKey()).profile.staff.total === 23,
		'staff total still 23'
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'profile-demo', checks }));
	await browser.closePage(PAGE);
}

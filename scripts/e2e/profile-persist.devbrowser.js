// profile-persist.devbrowser.js - the write path end to end: a figure typed on /profile is saved in
// this browser with no button and is there again in a second page of the same browser.
// Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the protocol.
// Named pages of one --browser instance share localStorage (probe A9 in plan 01-02).

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const FIRST = 'pagefifty-e2e-profile';
const SECOND = 'pagefifty-e2e-profile-again';
const first = await browser.getPage(FIRST);
const second = await browser.getPage(SECOND);
const checks = [];

try {
	await first.goto('http://127.0.0.1:8788/');
	await first.evaluate(() => localStorage.clear());

	const response = await first.goto('http://127.0.0.1:8788/profile');
	checks.push({
		name: 'profile page answers 200',
		ok: response.status() === 200,
		detail: `status ${response.status()}`
	});

	await first.waitForSelector('#total-staff', { timeout: 10000 });
	await first.fill('#total-staff', '19');
	await first.waitForSelector('text=Saved in this browser', { timeout: 10000 });
	const status = await first.textContent('[role="status"]');
	checks.push({
		name: 'typing 19 saves it with no button',
		ok: status.trim().startsWith('Saved in this browser at '),
		detail: `status "${status.trim()}"`
	});

	await second.goto('http://127.0.0.1:8788/profile');
	await second.waitForSelector('#total-staff', { timeout: 10000 });
	const shown = await second.evaluate(() => document.getElementById('total-staff').value);
	checks.push({
		name: 'a second page shows 19 in Total staff',
		ok: shown === '19',
		detail: `field reads "${shown}"`
	});

	const stored = await second.evaluate(() => localStorage.getItem('pagefifty-profile'));
	let parsed = null;
	try {
		parsed = JSON.parse(stored);
	} catch {
		parsed = null;
	}
	checks.push({
		name: 'pagefifty-profile holds schema version 1 with staff total 19',
		ok: parsed !== null && parsed.schemaVersion === 1 && parsed.profile.staff.total === 19,
		detail: `stored ${stored === null ? 'nothing' : stored.slice(0, 80)}`
	});
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'profile-persist', checks }));
	await browser.closePage(FIRST);
	await browser.closePage(SECOND);
}

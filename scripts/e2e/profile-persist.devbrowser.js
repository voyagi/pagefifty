// profile-persist.devbrowser.js - the write path end to end: every phase 1 profile field typed on
// /profile is saved in this browser with no button and is there again in a second page of the same
// browser. Runs in the dev-browser QuickJS sandbox under scripts/e2e.mjs; see that file for the
// protocol. Named pages of one --browser instance share localStorage (probe A9 in plan 01-02).

const config = JSON.parse(await readFile('pagefifty-e2e-run.json'));
const FIRST = 'pagefifty-e2e-profile';
const SECOND = 'pagefifty-e2e-profile-again';
const first = await browser.getPage(FIRST);
const second = await browser.getPage(SECOND);
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

// The form asks for the three years before the current one, from the browser's own clock.
const thisYear = new Date().getFullYear();
const YEARS = [thisYear - 3, thisYear - 2, thisYear - 1];
const TURNOVER = ['1090000', '1210000', '1240000'];
const LONG_NAME = `ISO ${'9'.repeat(76)}`;

async function readForm(page) {
	return page.evaluate(
		({ years }) => {
			const value = (id) => document.getElementById(id)?.value ?? null;
			const checked = (legend) =>
				[...document.querySelectorAll('fieldset')]
					.find((set) => set.querySelector('legend')?.textContent === legend)
					?.querySelectorAll('input:checked').length ?? 0;
			const pressed = [...document.querySelectorAll('[aria-label="Certificates held"] button')]
				.filter((chip) => chip.getAttribute('aria-pressed') === 'true')
				.map((chip) => chip.textContent.trim());
			return {
				turnover: years.map((year) => value(`turnover-${year}`)),
				average: value('turnover-average'),
				years: value('completed-years'),
				staff: value('total-staff'),
				country: value('registration-country'),
				until: value('certificate-until-0'),
				pressed,
				countries: checked('Countries you work in'),
				languages: checked('Languages your team works in'),
				exported: [...document.querySelectorAll('p')]
					.map((line) => line.textContent.trim())
					.find((line) => line.startsWith('Last exported:'))
			};
		},
		{ years: YEARS }
	);
}

try {
	await first.goto('http://127.0.0.1:8788/');
	await first.evaluate(() => localStorage.clear());

	const response = await first.goto('http://127.0.0.1:8788/profile');
	check('profile page answers 200', response.status() === 200, `status ${response.status()}`);

	await first.waitForSelector('#total-staff', { timeout: 10000 });
	for (const [index, year] of YEARS.entries()) {
		await first.getByLabel(String(year), { exact: true }).fill(TURNOVER[index]);
	}
	await first.getByLabel('Completed financial years').fill('6');
	await first.getByLabel('Total staff').fill('19');
	await first.getByRole('button', { name: 'ISO 27001' }).click();
	await first.getByLabel('ISO 27001 valid until').fill('2027-05-31');
	await first.getByLabel('Country of registration').selectOption('NL');
	await first.getByRole('checkbox', { name: 'Netherlands' }).check();
	await first.getByRole('checkbox', { name: 'Germany' }).check();
	await first.getByRole('checkbox', { name: 'Dutch' }).check();
	await first.waitForSelector('text=Saved in this browser', { timeout: 10000 });
	const status = await first.textContent('[role="status"]');
	check(
		'every field saves with no button',
		status.trim().startsWith('Saved in this browser at '),
		`status "${status.trim()}"`
	);

	await second.goto('http://127.0.0.1:8788/profile');
	await second.waitForSelector('#total-staff', { timeout: 10000 });
	const again = await readForm(second);
	check(
		'a second page shows the three turnover years and their average',
		again.turnover.join() === TURNOVER.join() && again.average === '1180000',
		`turnover ${again.turnover.join(' ')}, average ${again.average}`
	);
	check(
		'a second page shows completed financial years and total staff',
		again.years === '6' && again.staff === '19',
		`years ${again.years}, staff ${again.staff}`
	);
	check(
		'a second page shows the certificate with its valid-until date',
		again.pressed.join() === 'ISO 27001' && again.until === '2027-05-31',
		`pressed ${again.pressed.join(' ') || 'none'}, until ${again.until}`
	);
	check(
		'a second page shows the country of registration, the countries and the language',
		again.country === 'NL' && again.countries === 2 && again.languages === 1,
		`country ${again.country}, ${again.countries} countries, ${again.languages} languages`
	);
	check(
		'the page says the profile was never exported',
		again.exported === 'Last exported: never',
		`"${again.exported}"`
	);

	const stored = await second.evaluate(() => localStorage.getItem('pagefifty-profile'));
	let parsed = null;
	try {
		parsed = JSON.parse(stored);
	} catch {
		parsed = null;
	}
	check(
		'pagefifty-profile holds schema version 1 with the countries in the order ticked',
		parsed !== null &&
			parsed.schemaVersion === 1 &&
			parsed.profile.staff.total === 19 &&
			parsed.profile.countries.join() === 'NL,DE' &&
			parsed.profile.languages.join() === 'nl',
		`stored ${stored === null ? 'nothing' : stored.slice(0, 80)}`
	);

	// An 80-character certificate name wraps inside its chip at phone width and keeps a 44px target.
	await second.setViewportSize({ width: 390, height: 844 });
	await second.getByRole('button', { name: 'Add another' }).click();
	await second.getByLabel('Certificate name').fill(LONG_NAME);
	await second.getByRole('button', { name: 'Add certificate' }).click();
	const chip = await second.evaluate((name) => {
		const button = [...document.querySelectorAll('[aria-label="Certificates held"] button')].find(
			(candidate) => candidate.textContent.trim() === name
		);
		if (!button) return null;
		const box = button.getBoundingClientRect();
		const panel = button.closest('.panel').getBoundingClientRect();
		return {
			height: box.height,
			inside: box.left >= panel.left && box.right <= panel.right,
			scroll: document.documentElement.scrollWidth
		};
	}, LONG_NAME);
	check(
		'at 390px an 80-character certificate name wraps inside its chip, 44px or taller',
		chip !== null && chip.height >= 44 && chip.inside && chip.scroll <= 390,
		chip === null
			? 'chip not found'
			: `height ${chip.height}, inside ${chip.inside}, scroll width ${chip.scroll}`
	);
	await saveScreenshot(await second.screenshot({ fullPage: true }), 'pagefifty-profile-390.png');
	await second.setViewportSize({ width: 1440, height: 900 });
	await saveScreenshot(await second.screenshot({ fullPage: true }), 'pagefifty-profile-1440.png');
	await second.goto('http://127.0.0.1:8788/profile?theme=dark');
	await second.waitForSelector('#total-staff', { timeout: 10000 });
	await saveScreenshot(
		await second.screenshot({ fullPage: true }),
		'pagefifty-profile-1440-dark.png'
	);
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'profile-persist', checks }));
	await browser.closePage(FIRST);
	await browser.closePage(SECOND);
}

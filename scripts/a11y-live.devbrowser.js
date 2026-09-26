// a11y-live.devbrowser.js - axe-core over every route in every theme of the built Worker.
// Runs in the dev-browser QuickJS sandbox under scripts/a11y-live.mjs, which stages axe-core as
// text, owns the verdict and sets the exit code.
//
// dev-browser-nav-guard: dynamic-ok the loop below only visits the literal URLs listed in AUDITS

// One entry per route and theme. The theme is forced through ?theme=, so every entry's data-theme
// check applies: a page that did not paint the theme it was asked for is not audited. A new route
// adds its two entries here, since both palettes reach every page through the desk bar.
const AUDITS = [
	{ slug: 'root', theme: 'light', url: 'http://127.0.0.1:8788/?theme=light' },
	{ slug: 'root', theme: 'dark', url: 'http://127.0.0.1:8788/?theme=dark' },
	{ slug: 'tenders', theme: 'light', url: 'http://127.0.0.1:8788/tenders?theme=light' },
	{ slug: 'tenders', theme: 'dark', url: 'http://127.0.0.1:8788/tenders?theme=dark' },
	{ slug: 'profile', theme: 'light', url: 'http://127.0.0.1:8788/profile?theme=light' },
	{ slug: 'profile', theme: 'dark', url: 'http://127.0.0.1:8788/profile?theme=dark' }
];

// axe "incomplete" means it could not decide, which is not clean. An entry here accepts one
// rule's undecided result only when every node's message matches, and says why.
const ACCEPTED_INCOMPLETE = [];

const config = JSON.parse(await readFile('pagefifty-a11y-run.json'));
const axeSource = await readFile(config.axeFile);
const PAGE = 'pagefifty-a11y';
const page = await browser.getPage(PAGE);

async function loadState(entry) {
	const response = await page.goto(entry.url, { waitUntil: 'networkidle' });
	entry.status = response ? response.status() : 0;
	const state = await page.evaluate(() => ({
		h1: document.querySelectorAll('h1').length,
		theme: document.documentElement.getAttribute('data-theme')
	}));
	entry.h1Count = state.h1;
	entry.themeApplied = state.theme;
	const problems = [];
	if (entry.status !== 200) problems.push(`status ${entry.status}`);
	if (state.h1 === 0) problems.push('no h1');
	if (entry.theme !== 'none' && state.theme !== entry.theme) {
		problems.push(`data-theme is "${state.theme}", expected "${entry.theme}"`);
	}
	return problems.join(', ');
}

async function runAxe() {
	await page.evaluate(axeSource);
	return page.evaluate(async () => {
		const result = await window.axe.run(document, {
			runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
			// Named so it runs whether or not this axe version still ships it as experimental.
			rules: { 'target-size': { enabled: true } }
		});
		// A rule reports its failing checks under any, all or none, so every one of them is read.
		const messages = (node) =>
			[...node.any, ...node.all, ...node.none]
				.map((check) => check.message)
				.filter(Boolean)
				.join('; ');
		const shape = (items) =>
			items.map((item) => ({
				id: item.id,
				impact: item.impact,
				help: item.help,
				nodes: item.nodes.map((node) => ({
					target: node.target.join(' '),
					message: messages(node)
				}))
			}));
		const ran = result.passes.concat(result.violations, result.incomplete, result.inapplicable);
		return {
			violations: shape(result.violations),
			incomplete: shape(result.incomplete),
			targetSizeRan: ran.some((rule) => rule.id === 'target-size')
		};
	});
}

function isAccepted(item) {
	return ACCEPTED_INCOMPLETE.find(
		(accepted) =>
			accepted.rule === item.id &&
			item.nodes.every((node) => new RegExp(accepted.match, 'i').test(node.message))
	);
}

async function audit({ slug, theme, url }) {
	const entry = { slug, theme, url, violations: [], incomplete: [], acceptedIncomplete: [] };
	entry.loadProblem = await loadState(entry);
	if (entry.loadProblem) return entry;
	const result = await runAxe();
	entry.violations = result.violations;
	entry.targetSizeRan = result.targetSizeRan;
	for (const item of result.incomplete) {
		const accepted = isAccepted(item);
		if (accepted) entry.acceptedIncomplete.push({ id: item.id, why: accepted.why });
		else entry.incomplete.push(item);
	}
	const shot = await page.screenshot({ fullPage: true });
	entry.screenshot = await saveScreenshot(shot, `a11y-${slug}-${theme}.png`);
	return entry;
}

const pages = [];
try {
	for (const entry of AUDITS) pages.push(await audit(entry));
} finally {
	await writeFile(config.resultName, JSON.stringify({ driver: 'a11y-live', pages }));
	await browser.closePage(PAGE);
}

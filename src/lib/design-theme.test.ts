// The design mockups' theme switch is the reference for THEME-01. Two code paths decide the theme
// there: the inline head script (first paint) and design/assets/theme.js (after load). These tests
// run both against a stand-in browser and hold them to the same rules.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';

const CHOICES = ['light', 'dark', 'device'] as const;
type Choice = (typeof CHOICES)[number];
const KEY = 'pagefifty-theme';
const PAGES = ['home', 'profile', 'states', 'tenders', 'verdict'];
const THEME_SCRIPT = readFileSync('design/assets/theme.js', 'utf8');
const STYLESHEET = readFileSync('design/assets/pagefifty.css', 'utf8');

// The declarations inside the first rule whose selector line matches, one per entry.
function declarations(selector: RegExp): string[] {
	const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(STYLESHEET);
	if (!match) throw new Error(`design/assets/pagefifty.css has no rule matching ${selector}`);
	return match[1]
		.split(';')
		.map((line) => line.trim())
		.filter(Boolean);
}

function headScript(page: string): string {
	const html = readFileSync(`design/${page}.html`, 'utf8');
	const match = /<head>[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html);
	if (!match) throw new Error(`design/${page}.html has no inline head script`);
	return match[1];
}

type Listener = (event: Record<string, unknown>) => void;

interface Setup {
	query?: string | null;
	stored?: string | null;
	storageThrows?: boolean;
	osDark?: boolean;
	// A deferred script runs once parsing is done, so 'interactive' is what theme.js meets.
	readyState?: 'loading' | 'interactive' | 'complete';
}

function fakeBrowser(setup: Setup) {
	const listeners = new Map<string, Listener[]>();
	const on = (target: string) => (type: string, listener: Listener) => {
		const key = `${target}:${type}`;
		listeners.set(key, [...(listeners.get(key) ?? []), listener]);
	};
	const fire = (target: string, type: string, event: Record<string, unknown> = {}) => {
		for (const listener of listeners.get(`${target}:${type}`) ?? []) listener(event);
	};

	const store = new Map<string, string>();
	if (setup.stored != null) store.set(KEY, setup.stored);
	const guard = () => {
		if (setup.storageThrows) throw new Error('storage blocked');
	};
	const media = { matches: setup.osDark ?? false, addEventListener: on('media') };
	const buttons = CHOICES.map((choice) => {
		const attributes = new Map<string, string>();
		const button = {
			dataset: { themeChoice: choice },
			setAttribute: (name: string, value: string) => attributes.set(name, value),
			getAttribute: (name: string) => attributes.get(name) ?? null,
			closest: (selector: string) => (selector === '[data-theme-choice]' ? button : null)
		};
		return button;
	});
	const root = { dataset: {} as Record<string, string> };

	const context: Record<string, unknown> = {
		URLSearchParams,
		location: { search: setup.query == null ? '' : `?theme=${encodeURIComponent(setup.query)}` },
		localStorage: {
			getItem: (key: string) => {
				guard();
				return store.get(key) ?? null;
			},
			setItem: (key: string, value: string) => {
				guard();
				store.set(key, value);
			}
		},
		matchMedia: () => media,
		document: {
			documentElement: root,
			readyState: setup.readyState ?? 'interactive',
			addEventListener: on('document'),
			querySelectorAll: (selector: string) => (selector === '[data-theme-choice]' ? buttons : [])
		},
		addEventListener: on('window')
	};
	context.window = context;
	createContext(context);

	return {
		run: (source: string) => runInContext(source, context),
		ready: () => fire('document', 'DOMContentLoaded'),
		theme: () => root.dataset.theme,
		pressed: () =>
			buttons
				.filter((b) => b.getAttribute('aria-pressed') === 'true')
				.map((b) => b.dataset.themeChoice),
		stored: () => store.get(KEY) ?? null,
		click: (choice: Choice) =>
			fire('document', 'click', { target: buttons[CHOICES.indexOf(choice)] }),
		clickElsewhere: () => fire('document', 'click', { target: { closest: () => null } }),
		clickButtonValued: (value: string) =>
			fire('document', 'click', {
				target: { closest: () => ({ dataset: { themeChoice: value } }) }
			}),
		setOs: (dark: boolean) => {
			media.matches = dark;
			fire('media', 'change');
		},
		// The OS changed while the page sat frozen in the back-forward cache, so no change event came.
		setOsWhileFrozen: (dark: boolean) => {
			media.matches = dark;
		},
		otherTab: (value: string | null, key = KEY) => {
			if (value === null) store.delete(key);
			else store.set(key, value);
			fire('window', 'storage', { key });
		},
		restore: (persisted = true) => fire('window', 'pageshow', { persisted })
	};
}

function known(value: string | null | undefined): Choice | null {
	return CHOICES.find((choice) => choice === value) ?? null;
}

function resolve(choice: Choice, osDark: boolean): 'light' | 'dark' {
	if (choice !== 'device') return choice;
	return osDark ? 'dark' : 'light';
}

function loaded(setup: Setup) {
	const page = fakeBrowser(setup);
	page.run(THEME_SCRIPT);
	page.ready();
	return page;
}

describe('design mockup theme switch', () => {
	it('uses one head script on every page', () => {
		const first = headScript(PAGES[0]);
		for (const page of PAGES.slice(1)) expect(headScript(page), page).toBe(first);
	});

	it('gives a page with no theme set the same dark palette when the device is dark', () => {
		const picked = declarations(/:root\[data-theme='dark'\]/);
		const unscripted = declarations(
			/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)/
		);
		expect(picked.length).toBeGreaterThan(10);
		expect(unscripted).toEqual(picked);
	});

	it('paints the same theme before and after load, from a known ?theme= first, then storage, then Device', () => {
		const values = [null, '', 'light', 'dark', 'device', 'purple', 'DARK'];
		let cases = 0;
		for (const query of values) {
			for (const stored of values) {
				for (const storageThrows of [false, true]) {
					for (const osDark of [false, true]) {
						const setup = { query, stored, storageThrows, osDark };
						const choice = known(query) ?? (storageThrows ? null : known(stored)) ?? 'device';
						const firstPaint = fakeBrowser(setup);
						firstPaint.run(headScript('home'));
						const afterLoad = loaded(setup);
						const label = JSON.stringify(setup);
						expect(firstPaint.theme(), label).toBe(resolve(choice, osDark));
						expect(afterLoad.theme(), label).toBe(resolve(choice, osDark));
						expect(afterLoad.pressed(), label).toEqual([choice]);
						cases++;
					}
				}
			}
		}
		expect(cases).toBe(196);
	});

	it('stores a clicked choice and applies it, and still applies it when storage is blocked', () => {
		const page = loaded({ stored: 'light' });
		page.click('dark');
		expect([page.theme(), page.stored(), page.pressed()]).toEqual(['dark', 'dark', ['dark']]);

		const blocked = loaded({ storageThrows: true, osDark: true });
		blocked.click('light');
		expect([blocked.theme(), blocked.pressed()]).toEqual(['light', ['light']]);
	});

	it('ignores a click outside the switch', () => {
		const page = loaded({ stored: 'dark' });
		page.clickElsewhere();
		expect([page.theme(), page.stored(), page.pressed()]).toEqual(['dark', 'dark', ['dark']]);
	});

	it('marks the stored choice whether the script runs before or after the page finished loading', () => {
		const early = fakeBrowser({ stored: 'dark', readyState: 'loading' });
		early.run(THEME_SCRIPT);
		expect(early.pressed()).toEqual([]);
		early.ready();
		expect([early.theme(), early.pressed()]).toEqual(['dark', ['dark']]);

		const late = fakeBrowser({ stored: 'dark', readyState: 'complete' });
		late.run(THEME_SCRIPT);
		expect([late.theme(), late.pressed()]).toEqual(['dark', ['dark']]);
	});

	it('ignores a switch button whose value is not a known choice', () => {
		const page = loaded({ stored: 'dark' });
		page.clickButtonValued('purple');
		expect([page.theme(), page.stored(), page.pressed()]).toEqual(['dark', 'dark', ['dark']]);
	});

	it('resolves Device against the OS again when a frozen page is restored', () => {
		const page = loaded({ osDark: false });
		page.setOsWhileFrozen(true);
		page.restore();
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['device']]);

		const picked = loaded({ stored: 'light', osDark: false });
		picked.setOsWhileFrozen(true);
		picked.restore();
		expect(picked.theme()).toBe('light');
	});

	it('follows the OS only while Device is picked', () => {
		const page = loaded({});
		page.setOs(true);
		expect(page.theme()).toBe('dark');
		page.click('light');
		page.setOs(false);
		page.setOs(true);
		expect([page.theme(), page.pressed()]).toEqual(['light', ['light']]);
	});

	it('lets a click replace a forced ?theme=, so a later OS change cannot undo it', () => {
		const page = loaded({ query: 'dark', stored: 'dark', osDark: true });
		page.click('device');
		page.setOs(false);
		expect([page.theme(), page.pressed(), page.stored()]).toEqual(['light', ['device'], 'device']);
	});

	it('follows a pick made in another tab, and ignores junk, removals and other keys', () => {
		const page = loaded({ stored: 'light' });
		page.otherTab('dark');
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['dark']]);
		page.otherTab('purple');
		page.otherTab(null);
		page.otherTab('light', 'another-key');
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['dark']]);
	});

	it('follows another tab back to the value this page stored before its own click', () => {
		const page = loaded({ stored: 'light' });
		page.click('dark');
		page.otherTab('light');
		expect([page.theme(), page.pressed()]).toEqual(['light', ['light']]);
	});

	it('keeps a forced ?theme= through a restore when nothing new was picked', () => {
		const page = loaded({ query: 'dark', stored: 'light' });
		page.restore();
		expect([page.theme(), page.pressed(), page.stored()]).toEqual(['dark', ['dark'], 'light']);
		page.otherTab('device', 'unrelated');
		page.restore();
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['dark']]);
	});

	it('follows storage changed while away once the page is restored', () => {
		const page = loaded({ query: 'dark', stored: 'light', osDark: false });
		// Write storage the way another page would, with no storage event (a hidden page gets none).
		page.run(`localStorage.setItem('${KEY}', 'device')`);
		page.restore(false);
		expect(page.theme()).toBe('dark');
		page.restore();
		expect([page.theme(), page.pressed()]).toEqual(['light', ['device']]);
	});

	const action = fc.oneof(
		fc.record({ kind: fc.constant('click' as const), choice: fc.constantFrom(...CHOICES) }),
		fc.record({ kind: fc.constant('os' as const), dark: fc.boolean() }),
		fc.record({
			kind: fc.constant('tab' as const),
			value: fc.constantFrom(null, 'light', 'dark', 'device', 'purple')
		}),
		fc.record({
			kind: fc.constant('away' as const),
			value: fc.constantFrom('light', 'dark', 'device', 'purple')
		}),
		fc.record({ kind: fc.constant('restore' as const), persisted: fc.boolean() })
	);

	test.prop([
		fc.record({
			query: fc.constantFrom(null, 'light', 'dark', 'device', 'purple'),
			stored: fc.constantFrom(null, 'light', 'dark', 'device', 'purple'),
			storageThrows: fc.boolean(),
			osDark: fc.boolean()
		}),
		fc.array(action, { maxLength: 25 })
	])('always shows the pressed choice, resolved against the current OS', (setup, actions) => {
		const page = loaded(setup);
		let osDark = setup.osDark;
		for (const step of actions) {
			if (step.kind === 'click') page.click(step.choice);
			if (step.kind === 'os') {
				osDark = step.dark;
				page.setOs(step.dark);
			}
			if (step.kind === 'tab') page.otherTab(step.value);
			if (step.kind === 'away' && !setup.storageThrows)
				page.run(`localStorage.setItem('${KEY}', '${step.value}')`);
			if (step.kind === 'restore') page.restore(step.persisted);

			const pressed = page.pressed();
			expect(pressed).toHaveLength(1);
			expect(page.theme()).toBe(resolve(pressed[0], osDark));
		}
	});
});

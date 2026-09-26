// The runtime theme controller and the switch that drives it, held to every rule the design review
// pinned on the mockup switch (src/lib/design-theme.test.ts, SPEC R14). Two mockup tests have no
// counterpart here: "uses one head script on every page" (the app has one src/app.html, pinned by
// theme.test.ts) and "ignores a click outside the switch" (ThemeSwitch binds each button, it does
// not listen on the whole document).
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';
import { THEME_CHOICES, THEME_KEY, decideTheme, resolveTheme, type ThemeChoice } from './theme';
import { createThemeController } from './theme.svelte';

interface Setup {
	query?: string | null;
	stored?: string | null;
	storageThrows?: boolean;
	osDark?: boolean;
}

type Listener = (event: Record<string, unknown>) => void;

function fakeWindow(setup: Setup = {}) {
	const listeners = new Map<string, Set<Listener>>();
	const on = (target: string) => (type: string, listener: Listener) => {
		const key = `${target}:${type}`;
		listeners.set(key, (listeners.get(key) ?? new Set()).add(listener));
	};
	const off = (target: string) => (type: string, listener: Listener) => {
		listeners.get(`${target}:${type}`)?.delete(listener);
	};
	const fire = (target: string, type: string, event: Record<string, unknown> = {}) => {
		for (const listener of listeners.get(`${target}:${type}`) ?? []) listener(event);
	};

	const store = new Map<string, string>();
	if (setup.stored != null) store.set(THEME_KEY, setup.stored);
	const guard = () => {
		if (setup.storageThrows) throw new Error('storage blocked');
	};
	const media = {
		matches: setup.osDark ?? false,
		addEventListener: on('media'),
		removeEventListener: off('media')
	};
	const root = { dataset: {} as Record<string, string> };
	const win = {
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
		document: { documentElement: root },
		addEventListener: on('window'),
		removeEventListener: off('window')
	};

	return {
		win: win as unknown as Window,
		theme: () => root.dataset.theme,
		stored: () => store.get(THEME_KEY) ?? null,
		listening: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
		setOs: (dark: boolean) => {
			media.matches = dark;
			fire('media', 'change');
		},
		// The OS changed while the page sat frozen in the back-forward cache, so no change event came.
		setOsWhileFrozen: (dark: boolean) => {
			media.matches = dark;
		},
		otherTab: (value: string | null, key = THEME_KEY) => {
			if (value === null) store.delete(key);
			else store.set(key, value);
			fire('window', 'storage', { key });
		},
		// Another page wrote storage while this one was hidden, and a hidden page gets no event.
		away: (value: string) => {
			if (!setup.storageThrows) store.set(THEME_KEY, value);
		},
		restore: (persisted = true) => fire('window', 'pageshow', { persisted })
	};
}

function mounted(setup: Setup = {}) {
	const browser = fakeWindow(setup);
	const view = render(ThemeSwitch, { props: { win: browser.win } });
	flushSync();
	const buttons = () => view.getAllByRole('button') as HTMLButtonElement[];
	// Events from the stand-in window reach Svelte outside its own handlers, so the DOM is flushed
	// before a test reads aria-pressed.
	const flushed =
		<Args extends unknown[]>(event: (...args: Args) => void) =>
		(...args: Args) => {
			event(...args);
			flushSync();
		};
	return {
		...browser,
		setOs: flushed(browser.setOs),
		otherTab: flushed(browser.otherTab),
		restore: flushed(browser.restore),
		view,
		click: (choice: ThemeChoice) => {
			buttons()[THEME_CHOICES.indexOf(choice)].click();
			flushSync();
		},
		pressed: () =>
			buttons()
				.filter((button) => button.getAttribute('aria-pressed') === 'true')
				.map((button) => button.textContent?.trim().toLowerCase())
	};
}

describe('theme controller', () => {
	it('decides the same theme as the head script from the same inputs', () => {
		const values = [null, '', 'light', 'dark', 'device', 'purple', 'DARK'];
		let cases = 0;
		for (const query of values) {
			for (const stored of values) {
				for (const storageThrows of [false, true]) {
					for (const osDark of [false, true]) {
						const setup = { query, stored, storageThrows, osDark };
						const browser = fakeWindow(setup);
						const controller = createThemeController(browser.win);
						const decided = decideTheme(setup);
						const label = JSON.stringify(setup);
						expect(controller.choice, label).toBe(decided.choice);
						expect(browser.theme(), label).toBe(decided.resolved);
						controller.destroy();
						cases++;
					}
				}
			}
		}
		expect(cases).toBe(196);
	});

	it('stores a clicked choice and applies it', () => {
		const page = mounted({ stored: 'light' });
		page.click('dark');
		expect([page.theme(), page.stored(), page.pressed()]).toEqual(['dark', 'dark', ['dark']]);
	});

	it('still applies a click when storage is blocked', () => {
		const page = mounted({ storageThrows: true, osDark: true });
		page.click('light');
		expect([page.theme(), page.pressed()]).toEqual(['light', ['light']]);
	});

	it('stores the explicit choice when the pick is the theme Device already resolves to', () => {
		const page = mounted({ osDark: true });
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['device']]);
		page.click('dark');
		expect([page.theme(), page.stored(), page.pressed()]).toEqual(['dark', 'dark', ['dark']]);
		page.setOs(false);
		expect(page.theme()).toBe('dark');
	});

	it('ignores a switch value other than light, dark and device', () => {
		const browser = fakeWindow({ stored: 'dark' });
		const controller = createThemeController(browser.win);
		for (const junk of ['purple', 'DARK', '', null, undefined, 3]) controller.pick(junk);
		expect([controller.choice, browser.theme(), browser.stored()]).toEqual([
			'dark',
			'dark',
			'dark'
		]);
	});

	it('follows the OS live while Device is picked, and not after an explicit pick', () => {
		const page = mounted({});
		page.setOs(true);
		expect(page.theme()).toBe('dark');
		page.setOs(false);
		expect(page.theme()).toBe('light');
		page.click('light');
		page.setOs(true);
		expect([page.theme(), page.pressed()]).toEqual(['light', ['light']]);
	});

	it('lets a click replace a forced ?theme=, so a later OS change cannot undo it', () => {
		const page = mounted({ query: 'dark', stored: 'dark', osDark: true });
		page.click('device');
		page.setOs(false);
		expect([page.theme(), page.pressed(), page.stored()]).toEqual(['light', ['device'], 'device']);
	});

	it('follows a pick made in another tab, and ignores junk, removals and other keys', () => {
		const page = mounted({ stored: 'light' });
		page.otherTab('dark');
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['dark']]);
		page.otherTab('purple');
		page.otherTab(null);
		page.otherTab('light', 'another-key');
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['dark']]);
	});

	it('follows another tab back to the value this page stored before its own click', () => {
		const page = mounted({ stored: 'light' });
		page.click('dark');
		page.otherTab('light');
		expect([page.theme(), page.pressed()]).toEqual(['light', ['light']]);
	});

	it('resolves Device against the OS again when a frozen page is restored', () => {
		const page = mounted({ osDark: false });
		page.setOsWhileFrozen(true);
		page.restore();
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['device']]);

		const picked = mounted({ stored: 'light', osDark: false });
		picked.setOsWhileFrozen(true);
		picked.restore();
		expect(picked.theme()).toBe('light');
	});

	it('keeps a forced ?theme= through a restore when nothing new was picked', () => {
		const page = mounted({ query: 'dark', stored: 'light' });
		page.restore();
		expect([page.theme(), page.pressed(), page.stored()]).toEqual(['dark', ['dark'], 'light']);
		page.otherTab('device', 'unrelated');
		page.restore();
		expect([page.theme(), page.pressed()]).toEqual(['dark', ['dark']]);
	});

	it('follows a pick made while the page was away once it is restored', () => {
		const page = mounted({ query: 'dark', stored: 'light', osDark: false });
		page.away('device');
		page.restore(false);
		expect(page.theme()).toBe('dark');
		page.restore();
		expect([page.theme(), page.pressed()]).toEqual(['light', ['device']]);
	});

	it('stops listening once destroyed', () => {
		const browser = fakeWindow({ stored: 'light' });
		const controller = createThemeController(browser.win);
		expect(browser.listening()).toBe(3);
		controller.destroy();
		expect(browser.listening()).toBe(0);
		browser.otherTab('dark');
		expect(browser.theme()).toBe('light');
	});

	it('with the head script blocked, the stylesheet still paints Device from the OS scheme', () => {
		const css = readFileSync('src/app.css', 'utf8');
		const block = (selector: RegExp) =>
			(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '')
				.split(';')
				.map((line) => line.trim())
				.filter(Boolean);
		const picked = block(/:root\[data-theme='dark'\]/);
		expect(picked.length).toBeGreaterThan(10);
		expect(
			block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)/)
		).toEqual(picked);
	});

	const action = fc.oneof(
		fc.record({ kind: fc.constant('click' as const), choice: fc.constantFrom(...THEME_CHOICES) }),
		fc.record({ kind: fc.constant('os' as const), dark: fc.boolean() }),
		fc.record({ kind: fc.constant('frozen' as const), dark: fc.boolean() }),
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
	])('always presses exactly one choice, resolved against the current OS', (setup, actions) => {
		const page = mounted(setup);
		try {
			let osDark = setup.osDark;
			for (const step of actions) {
				if (step.kind === 'click') page.click(step.choice);
				if (step.kind === 'os') {
					osDark = step.dark;
					page.setOs(step.dark);
				}
				// The OS changes while the page sits in the back-forward cache, then Back restores it.
				if (step.kind === 'frozen') {
					osDark = step.dark;
					page.setOsWhileFrozen(step.dark);
					page.restore();
				}
				if (step.kind === 'tab') page.otherTab(step.value);
				if (step.kind === 'away') page.away(step.value);
				if (step.kind === 'restore') page.restore(step.persisted);
				flushSync();

				const pressed = page.pressed();
				expect(pressed).toHaveLength(1);
				expect(page.theme()).toBe(resolveTheme(pressed[0] as ThemeChoice, osDark));
			}
		} finally {
			page.view.unmount();
		}
	});
});

describe('ThemeSwitch', () => {
	it('renders a Theme group of Light, Dark and Device, pressing the choice in force', () => {
		const page = mounted({ stored: 'dark' });
		const group = page.view.getByRole('group', { name: 'Theme' });
		const buttons = [...group.querySelectorAll('button')];
		expect(buttons.map((button) => button.textContent?.trim())).toEqual([
			'Light',
			'Dark',
			'Device'
		]);
		expect(buttons.map((button) => button.getAttribute('type'))).toEqual([
			'button',
			'button',
			'button'
		]);
		expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
			'false',
			'true',
			'false'
		]);
	});

	it('stops following the page once unmounted', () => {
		const page = mounted({ stored: 'light' });
		expect(page.listening()).toBe(3);
		page.view.unmount();
		expect(page.listening()).toBe(0);
	});
});

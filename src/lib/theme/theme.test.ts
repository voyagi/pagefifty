// The head script in src/app.html paints the theme before any stylesheet loads and cannot import
// theme.ts, so the two are held together here: the script runs in a stand-in browser over every
// combination of inputs and must land on the theme decideTheme picks.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
	THEME_CHOICES,
	THEME_KEY,
	decideTheme,
	knownChoice,
	queryTheme,
	resolveTheme
} from './theme';

const APP_HTML = readFileSync('src/app.html', 'utf8');
const APP_CSS = readFileSync('src/app.css', 'utf8');
const HEAD_SCRIPT = /<script nonce="%sveltekit\.nonce%">([\s\S]*?)<\/script>/;

function headScript(): string {
	const match = HEAD_SCRIPT.exec(APP_HTML);
	if (!match) throw new Error('src/app.html has no nonce-carrying inline head script');
	return match[1];
}

// The declarations inside the first rule whose selector matches, one per entry.
function declarations(selector: RegExp): string[] {
	const match = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(APP_CSS);
	if (!match) throw new Error(`src/app.css has no rule matching ${selector}`);
	return match[1]
		.split(';')
		.map((line) => line.trim())
		.filter(Boolean);
}

interface Setup {
	query: string | null;
	stored: string | null;
	storageThrows: boolean;
	osDark: boolean;
}

function firstPaint(setup: Setup): string | undefined {
	const root = { dataset: {} as Record<string, string> };
	const context: Record<string, unknown> = {
		URLSearchParams,
		location: { search: setup.query == null ? '' : `?theme=${encodeURIComponent(setup.query)}` },
		localStorage: {
			getItem: (key: string) => {
				if (setup.storageThrows) throw new Error('storage blocked');
				return key === THEME_KEY ? setup.stored : null;
			}
		},
		matchMedia: (query: string) => ({
			matches: query === '(prefers-color-scheme: dark)' && setup.osDark
		}),
		document: { documentElement: root }
	};
	context.window = context;
	createContext(context);
	runInContext(headScript(), context);
	return root.dataset.theme;
}

describe('theme decision', () => {
	it('accepts only the three choices, by exact value', () => {
		expect(THEME_CHOICES).toEqual(['light', 'dark', 'device']);
		expect(THEME_KEY).toBe('pagefifty-theme');
		for (const choice of THEME_CHOICES) expect(knownChoice(choice)).toBe(choice);
		for (const junk of [null, undefined, '', 'DARK', ' dark', 'purple', 1, {}]) {
			expect(knownChoice(junk)).toBeNull();
		}
	});

	it('reads the raw ?theme= value, leaving the judging to knownChoice', () => {
		expect(queryTheme('?theme=dark')).toBe('dark');
		expect(queryTheme('?q=x&theme=DARK')).toBe('DARK');
		expect(queryTheme('')).toBeNull();
		expect(queryTheme('?theme=')).toBe('');
	});

	it('resolves Device against the OS and leaves a picked theme alone', () => {
		expect(resolveTheme('device', true)).toBe('dark');
		expect(resolveTheme('device', false)).toBe('light');
		expect(resolveTheme('light', true)).toBe('light');
		expect(resolveTheme('dark', false)).toBe('dark');
	});

	it('falls back to Device for an unknown or absent stored value', () => {
		for (const stored of [null, 'purple', 'DARK', '']) {
			expect(decideTheme({ query: null, stored, storageThrows: false, osDark: true })).toEqual({
				choice: 'device',
				resolved: 'dark'
			});
		}
	});

	it('paints the theme decideTheme picks for every query, stored value, blocked storage and OS', () => {
		const values = [null, '', 'light', 'dark', 'device', 'purple', 'DARK'];
		let cases = 0;
		for (const query of values) {
			for (const stored of values) {
				for (const storageThrows of [false, true]) {
					for (const osDark of [false, true]) {
						const setup = { query, stored, storageThrows, osDark };
						const choice =
							knownChoice(query) ?? (storageThrows ? null : knownChoice(stored)) ?? 'device';
						const decided = decideTheme(setup);
						const label = JSON.stringify(setup);
						expect(decided.choice, label).toBe(choice);
						expect(firstPaint(setup), label).toBe(decided.resolved);
						cases++;
					}
				}
			}
		}
		expect(cases).toBe(196);
	});
});

describe('src/app.html', () => {
	it('runs the head script before the SvelteKit head, where every stylesheet link goes', () => {
		const script = APP_HTML.search(HEAD_SCRIPT);
		expect(script).toBeGreaterThan(-1);
		expect(script).toBeLessThan(APP_HTML.indexOf('%sveltekit.head%'));
		expect(APP_HTML.indexOf('<link')).toBe(-1);
	});

	it('carries no style attribute, so production can keep style-src to self', () => {
		expect(APP_HTML).not.toMatch(/\sstyle=/);
	});
});

// style-src-attr 'unsafe-inline' is there for SvelteKit's route announcer alone, and the browser
// lets every other style attribute through with it, so only this test keeps the markup clean.
const STYLE_IN_MARKUP = /\sstyle(?:=|:[a-z-]+)/;

describe('the components', () => {
	it('recognises a style attribute and a style directive', () => {
		expect('<div style="color: red">').toMatch(STYLE_IN_MARKUP);
		expect('<p style:color={ink}>').toMatch(STYLE_IN_MARKUP);
		expect('<style>\n\tp { color: red; }\n</style>').not.toMatch(STYLE_IN_MARKUP);
	});

	it('carry no style attribute or style directive in their markup', () => {
		const files = readdirSync('src', { recursive: true, encoding: 'utf8' })
			.filter((name) => name.endsWith('.svelte'))
			.map((name) => join('src', name));
		expect(files.length).toBeGreaterThan(5);
		const offenders = files.filter((file) =>
			STYLE_IN_MARKUP.test(
				readFileSync(file, 'utf8').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '')
			)
		);
		expect(offenders).toEqual([]);
	});
});

describe('src/app.css', () => {
	it('gives a page with no theme set the same dark palette when the device is dark', () => {
		const picked = declarations(/:root\[data-theme='dark'\]/);
		const unscripted = declarations(
			/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)/
		);
		expect(picked.length).toBeGreaterThan(10);
		expect(unscripted).toEqual(picked);
	});
});

// The design keeps one file per Plex Sans weight, and the three are the same variable font, so the
// app serves them as one file that the browser fetches once.
const servedName = (designName: string) =>
	/^plex-sans-\d{3}\.woff2$/.test(designName) ? 'plex-sans.woff2' : designName;

const servedFonts = () => readdirSync('static/fonts').filter((name) => name.endsWith('.woff2'));

describe('static/fonts', () => {
	it('serves every design font byte for byte, Plex Sans once for its three weights', () => {
		const source = readdirSync('design/assets/fonts').filter((name) => name.endsWith('.woff2'));
		expect(source).toHaveLength(9);
		expect(servedFonts().sort()).toEqual([...new Set(source.map(servedName))].sort());
		expect(servedFonts()).toHaveLength(7);
		for (const name of source) {
			const original = readFileSync(`design/assets/fonts/${name}`);
			expect(readFileSync(`static/fonts/${servedName(name)}`).equals(original), name).toBe(true);
		}
	});

	it('names every served font in the stylesheet, and no font that is not served', () => {
		const named = [...APP_CSS.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((match) => match[1]);
		expect(named.sort()).toEqual(servedFonts().sort());
	});
});

// The one theme decision. src/app.html cannot import this module, so its head script repeats the
// decision by hand; theme.test.ts runs that script against decideTheme over every combination.

export const THEME_KEY = 'pagefifty-theme';
export const THEME_CHOICES = ['light', 'dark', 'device'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeInputs {
	query: string | null;
	stored: string | null;
	storageThrows: boolean;
	osDark: boolean;
}

export interface ThemeDecision {
	choice: ThemeChoice;
	resolved: ResolvedTheme;
}

// Storage, the query string and a button's value are all outside input: exact membership only,
// so "DARK", " dark" and "purple" are ignored rather than normalised.
export function knownChoice(value: unknown): ThemeChoice | null {
	return THEME_CHOICES.find((choice) => choice === value) ?? null;
}

export function queryTheme(search: string): string | null {
	return new URLSearchParams(search).get('theme');
}

export function resolveTheme(choice: ThemeChoice, osDark: boolean): ResolvedTheme {
	if (choice !== 'device') return choice;
	return osDark ? 'dark' : 'light';
}

export function decideTheme({ query, stored, storageThrows, osDark }: ThemeInputs): ThemeDecision {
	const choice =
		knownChoice(query) ?? (storageThrows ? null : knownChoice(stored)) ?? ('device' as const);
	return { choice, resolved: resolveTheme(choice, osDark) };
}

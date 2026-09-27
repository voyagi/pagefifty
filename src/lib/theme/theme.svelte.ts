// The theme after hydration. The first paint is the head script's job (src/app.html); this module
// takes over from the same decision and keeps it right for the rest of the page view.
import {
	THEME_KEY,
	decideTheme,
	knownChoice,
	queryTheme,
	resolveTheme,
	type ThemeChoice
} from './theme';

export interface ThemeController {
	readonly choice: ThemeChoice;
	pick(value: unknown): void;
	destroy(): void;
}

interface StoredRead {
	value: string | null;
	blocked: boolean;
}

// Reading win.localStorage itself can throw when storage is blocked, not only getItem.
function readStored(win: Window): StoredRead {
	try {
		return { value: win.localStorage.getItem(THEME_KEY), blocked: false };
	} catch {
		return { value: null, blocked: true };
	}
}

export function createThemeController(win: Window): ThemeController {
	const media = win.matchMedia('(prefers-color-scheme: dark)');
	const initial = readStored(win);
	let choice = $state(
		decideTheme({
			query: queryTheme(win.location.search),
			stored: initial.value,
			storageThrows: initial.blocked,
			osDark: media.matches
		}).choice
	);
	// The stored value this page view last saw. A different one later means a pick was made in
	// another tab, or on another page before Back restored this one from the back-forward cache,
	// and it replaces the choice here, a forced ?theme= included.
	let seen = initial.value;

	function apply() {
		win.document.documentElement.dataset.theme = resolveTheme(choice, media.matches);
	}

	function follow() {
		const now = readStored(win).value;
		if (now === seen) return;
		seen = now;
		const picked = knownChoice(now);
		if (picked) choice = picked;
	}

	const onScheme = () => {
		if (choice === 'device') apply();
	};
	const onStorage = (event: StorageEvent) => {
		if (event.key !== THEME_KEY) return;
		follow();
		apply();
	};
	// A restored page may have missed an OS change while frozen, so Device is resolved again too.
	const onPageShow = (event: PageTransitionEvent) => {
		if (!event.persisted) return;
		follow();
		apply();
	};

	media.addEventListener('change', onScheme);
	win.addEventListener('storage', onStorage);
	win.addEventListener('pageshow', onPageShow);
	apply();

	return {
		get choice() {
			return choice;
		},
		pick(value: unknown) {
			const picked = knownChoice(value);
			if (!picked) return;
			choice = picked;
			try {
				win.localStorage.setItem(THEME_KEY, picked);
			} catch {
				// Storage can be blocked; the pick still applies for this page view.
			}
			seen = readStored(win).value;
			apply();
		},
		destroy() {
			media.removeEventListener('change', onScheme);
			win.removeEventListener('storage', onStorage);
			win.removeEventListener('pageshow', onPageShow);
		}
	};
}

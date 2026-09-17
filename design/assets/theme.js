// Light, Dark, Device. Device follows prefers-color-scheme live; the choice survives a reload.
(function () {
	const KEY = 'pagefifty-theme';
	const CHOICES = ['light', 'dark', 'device'];
	const media = window.matchMedia('(prefers-color-scheme: dark)');

	// Storage and the query string are outside input, and a button's value is checked the same way:
	// anything but a known choice is ignored.
	function known(value) {
		return CHOICES.includes(value) ? value : null;
	}

	function stored() {
		try {
			return localStorage.getItem(KEY);
		} catch {
			return null;
		}
	}

	function read() {
		return known(stored()) || 'device';
	}

	function apply(choice) {
		const resolved = choice === 'device' ? (media.matches ? 'dark' : 'light') : choice;
		document.documentElement.dataset.theme = resolved;
		document.querySelectorAll('[data-theme-choice]').forEach((button) => {
			button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
		});
	}

	// The choice in force on this page view: a known ?theme= value first, then storage.
	// A click, or a pick followed from another tab or page (follow below), replaces it, so a later
	// OS change never undoes what the user picked.
	let current = known(new URLSearchParams(location.search).get('theme')) || read();

	// The stored value this page view last saw. A different one later means a pick was made in
	// another tab, or on another page before Back restored this one from the back-forward cache.
	let seen = stored();

	function follow() {
		const now = stored();
		if (now === seen) return;
		seen = now;
		const choice = known(now);
		if (!choice) return;
		current = choice;
		apply(current);
	}

	document.addEventListener('click', (event) => {
		const button = event.target.closest('[data-theme-choice]');
		if (!button) return;
		// The markup sets these values, but a typo there would otherwise store and paint junk.
		const choice = known(button.dataset.themeChoice);
		if (!choice) return;
		current = choice;
		try {
			localStorage.setItem(KEY, current);
		} catch {
			// Storage can be blocked; the choice still applies for this page view.
		}
		seen = stored();
		apply(current);
	});

	media.addEventListener('change', () => {
		if (current === 'device') apply('device');
	});

	window.addEventListener('storage', (event) => {
		if (event.key === KEY) follow();
	});

	// A restored page may have missed an OS change while frozen, so Device is resolved again too.
	window.addEventListener('pageshow', (event) => {
		if (!event.persisted) return;
		follow();
		apply(current);
	});

	// With defer the page is already parsed here. Waiting for DOMContentLoaded only when it is not
	// keeps the switch right if the script is ever loaded async or added after the page loaded.
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => apply(current));
	} else {
		apply(current);
	}
})();

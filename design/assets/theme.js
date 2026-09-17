// Light, Dark, Device. Device follows prefers-color-scheme live; the choice survives a reload.
(function () {
	const KEY = 'pagefifty-theme';
	const CHOICES = ['light', 'dark', 'device'];
	const media = window.matchMedia('(prefers-color-scheme: dark)');

	// Storage and the query string are both outside input: anything but a known choice is ignored.
	function known(value) {
		return CHOICES.includes(value) ? value : null;
	}

	function read() {
		try {
			return known(localStorage.getItem(KEY)) || 'device';
		} catch {
			return 'device';
		}
	}

	function apply(choice) {
		const resolved = choice === 'device' ? (media.matches ? 'dark' : 'light') : choice;
		document.documentElement.dataset.theme = resolved;
		document.querySelectorAll('[data-theme-choice]').forEach((button) => {
			button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
		});
	}

	// The choice in force on this page view: a known ?theme= value first, then storage.
	// A click replaces it, so a later OS change never undoes what the user just picked.
	let current = known(new URLSearchParams(location.search).get('theme')) || read();

	document.addEventListener('click', (event) => {
		const button = event.target.closest('[data-theme-choice]');
		if (!button) return;
		current = button.dataset.themeChoice;
		try {
			localStorage.setItem(KEY, current);
		} catch {
			// Storage can be blocked; the choice still applies for this page view.
		}
		apply(current);
	});

	media.addEventListener('change', () => {
		if (current === 'device') apply('device');
	});

	document.addEventListener('DOMContentLoaded', () => apply(current));
})();

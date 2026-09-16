// Light, Dark, Device. Device follows prefers-color-scheme live; the choice survives a reload.
(function () {
	const KEY = 'pagefifty-theme';
	const media = window.matchMedia('(prefers-color-scheme: dark)');

	function read() {
		try {
			return localStorage.getItem(KEY) || 'device';
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

	document.addEventListener('click', (event) => {
		const button = event.target.closest('[data-theme-choice]');
		if (!button) return;
		const choice = button.dataset.themeChoice;
		try {
			localStorage.setItem(KEY, choice);
		} catch {
			// Storage can be blocked; the choice still applies for this page view.
		}
		apply(choice);
	});

	media.addEventListener('change', () => {
		if (read() === 'device') apply('device');
	});

	const forced = new URLSearchParams(location.search).get('theme');
	document.addEventListener('DOMContentLoaded', () => apply(forced || read()));
})();

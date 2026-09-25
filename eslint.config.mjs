import { defineConfig } from 'eslint/config';
import compat from 'eslint-plugin-compat';
import sonarjs from 'eslint-plugin-sonarjs';
import svelte from 'eslint-plugin-svelte';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TEST_FILES = ['**/*.{test,spec}.{ts,js}'];
const SERVER_FILES = ['src/lib/server/**', 'src/**/+server.ts', 'src/**/+*.server.ts', 'src/hooks.server.ts'];
const FETCH_ONLY = 'App code makes its calls through fetch, the seam the snapshot transport and the test guards wrap.';

export default defineConfig([
	{ ignores: ['.svelte-kit/**', 'build/**', 'coverage/**', '.wrangler/**', 'worker-configuration.d.ts'] },
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'] }
		}
	},
	// Deliberately high thresholds: these catch genuinely tangled functions, not style.
	{
		files: ['src/**/*.{ts,svelte}'],
		ignores: TEST_FILES,
		plugins: { sonarjs },
		rules: {
			complexity: ['error', 25],
			'sonarjs/cognitive-complexity': ['error', 25]
		}
	},
	{
		files: TEST_FILES,
		plugins: { vitest },
		rules: {
			'vitest/expect-expect': ['error', { assertFunctionNames: ['expect'] }],
			'vitest/no-identical-title': 'error'
		}
	},
	// Browser API support is checked only where code reaches the browser; server modules run on workerd.
	{
		files: ['src/**/*.{ts,svelte}'],
		ignores: [...TEST_FILES, ...SERVER_FILES],
		plugins: { compat },
		rules: { 'compat/compat': 'error' }
	},
	// The fetch-only-network rule in .dependency-cruiser.cjs sees imports only; these channels are
	// globals, so lint refuses them in app code. Tests and their setup files may use them. A resource
	// that markup or CSS loads is not a call and no source rule reads it: plan 01-09's
	// Content-Security-Policy bounds those at run time.
	// checkGlobalObject is off by default, and without it globalThis.WebSocket, self.EventSource and
	// window.XMLHttpRequest pass. sendBeacon names no object, so window.navigator.sendBeacon is caught.
	{
		files: ['src/**/*.{ts,svelte}'],
		ignores: [...TEST_FILES, 'src/test/**'],
		rules: {
			'no-restricted-globals': [
				'error',
				{
					globals: ['WebSocket', 'EventSource', 'XMLHttpRequest'].map((name) => ({ name, message: FETCH_ONLY })),
					checkGlobalObject: true
				}
			],
			'no-restricted-properties': ['error', { property: 'sendBeacon', message: FETCH_ONLY }]
		}
	}
]);

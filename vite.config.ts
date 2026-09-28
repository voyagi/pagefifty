import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { PROJECTS } from './src/test/projects.ts';

const GENERATED_RECORDS = '/src/lib/snapshot/generated/';

function projectTest(name: keyof typeof PROJECTS) {
	const { include, exclude, setupFiles } = PROJECTS[name];
	return {
		name,
		include: [...include],
		exclude: [...exclude],
		setupFiles: [...setupFiles]
	};
}

export default defineConfig(({ command, mode }) => {
	// Under vitest, wrangler's local config reader would hand the workerd project every key in a
	// dotenv file beside wrangler.jsonc as a binding, real provider keys included. Tests never see
	// a key. The vitest command sets VITEST, but a run started through vitest's API (an editor
	// plugin) sets nothing and passes only the mode, so both are read. This switch does not cover a
	// .dev.vars file, so env-bindings.worker.test.ts fails on any binding the config does not declare.
	if (mode === 'test' || process.env.VITEST) {
		process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
	}
	// Vite dev injects each component's styles as a style element, so dev needs inline styles. The
	// built Worker links every stylesheet, so production keeps style-src to 'self' and the nonce.
	const styleSrc: ('self' | 'unsafe-inline')[] =
		command === 'serve' ? ['self', 'unsafe-inline'] : ['self'];
	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Runes everywhere except dependencies, which may still ship Svelte 4 syntax.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter(),
				// Pages render on request, so auto mode means a fresh nonce per response; the head
				// script in src/app.html carries it through %sveltekit.nonce%.
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': styleSrc,
						// SvelteKit mounts its route announcer with a style attribute after hydration,
						// and the browser refuses it under style-src 'self' on every page. Attributes
						// only: style elements and every script stay strict.
						'style-src-attr': ['unsafe-inline'],
						'img-src': ['self', 'data:'],
						'font-src': ['self'],
						'connect-src': ['self'],
						'object-src': ['none'],
						'base-uri': ['self'],
						'form-action': ['self'],
						'frame-ancestors': ['none']
					}
				}
			})
		],
		build: {
			// A record under 4 KiB would otherwise be inlined into the server bundle as a data: URI.
			// Records are served as static assets through ASSETS, so the Worker script stays small.
			assetsInlineLimit: (filePath: string) =>
				filePath.replaceAll('\\', '/').includes(GENERATED_RECORDS) ? false : undefined
		},
		test: {
			// Vitest 4.1 also runs this for each project that extends the root, and an empty list in a
			// project does not replace it (the configs merge by concatenation), so the setup itself
			// builds once per vitest process.
			globalSetup: ['src/test/build-records.global.ts'],
			// On a loaded machine, tests that start a Node process or import a config crossed the 5 s
			// default, a different test on each whole run. The node and jsdom projects extend this root;
			// the workerd project does not and keeps its own default.
			testTimeout: 30_000,
			// summary: false keeps one line per test file, tagged with its project, when not on a TTY.
			reporters: [
				['default', { summary: false }],
				...(process.env.GITHUB_ACTIONS === 'true' ? ['github-actions' as const] : [])
			],
			coverage: {
				// The Workers integration rejects the v8 provider.
				provider: 'istanbul',
				include: ['src/**/*.{ts,svelte}'],
				exclude: [
					'src/**/*.test.ts',
					'src/**/*.d.ts',
					'src/test/**',
					'src/lib/snapshot/generated/**'
				],
				reporter: ['text-summary', 'json-summary'],
				thresholds: {
					lines: 85,
					statements: 85,
					functions: 85,
					branches: 80,
					'src/lib/core/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
					'src/lib/ingest/**': { lines: 95, statements: 95, functions: 95, branches: 90 },
					'src/lib/profile/**/*.ts': { lines: 95, statements: 95, functions: 95, branches: 90 }
				}
			},
			projects: [
				{
					extends: true,
					test: { ...projectTest('node'), environment: 'node' }
				},
				{
					extends: true,
					resolve: { conditions: ['browser'] },
					test: { ...projectTest('jsdom'), environment: 'jsdom' }
				},
				{
					// Not extended from the root, so no SvelteKit plugin: modules tested in workerd import
					// each other by relative path, and the Workers integration refuses a custom environment.
					plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
					test: projectTest('workerd')
				}
			]
		}
	};
});

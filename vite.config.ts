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

export default defineConfig(({ mode }) => {
	// Under vitest, wrangler's local config reader would hand the workerd project every key in a
	// dotenv file beside wrangler.jsonc as a binding, real provider keys included. Tests never see
	// a key. The vitest command sets VITEST, but a run started through vitest's API (an editor
	// plugin) sets nothing and passes only the mode, so both are read. This switch does not cover a
	// .dev.vars file, so env-bindings.worker.test.ts fails on any binding the config does not declare.
	if (mode === 'test' || process.env.VITEST) {
		process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
	}
	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Runes everywhere except dependencies, which may still ship Svelte 4 syntax.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter()
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

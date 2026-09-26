// Stryker's vitest runner overrides the pool of every project with its own threads pool, which
// the workerd project cannot run under, so mutants are killed by the node project alone. Store
// modules (.svelte.ts) are tested in jsdom and stay outside stryker.config.json's mutate glob.
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';
import { PROJECTS } from './src/test/projects.ts';

const { include, exclude, setupFiles } = PROJECTS.node;
// vite.config.ts exports a function of the mode, and a mutation run is a test run.
const { plugins } = viteConfig({ command: 'serve', mode: 'test' });

export default defineConfig({
	plugins,
	// Stryker's workers run in one sandbox, and Vite swaps its dependency cache folder by rename,
	// which races between workers on Windows (EPERM), so each worker keeps a cache of its own.
	cacheDir: `node_modules/.vite/stryker-${process.env.STRYKER_MUTATOR_WORKER ?? 'main'}`,
	// No global setup here. Every Stryker worker is its own vitest, so a setup that built the records
	// would run once per worker, all into the one sandbox: concurrent builds fail to rename their
	// folder on Windows (EPERM), and a worker restarted mid-run would replace the records while the
	// others read them. `npm run mutate` builds them once beforehand (premutate), and Stryker copies
	// the checkout, ignored files included, into its sandbox.
	test: {
		name: 'node',
		environment: 'node',
		include: [...include],
		exclude: [...exclude],
		setupFiles: [...setupFiles]
	}
});

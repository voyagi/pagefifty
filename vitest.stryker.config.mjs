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
	test: {
		// A checkout where no build ran yet has no generated records, and the record tests read them.
		globalSetup: ['src/test/build-records.global.ts'],
		name: 'node',
		environment: 'node',
		include: [...include],
		exclude: [...exclude],
		setupFiles: [...setupFiles]
	}
});

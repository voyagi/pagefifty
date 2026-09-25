// The file suffix decides where a test runs. vite.config.ts builds its vitest projects from this
// table and projects.test.ts holds every test file in the repo to exactly one project, so the two
// can never disagree about where a file runs.
export const PROJECT_NAMES = ['node', 'jsdom', 'workerd'] as const;
export type ProjectName = (typeof PROJECT_NAMES)[number];

export interface ProjectFiles {
	include: readonly string[];
	exclude: readonly string[];
	setupFiles: readonly string[];
}

const WORKER_SUFFIX = '.worker.test.ts';
const DOM_SUFFIXES = ['.svelte.test.ts', '.dom.test.ts'] as const;
const NODE_GUARD = 'src/test/outbound-guard.node.ts';
const FETCH_GUARD = 'src/test/outbound-guard.fetch.ts';
// The Svelte testing library wraps each test in its setup and cleanup by itself only when vitest's
// globals are on, and they are off, so jsdom loads its setup module: events fired through the DOM
// testing library and user-event then wait for Svelte to flush, and rendered components go.
const SVELTE_TESTING = '@testing-library/svelte/vitest';

export const GUARD_FILES: readonly string[] = [NODE_GUARD, FETCH_GUARD];

export const PROJECTS: Readonly<Record<ProjectName, ProjectFiles>> = {
	node: {
		include: ['src/**/*.test.ts'],
		exclude: [`src/**/*${WORKER_SUFFIX}`, ...DOM_SUFFIXES.map((suffix) => `src/**/*${suffix}`)],
		setupFiles: [NODE_GUARD]
	},
	jsdom: {
		include: DOM_SUFFIXES.map((suffix) => `src/**/*${suffix}`),
		exclude: [],
		setupFiles: [NODE_GUARD, SVELTE_TESTING]
	},
	workerd: {
		include: [`src/**/*${WORKER_SUFFIX}`],
		exclude: [],
		setupFiles: [FETCH_GUARD]
	}
};

// Stryker runs the node project alone (vitest.stryker.config.mjs), so a src/lib module whose only
// test runs in workerd or jsdom would count every mutant as uncovered. Such a module needs a node
// test beside it, or a "!<path>" exclusion in stryker.config.json's mutate list. A .svelte.test.ts
// file tests a store module (.svelte.ts), which the mutate list already leaves out.
const OUTSIDE_NODE_SUFFIXES = [WORKER_SUFFIX, '.dom.test.ts'] as const;

export function modulesTestedOnlyOutsideNode(files: readonly string[]): string[] {
	const present = new Set(files);
	const found = new Set<string>();
	for (const file of files) {
		const suffix = OUTSIDE_NODE_SUFFIXES.find((ending) => file.endsWith(ending));
		if (!suffix || !file.startsWith('src/lib/')) continue;
		const module = `${file.slice(0, -suffix.length)}.ts`;
		if (present.has(module) && !present.has(module.replace(/\.ts$/, '.test.ts'))) found.add(module);
	}
	return [...found];
}

export function projectOf(path: string): ProjectName | undefined {
	const file = path.replaceAll('\\', '/');
	if (!file.startsWith('src/') || !file.endsWith('.test.ts')) return undefined;
	if (file.endsWith(WORKER_SUFFIX)) return 'workerd';
	if (DOM_SUFFIXES.some((suffix) => file.endsWith(suffix))) return 'jsdom';
	return 'node';
}

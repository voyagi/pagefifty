import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	GUARD_FILES,
	PROJECT_NAMES,
	PROJECTS,
	SETTLE_IMPORTS,
	modulesTestedOnlyOutsideNode,
	projectOf
} from './projects';

const SRC_FILES = readdirSync('src', { recursive: true, encoding: 'utf8' }).map(
	(file) => `src/${file.replaceAll('\\', '/')}`
);
const TEST_FILES = SRC_FILES.filter((file) => file.endsWith('.test.ts'));

function matches(file: string, globs: readonly string[]): boolean {
	return globs.some((glob) => path.posix.matchesGlob(file, glob));
}

function projectsMatching(file: string): string[] {
	return PROJECT_NAMES.filter(
		(name) => matches(file, PROJECTS[name].include) && !matches(file, PROJECTS[name].exclude)
	);
}

describe('vitest projects', () => {
	it('finds this file among the test files it checks', () => {
		expect(TEST_FILES).toContain('src/test/projects.test.ts');
	});

	it('runs every test file in exactly the project its suffix names', () => {
		const placement = TEST_FILES.map((file) => ({ file, projects: projectsMatching(file) }));
		const expected = TEST_FILES.map((file) => ({ file, projects: [projectOf(file)] }));
		expect(placement).toEqual(expected);
	});

	// The check above reads the table with Node's glob matcher. This one asks vitest itself, whose
	// matcher is a different library, which project it runs each file in.
	it('matches the project vitest itself runs every test file in', () => {
		const run = spawnSync(
			process.execPath,
			[path.join('node_modules', 'vitest', 'vitest.mjs'), 'list', '--filesOnly', '--json'],
			{ encoding: 'utf8' }
		);
		expect(run.status, run.stderr).toBe(0);
		const byFile = (a: { file: string }, b: { file: string }) => a.file.localeCompare(b.file);
		const listed = (JSON.parse(run.stdout) as { file: string; projectName: string }[])
			.map(({ file, projectName }) => ({
				file: path.relative(process.cwd(), file).replaceAll('\\', '/'),
				project: projectName
			}))
			.sort(byFile);
		const expected = TEST_FILES.map((file) => ({ file, project: projectOf(file) })).sort(byFile);
		expect(listed).toEqual(expected);
	}, 60_000);

	it('leaves no test file behind under a name no project picks up', () => {
		expect(
			SRC_FILES.filter(
				(file) => /\.(spec|test)\.(js|mjs|tsx?)$/.test(file) && !file.endsWith('.test.ts')
			)
		).toEqual([]);
	});

	it.each([
		['src/lib/core/verdict.test.ts', 'node'],
		['src/lib/profile/store.svelte.test.ts', 'jsdom'],
		['src/lib/components/Chip.dom.test.ts', 'jsdom'],
		['src/lib/ingest/read-notice.worker.test.ts', 'workerd'],
		['src\\lib\\core\\deadline.test.ts', 'node']
	])('places %s in %s', (file, project) => {
		expect(projectOf(file)).toBe(project);
	});

	it.each(['src/lib/core/verdict.ts', 'scripts/build.test.ts', 'src/lib/a.spec.ts'])(
		'places no project for %s',
		(file) => {
			expect(projectOf(file)).toBeUndefined();
		}
	);

	it('leaves Stryker no mutated module that only a workerd or jsdom test could kill', () => {
		const { mutate } = JSON.parse(readFileSync('stryker.config.json', 'utf8')) as {
			mutate: string[];
		};
		const excluded = new Set(
			mutate.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1))
		);
		expect(
			modulesTestedOnlyOutsideNode(SRC_FILES).filter((module) => !excluded.has(module))
		).toEqual([]);
	});

	// Each Stryker worker is its own vitest, so a global setup would build the records once per
	// worker into the one sandbox, where concurrent builds fail on Windows.
	it('builds the records once before a mutation run, never in each Stryker worker', async () => {
		const { default: strykerConfig } = await import('../../vitest.stryker.config.mjs');
		expect(strykerConfig.test?.globalSetup).toBeUndefined();
		const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
			scripts: Record<string, string>;
		};
		expect(scripts.premutate).toBe('node scripts/build-records.mjs');
	});

	// Stryker copies the checkout into its sandbox, ignored files included, and a crashed run keeps
	// the sandbox, so a copy of the real keys would stay behind.
	it('keeps real env files out of the Stryker sandbox', () => {
		const { ignorePatterns } = JSON.parse(readFileSync('stryker.config.json', 'utf8')) as {
			ignorePatterns?: string[];
		};
		expect(ignorePatterns).toEqual(
			expect.arrayContaining(['.env', '.env.*', '!.env.example', '.dev.vars', '.dev.vars.*'])
		);
	});

	// verdict.ts and the two rune modules Stryker leaves out are pinned by their mutants harnesses only
	// while something runs them. CI and the ship gate both run the gate chain, which must still end
	// with gate:size: the step after it needs the build.
	it('runs both mutants harnesses in the gate chain, before the build that ends it', () => {
		const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
			scripts: Record<string, string>;
		};
		expect(scripts['gate:mutants'].split(' && ')).toEqual([
			'node scripts/verdict.mutants.mjs',
			'node scripts/svelte-state.mutants.mjs'
		]);
		const chain = scripts.gate.split(' && ');
		expect(chain).toContain('npm run gate:mutants');
		expect(chain.at(-1)).toBe('npm run gate:size');
	});

	it('names a module whose only test runs in workerd or jsdom, once each', () => {
		expect(
			modulesTestedOnlyOutsideNode([
				'src/lib/ingest/read-notice.ts',
				'src/lib/ingest/read-notice.worker.test.ts',
				'src/lib/ingest/cache.ts',
				'src/lib/ingest/cache.worker.test.ts',
				'src/lib/ingest/cache.test.ts',
				'src/lib/ingest/orphan.worker.test.ts',
				'src/lib/profile/format.ts',
				'src/lib/profile/format.dom.test.ts',
				'src/lib/profile/format.worker.test.ts',
				'src/lib/profile/parse.ts',
				'src/lib/profile/parse.dom.test.ts',
				'src/lib/profile/parse.test.ts',
				'src/lib/profile/store.svelte.ts',
				'src/lib/profile/store.svelte.test.ts',
				'src/test/helper.ts',
				'src/test/helper.worker.test.ts'
			])
		).toEqual(['src/lib/ingest/read-notice.ts', 'src/lib/profile/format.ts']);
	});

	it.each(PROJECT_NAMES)('installs an outbound guard in the %s project', (name) => {
		expect(PROJECTS[name].setupFiles.some((file) => GUARD_FILES.includes(file))).toBe(true);
	});

	// The components render in jsdom, where a lazy import can outlive its test.
	it('settles pending imports after each jsdom test, from a file that exists', () => {
		expect(PROJECTS.jsdom.setupFiles).toContain(SETTLE_IMPORTS);
		expect(SRC_FILES).toContain(SETTLE_IMPORTS);
	});
});

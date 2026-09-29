import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Phase 1 draws no verdict (SPEC R3), so no component or route may import the verdict module (the
// no-ui-reaches-verdict rule in .dependency-cruiser.cjs covers reaching it through another module),
// and the errata colours belong to the verdict page of a later phase, so none of them may use those.
const ROOTS = [join('src', 'lib', 'components'), join('src', 'routes')];

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		const source = /\.(svelte|ts|js)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name);
		return source ? [path] : [];
	});
}

const VERDICT_IMPORT = /['"][^'"\n]*core\/verdict(?:\.ts|\.js)?['"]/;

// The names are read from the stylesheet that defines them, so a renamed token is still covered.
const ERRATA_NAMES = [
	...new Set(readFileSync(join('src', 'app.css'), 'utf8').match(/--errata[\w-]*/g) ?? [])
];

function breaches(text: string): string[] {
	return [
		...(VERDICT_IMPORT.test(text) ? ['imports the verdict module'] : []),
		...ERRATA_NAMES.filter((name) =>
			new RegExp(`${name.replace(/-/g, '\\-')}(?![\\w-])`).test(text)
		).map((name) => `references ${name}`)
	];
}

describe('source rules for components and routes', () => {
	const files = ROOTS.flatMap(sourceFiles);

	it('reads real files and the errata names the stylesheet defines', () => {
		expect(files.filter((file) => file.endsWith('.svelte')).length).toBeGreaterThan(30);
		expect(files.some((file) => file.endsWith('+page.server.ts'))).toBe(true);
		expect(ERRATA_NAMES).toEqual(['--errata', '--errata-ink']);
	});

	it('catches each breach it looks for', () => {
		expect(breaches("import { decideLot } from '$lib/core/verdict';")).toEqual([
			'imports the verdict module'
		]);
		expect(breaches("const v = await import('../../lib/core/verdict.ts');")).toEqual([
			'imports the verdict module'
		]);
		expect(breaches('.slip { background: var(--errata); color: var(--errata-ink); }')).toEqual([
			'references --errata',
			'references --errata-ink'
		]);
		expect(breaches("import { verdictLabel } from './verdictish';\n.x { --errata2: 0 }")).toEqual(
			[]
		);
	});

	it('finds no component or route importing the verdict module or using an errata colour', () => {
		const found = files.flatMap((file) =>
			breaches(readFileSync(file, 'utf8')).map((breach) => `${file}: ${breach}`)
		);
		expect(found).toEqual([]);
	});
});

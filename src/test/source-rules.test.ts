import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// No component or route may import the verdict module directly (the no-ui-reaches-verdict rule in
// .dependency-cruiser.cjs covers reaching it through another module).
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

function breaches(text: string): string[] {
	return VERDICT_IMPORT.test(text) ? ['imports the verdict module'] : [];
}

describe('source rules for components and routes', () => {
	const files = ROOTS.flatMap(sourceFiles);

	it('reads real files', () => {
		expect(files.filter((file) => file.endsWith('.svelte')).length).toBeGreaterThan(30);
		expect(files.some((file) => file.endsWith('+page.server.ts'))).toBe(true);
	});

	it('catches each breach it looks for', () => {
		expect(breaches("import { decideLot } from '$lib/core/verdict';")).toEqual([
			'imports the verdict module'
		]);
		expect(breaches("const v = await import('../../lib/core/verdict.ts');")).toEqual([
			'imports the verdict module'
		]);
		expect(breaches("import { verdictLabel } from './verdictish';")).toEqual([]);
	});

	it('finds no component or route importing the verdict module', () => {
		const found = files.flatMap((file) =>
			breaches(readFileSync(file, 'utf8')).map((breach) => `${file}: ${breach}`)
		);
		expect(found).toEqual([]);
	});
});

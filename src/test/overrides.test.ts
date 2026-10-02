import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// package.json pins undici under one exact miniflare (CVE-2026-85024, fixed in 7.29.1). npm applies
// an override keyed to a version only while that version is installed and says nothing once it
// stops matching. The CI scan covers dev dependencies, but it runs only on pushes to main and fails
// only on HIGH and CRITICAL. Dependabot reads dev dependencies too (it opened alert 2 for this
// advisory against main's lockfile at 2026-09-29 20:05 UTC), but only for the default branch and
// only as an alert after the merge, so a tooling update that lets the pin lapse is caught here
// first, in the pull request making it.
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
	overrides?: Record<string, unknown>;
};
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
	packages: Record<string, { version?: string }>;
};

function installedVersions(name: string): string[] {
	return Object.entries(lock.packages)
		.filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
		.map(([, entry]) => entry.version ?? '');
}

// "miniflare@5.20260911.0-alpha" names a package and an exact version; "@sveltejs/kit" names a
// package alone, so an @ at the start never splits it.
function versionKeyed(key: string): { key: string; name: string; version: string }[] {
	const at = key.lastIndexOf('@');
	return at > 0 ? [{ key, name: key.slice(0, at), version: key.slice(at + 1) }] : [];
}

function belowFixed(version: string): boolean {
	const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10));
	return major === 7 && (minor < 29 || (minor === 29 && patch < 1));
}

describe('dependency overrides', () => {
	const keyed = Object.keys(pkg.overrides ?? {}).flatMap(versionKeyed);

	it('reads the version-keyed override package.json holds', () => {
		expect(keyed.map((entry) => entry.key)).toEqual(['miniflare@5.20260911.0-alpha']);
		expect(versionKeyed('@sveltejs/kit')).toEqual([]);
	});

	it.each(keyed)('$key still names an installed version, so its pin applies', (entry) => {
		const installed = installedVersions(entry.name);
		expect(
			installed,
			`${entry.key} matches nothing installed (${entry.name} ${installed.join(', ') || 'absent'}): check what it pinned, then re-key or drop it`
		).toContain(entry.version);
	});

	it('leaves no undici of the 7 line below 7.29.1 installed (CVE-2026-85024)', () => {
		expect(['7.29.0', '7.28.9', '6.21.0', '7.29.1', '8.10.2'].map(belowFixed)).toEqual([
			true,
			true,
			false,
			false,
			false
		]);
		expect(installedVersions('undici').length).toBeGreaterThan(0);
		expect(installedVersions('undici').filter(belowFixed)).toEqual([]);
	});
});

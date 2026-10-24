import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// package.json pins undici (CVE-2026-109869, CVE-2026-109841 and CVE-2026-109924, fixed in 7.30.1)
// and sharp (GHSA-wq5f-xc86-pv6w, fixed in 0.35.5) under one exact miniflare, and points the exact
// zod pin of @cloudflare/vitest-plugin at the app's own zod (CVE-2023-54404, fixed in 4.6.6). jsdom's
// undici reaches 8.12.2 through its own range, with no override. npm applies an override keyed to a
// version only while that version is installed and says nothing once it stops matching. The CI scan covers dev dependencies, but it runs only on pushes to main and fails
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

// True when version sorts below floor (a release), comparing major, minor and patch as numbers. A
// pre-release sorts below its own release, so 0.35.5-rc.1 is below 0.35.5.
function sortsBelow(version: string, floor: string): boolean {
	const dash = version.indexOf('-');
	const release = dash === -1 ? version : version.slice(0, dash);
	const parts = release.split('.').map((part) => Number.parseInt(part, 10));
	const floorParts = floor.split('.').map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < 3; index += 1) {
		if (parts[index] !== floorParts[index]) return parts[index] < floorParts[index];
	}
	return dash !== -1;
}

// The undici advisories (GHSA-xjj6-f33q-929c, GHSA-f72v-6w45-q472, GHSA-4qv8-2p9j-2685) are fixed
// once per release line; a version on any other line is outside them.
const undiciFixedByLine: Record<string, string> = { '6': '6.29.1', '7': '7.30.1', '8': '8.12.2' };

function undiciBelowFixed(version: string): boolean {
	const floor = undiciFixedByLine[version.split('.')[0]];
	return floor !== undefined && sortsBelow(version, floor);
}

// The zod advisory (GHSA-mrhx-c7xc-m3w5) covers every version below 4.6.6.
function zodBelowFixed(version: string): boolean {
	return sortsBelow(version, '4.6.6');
}

// The sharp advisory covers every version below 0.35.5.
function sharpBelowFixed(version: string): boolean {
	return sortsBelow(version, '0.35.5');
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

	it('leaves no undici below the fixed release of its line installed (CVE-2026-109869)', () => {
		expect(
			[
				'7.30.0',
				'7.29.1',
				'7.30.1-beta.0',
				'8.12.1',
				'8.10.2',
				'6.29.0',
				'7.30.1',
				'8.12.2',
				'8.12.3',
				'6.29.1',
				'5.28.4',
				'9.0.0'
			].map(undiciBelowFixed)
		).toEqual([true, true, true, true, true, true, false, false, false, false, false, false]);
		expect(installedVersions('undici').length).toBeGreaterThan(0);
		expect(installedVersions('undici').filter(undiciBelowFixed)).toEqual([]);
	});

	it('leaves no zod below 4.6.6 installed (CVE-2023-54404)', () => {
		expect(
			['4.6.5', '4.6.2', '4.4.3', '3.25.76', '4.6.6-canary.0', '4.6.6', '4.6.7', '4.7.0'].map(
				zodBelowFixed
			)
		).toEqual([true, true, true, true, true, false, false, false]);
		expect(installedVersions('zod').length).toBeGreaterThan(0);
		expect(installedVersions('zod').filter(zodBelowFixed)).toEqual([]);
	});

	it('leaves no sharp below 0.35.5 installed (GHSA-wq5f-xc86-pv6w)', () => {
		expect(
			['0.35.4', '0.34.9', '0.35.5-rc.1', '0.35.5', '0.36.0-rc.1', '1.0.0'].map(sharpBelowFixed)
		).toEqual([true, true, true, false, false, false]);
		expect(installedVersions('sharp').length).toBeGreaterThan(0);
		expect(installedVersions('sharp').filter(sharpBelowFixed)).toEqual([]);
	});
});

import { fc, test } from '@fast-check/vitest';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// package.json pins undici and sharp under one exact miniflare, points the exact zod pin of
// @cloudflare/vitest-plugin at the app's own zod, and lifts the cookie of @sveltejs/kit. jsdom's
// undici reaches 8.12.2 through its own range, with no override. npm applies an override keyed to a version only while that version is
// installed and says nothing once it stops matching. The CI scan covers dev dependencies, but it
// runs only on pushes to main and fails only on HIGH and CRITICAL. Dependabot reads dev
// dependencies too (it opened alert 2, for the earlier undici advisory CVE-2026-85024, against
// main's lockfile at 2026-09-29 20:05 UTC), but only for the default branch and only as an alert
// after the merge, so a tooling update that lets a pin lapse is caught here first, in the pull
// request making it.
//
// The floors below are the first patched releases GitHub's advisory database lists (read
// 2026-10-24):
//   undici: GHSA-xjj6-f33q-929c (CVE-2026-109869, high), GHSA-f72v-6w45-q472 (CVE-2026-109841)
//     and GHSA-4qv8-2p9j-2685 (CVE-2026-109924), fixed in 6.29.1, 7.30.1 and 8.12.2; none
//     covers the 5 line or any line after 8
//   zod: GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404, high), every version below 4.6.6
//   sharp: GHSA-wq5f-xc86-pv6w (high, no CVE id), every version below 0.35.5
//   cookie: GHSA-pxg6-pf52-xh8x (CVE-2024-47764, low, so the CI scan never fails on it), every
//     version below 0.7.0
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
	overrides?: Record<string, unknown>;
};
type LockEntry = { name?: string; version?: string; link?: boolean };

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
	packages: Record<string, LockEntry>;
};

// Names a package the way the CI scan counts it (gates.yml): by the name its entry carries, else
// by its folder under node_modules, so an alias such as "undici7": "npm:undici@7" is read as
// undici. Links carry no version of their own, and the root entry is the app itself.
function isInstallOf(name: string, path: string, entry: LockEntry): boolean {
	if (path === '' || entry.link) return false;
	const at = path.lastIndexOf('node_modules/');
	return (entry.name ?? (at === -1 ? undefined : path.slice(at + 'node_modules/'.length))) === name;
}

function installedVersions(
	name: string,
	packages: Record<string, LockEntry> = lock.packages
): string[] {
	return Object.entries(packages)
		.filter(([path, entry]) => isInstallOf(name, path, entry))
		.map(([, entry]) => entry.version ?? '');
}

// A version that is not major.minor.patch (an entry with none, a URL) cannot be compared, so the
// floor checks count it as below the fix and the test names it instead of passing it.
function readableRelease(version: string): boolean {
	return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version);
}

// "miniflare@5.20260911.0-alpha" names a package and an exact version; "@sveltejs/kit" names a
// package alone, so an @ at the start never splits it.
function versionKeyed(key: string): { key: string; name: string; version: string }[] {
	const at = key.lastIndexOf('@');
	return at > 0 ? [{ key, name: key.slice(0, at), version: key.slice(at + 1) }] : [];
}

type KeyedOverride = ReturnType<typeof versionKeyed>[number];

// Every version-keyed override that picks a parent, at any depth. The pins under
// "miniflare@5.20260911.0-alpha": { ... } apply only while that miniflare is installed, and npm
// takes such a key nested under another parent as well as at the top. A version-keyed key whose
// value is a version string ("undici@7.29.1": "7.30.1") is not one: it replaces the copy it
// matches, so the keyed version is gone once it works, and the floor checks below cover it.
function parentSelectors(overrides: Record<string, unknown>): KeyedOverride[] {
	return Object.entries(overrides).flatMap(([key, value]) =>
		value !== null && typeof value === 'object'
			? [...versionKeyed(key), ...parentSelectors(value as Record<string, unknown>)]
			: []
	);
}

// Why a parent selector's pins would not apply, or null when they do. The installed copy is looked
// for anywhere in the lockfile, not under a parent's path, because npm hoists dependencies to the
// root node_modules. The check compares exact versions, so a key written as a range is named as one
// instead of being reported as matching nothing.
function selectorProblem(
	entry: KeyedOverride,
	packages: Record<string, LockEntry> = lock.packages
): string | null {
	if (!readableRelease(entry.version)) {
		return `${entry.key} is keyed by a range, which this check cannot compare: key it by the exact version installed`;
	}
	const installed = installedVersions(entry.name, packages);
	return installed.includes(entry.version)
		? null
		: `${entry.key} matches nothing installed (${entry.name} ${installed.join(', ') || 'absent'}): check what it pinned, then re-key or drop it`;
}

// True when version sorts below floor (a release), comparing major, minor and patch as numbers. A
// pre-release sorts below its own release, so 0.35.5-rc.1 is below 0.35.5. Build metadata after a
// + never changes the order, and a dash inside it does not mark a pre-release.
function sortsBelow(version: string, floor: string): boolean {
	const plus = version.indexOf('+');
	const core = plus === -1 ? version : version.slice(0, plus);
	const dash = core.indexOf('-');
	const release = dash === -1 ? core : core.slice(0, dash);
	const parts = release.split('.').map((part) => Number.parseInt(part, 10));
	const floorParts = floor.split('.').map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < 3; index += 1) {
		if (parts[index] !== floorParts[index]) return parts[index] < floorParts[index];
	}
	return dash !== -1;
}

// The first patched release of each advisory listed above, by major release line, or under '*'
// when one release fixes every line. A version on a line with no entry is outside the advisories.
const fixedReleases = {
	undici: { '6': '6.29.1', '7': '7.30.1', '8': '8.12.2' },
	zod: { '*': '4.6.6' },
	sharp: { '*': '0.35.5' },
	cookie: { '*': '0.7.0' }
} satisfies Record<string, Record<string, string>>;

function belowFixed(name: keyof typeof fixedReleases, version: string): boolean {
	if (!readableRelease(version)) return true;
	const floors: Record<string, string> = fixedReleases[name];
	const floor = floors[version.split('.')[0]] ?? floors['*'];
	return floor !== undefined && sortsBelow(version, floor);
}

// Each installed copy of name below its first patched release, as its lock path and version, so a
// failure says where the copy sits. A nested path also names the parent that pulled the copy in; a
// hoisted one (node_modules/cookie) does not, and npm explain names it instead.
function unfixedInstalls(
	name: keyof typeof fixedReleases,
	packages: Record<string, LockEntry> = lock.packages
): string[] {
	return Object.entries(packages)
		.filter(([path, entry]) => isInstallOf(name, path, entry))
		.filter(([, entry]) => belowFixed(name, entry.version ?? ''))
		.map(([path, entry]) => `${path} ${entry.version || '(no version)'}`);
}

function expectEveryInstallFixed(name: keyof typeof fixedReleases): void {
	expect(
		installedVersions(name).length,
		`${name} is no longer in package-lock.json: drop its floor here and any override for it`
	).toBeGreaterThan(0);
	expect(
		unfixedInstalls(name),
		`${name} below its first patched release: raise its override in package.json, or the parent that pulls it in (npm explain ${name} names it), then run npm install`
	).toEqual([]);
}

const undiciBelowFixed = (version: string) => belowFixed('undici', version);
const zodBelowFixed = (version: string) => belowFixed('zod', version);
const sharpBelowFixed = (version: string) => belowFixed('sharp', version);
const cookieBelowFixed = (version: string) => belowFixed('cookie', version);

describe('dependency overrides', () => {
	const keyed = parentSelectors(pkg.overrides ?? {});

	it('reads the parent selector package.json holds, nested ones included', () => {
		expect(keyed.map((entry) => entry.key)).toEqual(['miniflare@5.20260911.0-alpha']);
		expect(versionKeyed('@sveltejs/kit')).toEqual([]);
		expect(
			parentSelectors({
				miniflare: {
					'.': '5.0.0',
					'undici@7.29.1': '7.30.1',
					'sharp@0.35.0': { color: '4.2.3' }
				},
				'@sveltejs/kit': { cookie: '^0.7.2' },
				'@cloudflare/vitest-plugin': { zod: '$zod' },
				'undici@7.29.0': '7.30.1'
			}).map((entry) => entry.key)
		).toEqual(['sharp@0.35.0']);
	});

	it('reads a parent selector as applying only while its exact version is installed', () => {
		const planted: Record<string, LockEntry> = {
			'node_modules/miniflare': { version: '5.20260911.0-alpha' }
		};
		const problems = parentSelectors({
			'miniflare@5.20260911.0-alpha': { sharp: '0.35.5' },
			'miniflare@5.20260901.0-alpha': { sharp: '0.35.5' },
			'miniflare@^5.0.0': { sharp: '0.35.5' }
		}).map((entry) => selectorProblem(entry, planted));
		expect(problems[0]).toBeNull();
		expect(problems[1]).toContain('matches nothing installed (miniflare 5.20260911.0-alpha)');
		expect(problems[2]).toContain('is keyed by a range');
	});

	it.each(keyed)('$key still names an installed version, so its pin applies', (entry) => {
		expect(selectorProblem(entry)).toBeNull();
	});

	it('compares versions part by part as numbers, and ignores build metadata', () => {
		expect(
			[
				'7.4.0',
				'7.3.1',
				'7.30.0+build',
				'7.30.1-rc.1+build',
				'7.100.0',
				'7.30.10',
				'7.30.1+build.5',
				'7.30.1+build-5'
			].map(undiciBelowFixed)
		).toEqual([true, true, true, true, false, false, false, false]);
		expect(versionKeyed('@scope/pkg@1.2.3')).toEqual([
			{ key: '@scope/pkg@1.2.3', name: '@scope/pkg', version: '1.2.3' }
		]);
	});

	const release = fc.tuple(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }), fc.nat({ max: 1000 }));

	// Half the draws compare a version with its own release: two random releases almost never tie,
	// and the tie is where a pre-release or build metadata decides the answer.
	test.prop([
		release,
		release,
		fc.boolean(),
		fc.boolean(),
		fc.option(fc.stringMatching(/^[0-9A-Za-z.-]{1,8}$/), { nil: undefined })
	])(
		'orders any two releases as their numbers do, with a pre-release below its own release',
		(version, other, tie, pre, build) => {
			const floor = tie ? version : other;
			const text =
				version.join('.') + (pre ? '-rc.1' : '') + (build === undefined ? '' : `+${build}`);
			const differs = version.findIndex((part, index) => part !== floor[index]);
			const expected = differs === -1 ? pre : version[differs] < floor[differs];
			expect(readableRelease(text)).toBe(true);
			expect(sortsBelow(text, floor.join('.'))).toBe(expected);
		}
	);

	it('reads a lock entry by the name it carries, and an unreadable version as below the fix', () => {
		const planted: Record<string, LockEntry> = {
			'': { name: 'pagefifty', version: '0.0.1' },
			'node_modules/undici7': { name: 'undici', version: '7.29.1' },
			'node_modules/jsdom/node_modules/undici': { version: '8.12.2' },
			'node_modules/@scope/undici': { version: '1.0.0' },
			'node_modules/undici-types': { version: '7.30.1' },
			'node_modules/linked': { name: 'undici', link: true },
			'node_modules/undici': {}
		};
		expect(installedVersions('undici', planted)).toEqual(['7.29.1', '8.12.2', '']);
		expect(installedVersions('pagefifty', planted)).toEqual([]);
		expect(
			['', 'latest', 'git+https://example.invalid/undici.git', '7.30'].map(undiciBelowFixed)
		).toEqual([true, true, true, true]);
		expect(['', '4.6'].map(zodBelowFixed)).toEqual([true, true]);
		expect(['', '0.35'].map(sharpBelowFixed)).toEqual([true, true]);
		expect(unfixedInstalls('undici', planted)).toEqual([
			'node_modules/undici7 7.29.1',
			'node_modules/undici (no version)'
		]);
	});

	it('leaves no undici below the fixed release of its line installed (CVE-2026-109869, CVE-2026-109841, CVE-2026-109924)', () => {
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
		expectEveryInstallFixed('undici');
	});

	it('leaves no zod below 4.6.6 installed (CVE-2023-54404)', () => {
		expect(
			['4.6.5', '4.6.2', '4.4.3', '3.25.76', '4.6.6-canary.0', '4.6.6', '4.6.7', '4.7.0'].map(
				zodBelowFixed
			)
		).toEqual([true, true, true, true, true, false, false, false]);
		expectEveryInstallFixed('zod');
	});

	it('leaves no sharp below 0.35.5 installed (GHSA-wq5f-xc86-pv6w)', () => {
		expect(
			['0.35.4', '0.34.9', '0.35.5-rc.1', '0.35.5', '0.36.0-rc.1', '1.0.0'].map(sharpBelowFixed)
		).toEqual([true, true, true, false, false, false]);
		expectEveryInstallFixed('sharp');
	});

	it('leaves no cookie below 0.7.0 installed (CVE-2024-47764)', () => {
		expect(
			['0.6.0', '0.5.0', '0.7.0-rc.1', '0.7.0', '0.7.2', '1.1.1'].map(cookieBelowFixed)
		).toEqual([true, true, true, false, false, false]);
		expectEveryInstallFixed('cookie');
	});
});

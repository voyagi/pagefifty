// The capture's last step moves the staged folder to examples/<date>. A folder another process makes
// there in the meantime must never be replaced: POSIX rename(2) replaces an empty folder at the
// destination, and Windows refuses any folder there (EPERM, measured 2026-10-16). The first three
// tests play one rule each on whatever host runs them, so none passes only because its host refuses
// by itself; the last two use the host's own rename.
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
	type PathLike
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createFakeClock } from '../../test/ted-stub.ts';
import { errorCode, publish } from './capture-folder.ts';

vi.mock('node:fs', { spy: true });

let actual: typeof import('node:fs');
const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-publish-'));
let cases = 0;

beforeAll(async () => {
	actual = await vi.importActual<typeof import('node:fs')>('node:fs');
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

// A staged capture beside an examples/ folder that does not hold its day yet.
function stagedCapture() {
	cases += 1;
	const base = join(root, `case-${cases}`);
	const staging = join(base, '.capture-cache', 'staging', '2026-10-17-4242');
	mkdirSync(staging, { recursive: true });
	writeFileSync(join(staging, 'run.json'), '{}\n');
	return { staging, target: join(base, 'examples', '2026-10-17') };
}

// Another process that makes examples/<date> for itself just before each rename, as a plain mkdir
// would: it learns whether it made the folder, and the folder's inode says later whether the folder
// at the target is still that one.
function outsiderAt(target: string) {
	let made: bigint | undefined;
	return {
		act() {
			try {
				actual.mkdirSync(target);
				made = actual.statSync(target, { bigint: true }).ino;
			} catch (error) {
				if (errorCode(error) !== 'EEXIST') throw error;
			}
		},
		made: () => made
	};
}

const inodeOf = (path: string) => actual.statSync(path, { bigint: true }).ino;

function failure(code: string, from: PathLike, to: PathLike): Error {
	return Object.assign(new Error(`${code}: rename '${String(from)}' -> '${String(to)}'`), { code });
}

// POSIX rename(2) replaces an empty folder at the destination and refuses a full one; Windows refuses
// any folder there.
function renameUnder(rule: 'posix' | 'win32') {
	return (from: PathLike, to: PathLike) => {
		if (actual.existsSync(to)) {
			if (rule === 'win32') throw failure('EPERM', from, to);
			if (actual.readdirSync(to).length > 0) throw failure('ENOTEMPTY', from, to);
			actual.rmdirSync(to);
		}
		actual.renameSync(from, to);
	};
}

function renameWith(before: () => void, rename: (from: PathLike, to: PathLike) => void) {
	vi.mocked(renameSync).mockImplementation((from, to) => {
		before();
		rename(from, to);
	});
}

it('claims examples/<date> before the move under POSIX rules, so no folder another process makes is replaced', async () => {
	const { staging, target } = stagedCapture();
	const outsider = outsiderAt(target);
	renameWith(outsider.act, renameUnder('posix'));
	await expect(publish(staging, target, createFakeClock(0), 'linux')).resolves.toBeUndefined();
	expect(outsider.made(), 'the move replaced a folder another process made').toBeUndefined();
	expect(readdirSync(target)).toEqual(['run.json']);
	expect(existsSync(staging)).toBe(false);
});

it('fails the move under Windows rules, keeps the folder another process made and names the staged folder', async () => {
	const { staging, target } = stagedCapture();
	const outsider = outsiderAt(target);
	const clock = createFakeClock(0);
	renameWith(outsider.act, renameUnder('win32'));
	await expect(publish(staging, target, clock, 'win32')).rejects.toThrow(
		`could not move ${staging} to ${target} (EPERM: rename '${staging}' -> '${target}'); the capture is complete in ${staging}`
	);
	expect(outsider.made()).toBeDefined();
	expect(inodeOf(target)).toBe(outsider.made());
	expect(readdirSync(target)).toEqual([]);
	expect(readdirSync(staging)).toEqual(['run.json']);
	expect(clock.sleeps()).toEqual([200, 200, 200, 200]);
});

it('gives the claim back when the move fails, so no empty examples/<date> refuses the next run', async () => {
	const { staging, target } = stagedCapture();
	renameWith(
		() => undefined,
		(from, to) => {
			throw failure('EXDEV', from, to);
		}
	);
	await expect(publish(staging, target, createFakeClock(0), 'linux')).rejects.toThrow(
		`could not move ${staging} to ${target} (EXDEV: rename '${staging}' -> '${target}'); the capture is complete in ${staging}`
	);
	expect(existsSync(target)).toBe(false);
	expect(readdirSync(staging)).toEqual(['run.json']);
});

it('leaves a claimed folder another process has written into, and reports the failed move', async () => {
	const { staging, target } = stagedCapture();
	renameWith(() => actual.writeFileSync(join(target, 'theirs.txt'), 'x'), renameUnder('posix'));
	await expect(publish(staging, target, createFakeClock(0), 'linux')).rejects.toThrow(
		`could not move ${staging} to ${target} (ENOTEMPTY: rename '${staging}' -> '${target}'); the capture is complete in ${staging}`
	);
	expect(readdirSync(target)).toEqual(['theirs.txt']);
	expect(readdirSync(staging)).toEqual(['run.json']);
});

it.skipIf(process.platform === 'win32')(
	"claims the folder first under this host's own rename, so another process cannot make it",
	async () => {
		const { staging, target } = stagedCapture();
		const outsider = outsiderAt(target);
		renameWith(outsider.act, actual.renameSync);
		await expect(publish(staging, target, createFakeClock(0))).resolves.toBeUndefined();
		expect(outsider.made(), 'the move replaced a folder another process made').toBeUndefined();
		expect(readdirSync(target)).toEqual(['run.json']);
	}
);

it.runIf(process.platform === 'win32')(
	"fails the move under this host's own rename and keeps the folder another process made",
	async () => {
		const { staging, target } = stagedCapture();
		const outsider = outsiderAt(target);
		renameWith(outsider.act, actual.renameSync);
		await expect(publish(staging, target, createFakeClock(0))).rejects.toMatchObject({
			cause: { code: 'EPERM' }
		});
		expect(inodeOf(target)).toBe(outsider.made());
		expect(readdirSync(staging)).toEqual(['run.json']);
	}
);

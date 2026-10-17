import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { acquireLock, isAlive } from './lock.ts';

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

function lockPath(): string {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-capture-lock-'));
	roots.push(root);
	return join(root, '.capture-cache', 'capture.lock');
}

const HOLDER = { pid: 1234, startedAt: '2026-10-11T08:00:00.000Z', argv: ['--since', '20260920'] };
const OTHER = { pid: 5678, startedAt: '2026-10-11T07:00:00.000Z', argv: [] };
const FIRST = { pid: 9012, startedAt: '2026-10-11T08:00:01.000Z', argv: [] };

function plant(path: string, text: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, text);
}

describe('acquireLock', () => {
	it('writes the lock with the pid, start time and arguments, and release removes it', () => {
		const path = lockPath();
		const taken = acquireLock(path, HOLDER, () => true);
		expect(taken).toMatchObject({ ok: true });
		expect(taken).not.toHaveProperty('replaced');
		expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(HOLDER);
		if (!taken.ok) throw new Error('not taken');
		taken.release();
		expect(existsSync(path)).toBe(false);
	});

	it('refuses a second run while the holder lives, naming its pid and start time', () => {
		const path = lockPath();
		const first = acquireLock(path, OTHER, () => true);
		expect(first.ok).toBe(true);
		const alive = vi.fn(() => true);
		expect(acquireLock(path, HOLDER, alive)).toEqual({
			ok: false,
			holder: { pid: 5678, startedAt: '2026-10-11T07:00:00.000Z' }
		});
		expect(alive).toHaveBeenCalledWith(5678);
		expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(OTHER);
	});

	it('reports and replaces a lock whose process has ended', () => {
		const path = lockPath();
		plant(path, JSON.stringify(OTHER));
		const taken = acquireLock(path, HOLDER, () => false);
		expect(taken).toMatchObject({
			ok: true,
			replaced: { pid: 5678, startedAt: '2026-10-11T07:00:00.000Z' }
		});
		expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(HOLDER);
	});

	it('never removes a lock another run took after both found the same ended holder', () => {
		const path = lockPath();
		plant(path, JSON.stringify(OTHER));
		let first: ReturnType<typeof acquireLock> | undefined;
		// This run has read the ended holder and asks whether it lives; meanwhile another run that read
		// the same holder replaces it and takes the lock.
		const alive = (pid: number) => {
			if (pid !== OTHER.pid) return true;
			first ??= acquireLock(path, FIRST, (candidate) => candidate !== OTHER.pid);
			return false;
		};
		const second = acquireLock(path, HOLDER, alive);
		expect(first).toMatchObject({ ok: true, replaced: { pid: 5678 } });
		expect(second).toEqual({
			ok: false,
			holder: { pid: FIRST.pid, startedAt: FIRST.startedAt }
		});
		expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(FIRST);
		expect(existsSync(`${path}.replacing`)).toBe(false);
	});

	it('refuses and keeps an ended lock while another run is replacing it', () => {
		const path = lockPath();
		plant(path, JSON.stringify(OTHER));
		writeFileSync(`${path}.replacing`, JSON.stringify(FIRST));
		const result = acquireLock(path, HOLDER, () => false);
		expect(result).toEqual({ ok: false, replacing: `${path}.replacing` });
		expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(OTHER);
		expect(JSON.parse(readFileSync(`${path}.replacing`, 'utf8'))).toEqual(FIRST);
	});

	it.each([
		['empty', ''],
		['not JSON', '{"pid": 56'],
		['JSON null', 'null'],
		['a list', '[5678]'],
		['no pid', '{"startedAt":"2026-10-11T07:00:00.000Z","argv":[]}'],
		['a pid written as text', '{"pid":"5678","startedAt":"2026-10-11T07:00:00.000Z","argv":[]}'],
		['a pid that is not a positive whole number', '{"pid":-1,"startedAt":"x","argv":[]}'],
		['a fractional pid', '{"pid":56.5,"startedAt":"x","argv":[]}'],
		['no start time', '{"pid":5678,"argv":[]}']
	])('refuses and keeps a lock it cannot read (%s), never asking about a pid', (_case, text) => {
		const path = lockPath();
		plant(path, text);
		const alive = vi.fn(() => false);
		const result = acquireLock(path, HOLDER, alive);
		expect(result).toMatchObject({ ok: false, unreadable: expect.any(String) });
		expect(alive).not.toHaveBeenCalled();
		expect(readFileSync(path, 'utf8')).toBe(text);
	});
});

describe('isAlive', () => {
	it('says this process lives', () => {
		expect(isAlive(process.pid)).toBe(true);
	});

	it('says a child process this test started and saw exit is gone', () => {
		const child = spawnSync(process.execPath, ['--version'], { encoding: 'utf8' });
		expect(child.status).toBe(0);
		expect(typeof child.pid).toBe('number');
		expect(isAlive(child.pid as number)).toBe(false);
	});

	it('treats a pid that is not a positive whole number as gone, without asking the system', () => {
		const kill = vi.spyOn(process, 'kill');
		try {
			for (const pid of [0, -1, 1.5, Number.NaN]) expect(isAlive(pid), String(pid)).toBe(false);
			expect(kill).not.toHaveBeenCalled();
		} finally {
			kill.mockRestore();
		}
	});
});

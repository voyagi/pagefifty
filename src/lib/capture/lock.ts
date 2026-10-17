// .capture-cache/capture.lock: one capture run at a time (D-15). Imported under Node type stripping:
// erasable syntax only.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { errorCode } from './capture-folder.ts';

interface LockHolder {
	pid: number;
	startedAt: string;
	argv: readonly string[];
}

type Holder = Pick<LockHolder, 'pid' | 'startedAt'>;

type LockResult =
	| { ok: true; release(): void; replaced?: Holder }
	| { ok: false; holder: Holder }
	| { ok: false; unreadable: string }
	| { ok: false; replacing: string };

type ReadHolder = { ok: true; holder: Holder } | { ok: false; detail: string };

const isPid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

// process.kill with signal 0 sends nothing and throws when the pid is gone; EPERM means the process
// exists under another user. A value that is no pid is never handed to the system, since 0 and -1
// address process groups rather than one process.
export function isAlive(pid: number): boolean {
	if (!isPid(pid)) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCode(error) === 'EPERM';
	}
}

function readHolder(path: string): ReadHolder {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (error) {
		return { ok: false, detail: `it could not be read (${errorCode(error) || 'unknown error'})` };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, detail: text === '' ? 'it is empty' : 'it is not JSON' };
	}
	const { pid, startedAt } = (parsed ?? {}) as Record<string, unknown>;
	if (typeof parsed !== 'object' || Array.isArray(parsed) || !isPid(pid)) {
		return { ok: false, detail: 'it holds no process id' };
	}
	if (typeof startedAt !== 'string') return { ok: false, detail: 'it holds no start time' };
	return { ok: true, holder: { pid, startedAt } };
}

const sameHolder = (a: Holder, b: Holder) => a.pid === b.pid && a.startedAt === b.startedAt;

// Two runs can read the same ended holder; if each then removed the lock, the later removal would
// delete the lock the earlier run had just taken, and both would run. So a run first claims the
// replacement with a second 'wx' file and removes the lock only while it still names the holder read.
// A run that finds the claim taken is refused: the claimant is about to hold the lock, and a claim
// left by a run killed in that moment is left for a person, like a lock this command cannot read.
function removeEnded(
	path: string,
	ended: Holder,
	holder: LockHolder
): 'removed' | 'moved' | 'claimed' {
	const claim = `${path}.replacing`;
	try {
		writeFileSync(claim, JSON.stringify(holder), { flag: 'wx' });
	} catch (error) {
		if (errorCode(error) === 'EEXIST') return 'claimed';
		throw error;
	}
	try {
		const now = readHolder(path);
		if (!now.ok || !sameHolder(now.holder, ended)) return 'moved';
		rmSync(path, { force: true });
		return 'removed';
	} finally {
		rmSync(claim, { force: true });
	}
}

// The file is created with 'wx' and written after, so a second run can find it empty for a moment;
// a lock this command cannot read is therefore refused and left for a person, never replaced.
export function acquireLock(
	path: string,
	holder: LockHolder,
	alive: (pid: number) => boolean
): LockResult {
	mkdirSync(dirname(path), { recursive: true });
	let replaced: Holder | undefined;
	for (;;) {
		try {
			writeFileSync(path, JSON.stringify(holder), { flag: 'wx' });
			const release = () => rmSync(path, { force: true });
			return replaced ? { ok: true, release, replaced } : { ok: true, release };
		} catch (error) {
			if (errorCode(error) !== 'EEXIST') throw error;
		}
		const found = readHolder(path);
		if (!found.ok) return { ok: false, unreadable: found.detail };
		if (replaced !== undefined || alive(found.holder.pid)) {
			return { ok: false, holder: found.holder };
		}
		const removal = removeEnded(path, found.holder, holder);
		if (removal === 'claimed') return { ok: false, replacing: `${path}.replacing` };
		if (removal === 'removed') replaced = found.holder;
	}
}

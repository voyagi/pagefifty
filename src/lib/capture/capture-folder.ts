// The capture's day, its search window, its JSON files and the staged folder's move into
// examples/. Imported by scripts/capture.mjs under Node type stripping: erasable syntax only.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SERVER_TIME_ZONE } from '../core/deadline.ts';
import type { Clock } from './ted-client.ts';

const WINDOW_DAYS = 14;
const MOVE_TRIES = 5;
const MOVE_WAIT_MS = 200;
const HELD_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);

// The folder is named by the day in the buyers' zone: 00:30 CEST is still the previous UTC day.
export function captureDate(epochMs: number): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: SERVER_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date(epochMs));
	const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
}

export function defaultSince(captureDay: string): string {
	const [year, month, day] = captureDay.split('-').map(Number);
	const since = new Date(Date.UTC(year, month - 1, day - WINDOW_DAYS));
	return since.toISOString().slice(0, 10).replaceAll('-', '');
}

export function writeJsonFile(path: string, value: unknown, flag: 'w' | 'wx' = 'w'): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag });
}

const stagingDir = (root: string) => join(root, '.capture-cache', 'staging');

export function stagingPath(root: string, date: string, pid: number): string {
	return join(stagingDir(root), `${date}-${pid}`);
}

const STAGING_NAME = /^\d{4}-\d{2}-\d{2}-(\d+)$/;

// A run killed before its rename leaves its staging folder behind; the pid in the name says whose it
// was, and only a folder whose process is gone is removed, so a run in progress keeps its own.
export function removeDeadStaging(root: string, isAlive: (pid: number) => boolean): number {
	const dir = stagingDir(root);
	if (!existsSync(dir)) return 0;
	let removed = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const pid = STAGING_NAME.exec(entry.name)?.[1];
		if (!entry.isDirectory() || pid === undefined || isAlive(Number(pid))) continue;
		rmSync(join(dir, entry.name), { recursive: true, force: true, maxRetries: 5 });
		removed += 1;
	}
	return removed;
}

export const errorCode = (error: unknown) =>
	error instanceof Error && 'code' in error ? String(error.code) : '';

// An indexer or a virus scanner can hold a new file for a moment, and Windows then refuses the
// rename; a few short retries ride that out, and a failure names the staged folder so nothing is lost.
export async function publish(staging: string, target: string, clock: Clock): Promise<void> {
	if (existsSync(target)) {
		throw new Error(`${target} appeared during the run; the capture is complete in ${staging}`);
	}
	mkdirSync(dirname(target), { recursive: true });
	for (let attempt = 1; ; attempt += 1) {
		try {
			renameSync(staging, target);
			return;
		} catch (error) {
			if (attempt === MOVE_TRIES || !HELD_CODES.has(errorCode(error))) {
				const reason = error instanceof Error ? error.message : String(error);
				throw new Error(
					`could not move ${staging} to ${target} (${reason}); the capture is complete in ${staging}`,
					{
						cause: error
					}
				);
			}
			await clock.sleep(MOVE_WAIT_MS);
		}
	}
}

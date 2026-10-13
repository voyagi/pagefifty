// A capture folder entry that is neither a file, a folder nor a link (a named pipe, a socket, a
// device) cannot be made on Windows, so this file has lstat report one entry as a pipe. Opening a
// pipe with no writer blocks for good, so the walk must name such an entry and never open it.
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
	type Stats
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { folderProblems } from '../../test/capture-detectors.ts';
import { checkCaptureFolder } from './scrub-check.ts';

vi.mock('node:fs', { spy: true });

const root = mkdtempSync(join(tmpdir(), 'pagefifty-special-entry-'));

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

const PIPE_STATS = {
	isSymbolicLink: () => false,
	isDirectory: () => false,
	isFile: () => false,
	isFIFO: () => true
} as unknown as Stats;

it('names an entry that is not a regular file and never opens it', async () => {
	const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
	const dir = join(root, 'capture');
	mkdirSync(dir);
	writeFileSync(join(dir, 'notices.json'), '{}');
	const pipe = join(dir, 'pipe');
	writeFileSync(pipe, '');
	vi.mocked(lstatSync).mockImplementation(((path: string) =>
		path === pipe ? PIPE_STATS : actual.lstatSync(path)) as unknown as typeof lstatSync);
	expect(checkCaptureFolder(dir)).toEqual({
		files: 1,
		dirty: [],
		notText: [],
		links: [],
		special: ['pipe']
	});
	expect(folderProblems(dir)).toEqual([`${pipe}: not a regular file`]);
	expect(vi.mocked(readFileSync).mock.calls.map(([path]) => path)).not.toContain(pipe);
});

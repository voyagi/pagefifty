// Fixture readers for the node and jsdom projects. Paths are relative to the repository root,
// where vitest runs; the workerd project has no file system and uses Vite raw imports instead.
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	CAPTURE_ID,
	FIXTURE_ROLES,
	buildSynthetic,
	type RoleName,
	type SyntheticRoleName
} from './roles';

export function capturePath(notice: string): string {
	return join('examples', CAPTURE_ID, 'xml', `${notice}.xml`);
}

const readNotice = (notice: string) => readFileSync(capturePath(notice), 'utf8');

type FileLinker = (target: string, path: string, kind: 'file') => unknown;

export const NO_FILE_LINKS =
	'this machine cannot make a file link (Windows needs Developer Mode or elevation)';

// Windows makes a file link only with Developer Mode or elevation, while a junction needs neither,
// so a test that links a file asks here first and skips with NO_FILE_LINKS where it cannot. Only a
// refused right answers no: any other failure throws, so a broken temp folder is never a skip.
export function canLinkFiles(link: FileLinker = symlinkSync): boolean {
	const dir = mkdtempSync(join(tmpdir(), 'pagefifty-link-probe-'));
	try {
		writeFileSync(join(dir, 'target.txt'), '');
		link(join(dir, 'target.txt'), join(dir, 'link.txt'), 'file');
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
		throw error;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export function readFixture(role: RoleName, which = 0): string {
	const entry = FIXTURE_ROLES[role];
	if (entry.kind === 'synthetic') {
		return buildSynthetic(role as SyntheticRoleName, readNotice(entry.derivedFrom));
	}
	const ref = entry.notices.at(which);
	if (!ref || which < 0) throw new Error(`${role} has no notice at index ${which}`);
	return readNotice(ref.notice);
}

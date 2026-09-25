// Fixture readers for the node and jsdom projects. Paths are relative to the repository root,
// where vitest runs; the workerd project has no file system and uses Vite raw imports instead.
import { readFileSync } from 'node:fs';
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

export function readFixture(role: RoleName, which = 0): string {
	const entry = FIXTURE_ROLES[role];
	if (entry.kind === 'synthetic') {
		return buildSynthetic(role as SyntheticRoleName, readNotice(entry.derivedFrom));
	}
	const ref = entry.notices.at(which);
	if (!ref || which < 0) throw new Error(`${role} has no notice at index ${which}`);
	return readNotice(ref.notice);
}

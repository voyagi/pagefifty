import { describe, expect, it } from 'vitest';
import { canLinkFiles } from './node';

const failing = (code: string) => () => {
	throw Object.assign(new Error(`${code}: symlink`), { code });
};

describe('canLinkFiles', () => {
	it('says no when the system refuses a file link for want of the right to make one', () => {
		expect(canLinkFiles(failing('EPERM'))).toBe(false);
	});

	it('says yes when a file link is made, and asks for a file link', () => {
		const kinds: string[] = [];
		expect(canLinkFiles((_target, _path, kind) => kinds.push(kind))).toBe(true);
		expect(kinds).toEqual(['file']);
	});

	// Skipping on any failure would hide a broken temp folder behind a skipped test.
	it('throws any other failure instead of answering no', () => {
		expect(() => canLinkFiles(failing('ENOSPC'))).toThrow(/^ENOSPC/);
	});
});

// The one capture check scripts/scrub-capture.mjs and the capture command both run, called as a
// function on the tracked capture and on planted folders in the temp folder.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkCaptureFolder } from './scrub-check.ts';

const TRACKED = join('examples', '2026-09-15');

// Built rather than written out, so no literal in this file reads as someone's address.
const address = (local: string, at = '@') => `${local}${at}buyer.example`;

const fileCount = (dir: string) =>
	readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
		.length;

describe('checkCaptureFolder', () => {
	let root: string;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), 'pagefifty-scrub-check-'));
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const folder = (name: string, files: Record<string, string | Uint8Array>) => {
		const dir = join(root, name);
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(join(dir, path, '..'), { recursive: true });
			writeFileSync(join(dir, path), content);
		}
		return dir;
	};

	it('finds the tracked 2026-09-15 capture clean and counts every file in it', () => {
		const result = checkCaptureFolder(TRACKED);
		expect(result.files).toBe(fileCount(TRACKED));
		expect(result.files).toBeGreaterThanOrEqual(365);
		expect(result.dirty).toEqual([]);
		expect(result.notText).toEqual([]);
	});

	it('names notices.json and its kinds when an address sits under a nested contact key', () => {
		const dir = folder('nested-contact', {
			'notices.json': JSON.stringify({
				notices: [
					{
						'publication-number': '000001-2026',
						'organisation-contact-buyer': { deu: [address('vergabe')] }
					}
				]
			})
		});
		expect(checkCaptureFolder(dir)).toEqual({
			files: 1,
			dirty: ['notices.json: json-contact-key'],
			notText: []
		});
	});

	it('names an XML file whose free text writes an address with a character reference', () => {
		const dir = folder('encoded-xml', {
			[join('xml', '000002-2026.xml')]:
				`<cbc:Description>Contact ${address('vergabe', '&#64;')}</cbc:Description>\n`
		});
		expect(checkCaptureFolder(dir).dirty).toEqual([
			`${join('xml', '000002-2026.xml')}: encoded email`
		]);
	});

	it('lists a file under a text name whose bytes are not text as not text', () => {
		const dir = folder('packed', {
			[join('xml', '000003-2026.xml')]: Uint8Array.from([
				0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0xff, 0xfe, 0x9c
			])
		});
		expect(checkCaptureFolder(dir)).toEqual({
			files: 1,
			dirty: [],
			notText: [join('xml', '000003-2026.xml')]
		});
	});

	it('throws naming the file when a JSON file does not parse', () => {
		const dir = folder('broken', { 'notices.json': '{ "total": ' });
		expect(() => checkCaptureFolder(dir)).toThrow(/^notices\.json: /);
	});

	it('throws naming the folder when it cannot be read', () => {
		expect(() => checkCaptureFolder(join(root, 'no-such-folder'))).toThrow(/no-such-folder/);
	});

	it('reports no files for an empty folder rather than calling it clean', () => {
		const dir = join(root, 'empty');
		mkdirSync(dir);
		expect(checkCaptureFolder(dir)).toEqual({ files: 0, dirty: [], notText: [] });
	});
});

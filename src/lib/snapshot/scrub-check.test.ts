// The one capture check scripts/scrub-capture.mjs and the capture command both run, called as a
// function on the tracked capture and on planted folders in the temp folder.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLinkFiles, NO_FILE_LINKS } from '../../test/fixtures/node.ts';
import { checkCaptureFolder } from './scrub-check.ts';

const TRACKED = join('examples', '2026-09-15');
const FILE_LINKS = canLinkFiles();

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
		expect(result.links).toEqual([]);
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
			notText: [],
			links: []
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

	it('names an XML file whose free text writes the at sign as a hex reference', () => {
		const dir = folder('hex-xml', {
			[join('xml', '000004-2026.xml')]:
				`<cbc:Description>Contact ${address('vergabe', '&#x40;')}</cbc:Description>\n`
		});
		expect(checkCaptureFolder(dir).dirty).toEqual([
			`${join('xml', '000004-2026.xml')}: encoded email`
		]);
	});

	it('names notices.json when a contact key holds a number rather than the placeholder', () => {
		const dir = folder('number-contact', {
			'notices.json': JSON.stringify({ notices: [{ 'contact-phone': 31205550100 }] })
		});
		expect(checkCaptureFolder(dir).dirty).toEqual(['notices.json: json-contact-key']);
	});

	it('reads a file in a nested folder and names it by its path inside the capture', () => {
		const nested = join('xml', 'more', '000005-2026.xml');
		const dir = folder('nested-folder', {
			[nested]: `<cbc:Description>Contact ${address('vergabe')}</cbc:Description>\n`
		});
		expect(checkCaptureFolder(dir)).toEqual({
			files: 1,
			dirty: [`${nested}: email`],
			notText: [],
			links: []
		});
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
			notText: [join('xml', '000003-2026.xml')],
			links: []
		});
	});

	// Git keeps a link as the path it points at, never the bytes behind it, so the check would judge
	// bytes no commit holds. A link is named and its target never read.
	it('names a link to a file as a link and never reads the address behind it', (context) => {
		context.skip(!FILE_LINKS, NO_FILE_LINKS);
		const target = join(root, 'link-target.xml');
		writeFileSync(target, `<cbc:Description>Contact ${address('vergabe')}</cbc:Description>\n`);
		const dir = folder('linked', { 'notices.json': '{}' });
		mkdirSync(join(dir, 'xml'));
		symlinkSync(target, join(dir, 'xml', '000006-2026.xml'), 'file');
		expect(checkCaptureFolder(dir)).toEqual({
			files: 1,
			dirty: [],
			notText: [],
			links: [join('xml', '000006-2026.xml')]
		});
	});

	it('names a link that points at nothing as a link instead of failing on its read', (context) => {
		context.skip(!FILE_LINKS, NO_FILE_LINKS);
		const dir = join(root, 'dangling');
		mkdirSync(dir);
		symlinkSync(join(root, 'no-such-target.xml'), join(dir, 'gone.xml'), 'file');
		expect(checkCaptureFolder(dir)).toEqual({
			files: 0,
			dirty: [],
			notText: [],
			links: ['gone.xml']
		});
	});

	it('names a link to a folder as a link and reads none of the files behind it', () => {
		const outside = folder('link-folder-target', {
			'notes.txt': `Contact ${address('vergabe')}`
		});
		const dir = join(root, 'folder-link');
		mkdirSync(dir);
		symlinkSync(outside, join(dir, 'more'), process.platform === 'win32' ? 'junction' : 'dir');
		expect(checkCaptureFolder(dir)).toEqual({ files: 0, dirty: [], notText: [], links: ['more'] });
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
		expect(checkCaptureFolder(dir)).toEqual({ files: 0, dirty: [], notText: [], links: [] });
	});
});

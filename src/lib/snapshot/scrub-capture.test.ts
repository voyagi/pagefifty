// scripts/scrub-capture.mjs run as a person runs it, on a throwaway capture in the temp folder.
import { spawnSync } from 'node:child_process';
import {
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canLinkFiles, NO_FILE_LINKS } from '../../test/fixtures/node.ts';
import { SCRUB_PLACEHOLDER } from './scrub';

const SCRIPT = join('scripts', 'scrub-capture.mjs');
const FILE_LINKS = canLinkFiles();
const run = (...args: string[]) =>
	spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

// TED sends a multilingual field as an object keyed by language, so a contact field can too.
const NOTICES = {
	total: 1,
	notices: [
		{
			'publication-number': '000001-2026',
			'organisation-contact-buyer': { deu: ['Frau Beispiel'], eng: ['Mrs Example'] }
		}
	]
};

function writeCapture(dir: string): void {
	mkdirSync(join(dir, 'xml'), { recursive: true });
	writeFileSync(join(dir, 'notices.json'), `${JSON.stringify(NOTICES, null, 2)}\n`);
	writeFileSync(join(dir, 'fetch-log.json'), '{ "log": [] }\n');
	writeFileSync(
		join(dir, 'xml', '000001-2026.xml'),
		'<ContractNotice><cac:Contact><cbc:Name>Frau Beispiel</cbc:Name></cac:Contact></ContractNotice>\n'
	);
}

describe('scrub-capture.mjs', () => {
	let root: string;
	let source: string;
	let copy: string;

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), 'pagefifty-scrub-'));
		source = join(root, 'source');
		copy = join(root, 'copy');
		writeCapture(source);
		const scrubbed = run('--from', source, '--to', copy);
		expect(scrubbed.status, scrubbed.stderr).toBe(0);
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('replaces every value under a contact key, however deep it sits', () => {
		const written = JSON.parse(readFileSync(join(copy, 'notices.json'), 'utf8'));
		expect(written.notices[0]['organisation-contact-buyer']).toEqual({
			deu: [SCRUB_PLACEHOLDER],
			eng: [SCRUB_PLACEHOLDER]
		});
	});

	it('finds the copy clean and equal to its source outside the scrubbed spans', () => {
		const checked = run('--check', copy, '--against', source);
		expect(checked.stdout).toContain('0 with contact data');
		expect(checked.stdout).toContain('0 unexpected differences');
		expect(checked.stdout).toContain('replaced json-contact-key: 2');
		expect(checked.status, checked.stderr).toBe(0);
	});

	it('names a file that still holds a value under a nested contact key', () => {
		const checked = run('--check', source);
		expect(checked.stderr).toContain('notices.json: json-contact-key');
		expect(checked.stderr).toContain('000001-2026.xml: contact-name');
		expect(checked.status).toBe(1);
	});

	// The capture test fails on such a file too, and both read capture-files.ts, so they agree.
	it('names a file that is not text instead of calling the folder clean', () => {
		const packs = join(root, 'packs');
		mkdirSync(join(packs, 'documents'), { recursive: true });
		writeFileSync(join(packs, 'documents', 'terms.pdf'), '%PDF-1.7 compressed stream');
		writeFileSync(join(packs, 'notes.txt'), 'no contact data here');
		writeFileSync(join(packs, '.deslop-corpus'), '');
		const checked = run('--check', packs);
		expect(checked.stderr).toContain('not text, so no pattern can read it');
		expect(checked.stderr).toContain('terms.pdf');
		expect(checked.stderr).not.toContain('.deslop-corpus');
		expect(checked.stdout).toContain('0 with contact data, 1 not text');
		expect(checked.status).toBe(1);
	});

	// The scrub leaves an address written with character references alone, so the check must find it.
	it('names a file whose free text holds an address written with a character reference', () => {
		const encoded = join(root, 'encoded');
		mkdirSync(join(encoded, 'xml'), { recursive: true });
		writeFileSync(
			join(encoded, 'xml', '000002-2026.xml'),
			'<cbc:Description>Contact jana.beispiel&#64;buyer.example</cbc:Description>\n'
		);
		const checked = run('--check', encoded);
		expect(checked.stderr).toContain('000002-2026.xml: encoded email');
		expect(checked.status).toBe(1);
	});

	it('names a file under a text name whose bytes are not text', () => {
		const packed = join(root, 'packed');
		mkdirSync(join(packed, 'xml'), { recursive: true });
		writeFileSync(
			join(packed, 'xml', '000003-2026.xml'),
			Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0xff, 0xfe, 0x9c])
		);
		const checked = run('--check', packed);
		expect(checked.stderr).toContain('not text, so no pattern can read it');
		expect(checked.stderr).toContain('000003-2026.xml');
		expect(checked.status).toBe(1);
	});

	// Git keeps a link as the path it points at, so a link in a capture is refused, never read through.
	it('names a link in the folder and exits 1, without reading what it points at', () => {
		const linked = join(root, 'link-in-capture');
		mkdirSync(linked);
		writeFileSync(join(linked, 'notes.txt'), 'no contact data here');
		symlinkSync(
			join(source, 'xml'),
			join(linked, 'more'),
			process.platform === 'win32' ? 'junction' : 'dir'
		);
		const checked = run('--check', linked);
		expect(checked.stderr).toContain('a link, not a file');
		expect(checked.stderr).toContain('more');
		expect(checked.stderr).not.toContain('contact-name');
		expect(checked.stdout).toContain('checked 1 files');
		expect(checked.stdout).toContain('1 links refused');
		expect(checked.status).toBe(1);
	});

	it('exits 1, not 2, on a folder whose only entry is a link', () => {
		const onlyLink = join(root, 'only-link');
		mkdirSync(onlyLink);
		symlinkSync(
			join(source, 'xml'),
			join(onlyLink, 'more'),
			process.platform === 'win32' ? 'junction' : 'dir'
		);
		const checked = run('--check', onlyLink);
		expect(checked.stderr).toContain('a link, not a file');
		expect(checked.status).toBe(1);
	});

	it('exits 2 on a folder that holds no files', () => {
		const empty = join(root, 'empty');
		mkdirSync(empty);
		expect(run('--check', empty).status).toBe(2);
	});

	// A folder or file that cannot be read means nothing was checked, never that contact data was
	// found, so these take the could-not-run code and name what failed.
	it('exits 2 and names the folder when the folder to check does not exist', () => {
		const checked = run('--check', join(root, 'no-such-folder'));
		expect(checked.stderr).toContain('no-such-folder');
		expect(checked.status).toBe(2);
	});

	it('exits 2 and names the file when a JSON file does not parse', () => {
		const broken = join(root, 'broken');
		mkdirSync(broken);
		writeFileSync(join(broken, 'notices.json'), '{ "total": ');
		const checked = run('--check', broken);
		expect(checked.stderr).toContain('notices.json');
		expect(checked.status).toBe(2);
	});

	it('refuses an argument it does not know', () => {
		const refused = run('--form', source);
		expect(refused.stderr).toContain('unknown argument --form');
		expect(refused.status).toBe(1);
	});

	it('says which flag lacks its folder', () => {
		const refused = run('--check');
		expect(refused.stderr).toContain('--check needs a folder after it');
		expect(refused.status).toBe(1);
	});

	// The source capture is the only unscrubbed copy, and every later scrub fix is applied from it.
	it('refuses to write the copy over its own source, and leaves the source as it was', () => {
		const before = readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8');
		const refused = run('--from', source, '--to', join(source, '.'));
		expect(refused.stderr).toContain('would overwrite its source');
		expect(refused.status).toBe(1);
		expect(readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8')).toBe(before);
		const nested = run('--from', source, '--to', join(source, 'copy-inside'));
		expect(nested.stderr).toContain('one folder holds the other');
		expect(nested.status).toBe(1);
		const outer = run('--from', source, '--to', root);
		expect(outer.stderr).toContain('one folder holds the other');
		expect(outer.status).toBe(1);
	});

	// A junction on Windows needs no elevation, a directory symlink elsewhere; either way the path as
	// typed does not name the source, only the path the link leads to does.
	it('refuses a copy that reaches its source through a link', () => {
		const link = join(root, 'link-to-source');
		symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir');
		const before = readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8');
		const through = run('--from', source, '--to', link);
		expect(through.stderr).toContain('would overwrite its source');
		expect(through.status).toBe(1);
		const inside = run('--from', source, '--to', join(link, 'new-copy'));
		expect(inside.stderr).toContain('one folder holds the other');
		expect(inside.status).toBe(1);
		expect(readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8')).toBe(before);
	});

	it('refuses to write through a folder link inside the copy that leads back into the source', () => {
		const before = readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8');
		const linkedFolder = join(root, 'linked-xml');
		mkdirSync(linkedFolder);
		symlinkSync(
			join(source, 'xml'),
			join(linkedFolder, 'xml'),
			process.platform === 'win32' ? 'junction' : 'dir'
		);
		const throughFolder = run('--from', source, '--to', linkedFolder);
		expect(throughFolder.stderr).toContain('a link, so the copy would write through it');
		expect(throughFolder.status).toBe(1);
		expect(readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8')).toBe(before);
	});

	it('refuses to write through a file link inside the copy that leads back into the source', (context) => {
		context.skip(!FILE_LINKS, NO_FILE_LINKS);
		const beforeJson = readFileSync(join(source, 'notices.json'), 'utf8');
		const linkedFile = join(root, 'linked-json');
		mkdirSync(linkedFile);
		symlinkSync(join(source, 'notices.json'), join(linkedFile, 'notices.json'), 'file');
		const throughFile = run('--from', source, '--to', linkedFile);
		expect(throughFile.stderr).toContain('a link, so the copy would write through it');
		expect(throughFile.status).toBe(1);
		expect(readFileSync(join(source, 'notices.json'), 'utf8')).toBe(beforeJson);
	});

	// A hard link is an ordinary file entry, so no link check sees it: the copy must never write into
	// an existing file, only replace the entry.
	it('leaves the source alone when a copy file is a hard link to it', () => {
		const before = readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8');
		const hard = join(root, 'hard-linked');
		mkdirSync(join(hard, 'xml'), { recursive: true });
		linkSync(join(source, 'xml', '000001-2026.xml'), join(hard, 'xml', '000001-2026.xml'));
		const copied = run('--from', source, '--to', hard);
		expect(copied.status).toBe(0);
		expect(readFileSync(join(source, 'xml', '000001-2026.xml'), 'utf8')).toBe(before);
		expect(readFileSync(join(hard, 'xml', '000001-2026.xml'), 'utf8')).toContain(SCRUB_PLACEHOLDER);
	});

	it('refuses a copy into a child folder whose name starts with two dots', () => {
		const inside = run('--from', source, '--to', join(source, '..copy'));
		expect(inside.stderr).toContain('one folder holds the other');
		expect(inside.status).toBe(1);
	});

	// The scrub cannot see an address written with a character reference, so a copy that only
	// scrubbed would call such a capture clean. The copy checks what it wrote.
	it('fails a copy whose source hides an address the scrub cannot see', () => {
		const hidden = join(root, 'hidden-source');
		writeCapture(hidden);
		writeFileSync(
			join(hidden, 'xml', '000002-2026.xml'),
			'<ContractNotice><cbc:Note>mail vergabe&#64;buyer.example</cbc:Note></ContractNotice>\n'
		);
		const copied = run('--from', hidden, '--to', join(root, 'hidden-copy'));
		expect(copied.stderr).toContain('000002-2026.xml: encoded email');
		expect(copied.status).toBe(1);
	});

	it('names a JSON file in the destination that the source does not hold', () => {
		const reused = join(root, 'reused-json');
		mkdirSync(reused);
		writeFileSync(join(reused, 'old-notices.json'), '{}\n');
		const copied = run('--from', source, '--to', reused);
		expect(copied.stderr).toContain('old-notices.json: in');
		expect(copied.status).toBe(1);
	});

	it('names a notice in the destination that the source does not hold', () => {
		const reused = join(root, 'reused');
		mkdirSync(join(reused, 'xml'), { recursive: true });
		writeFileSync(join(reused, 'xml', '000009-2026.xml'), '<ContractNotice/>\n');
		const copied = run('--from', source, '--to', reused);
		expect(copied.stderr).toContain('000009-2026.xml');
		expect(copied.stderr).toContain('not in the source capture');
		expect(copied.status).toBe(1);
		const checked = run('--check', reused, '--against', source);
		expect(checked.stderr).toContain('000009-2026.xml: not in the source capture');
		expect(checked.status).toBe(1);
	});

	it('names a JSON value that writes an address with a character reference', () => {
		const encoded = join(root, 'encoded-json');
		mkdirSync(encoded);
		writeFileSync(join(encoded, 'notices.json'), '{ "note": "mail vergabe&#64;buyer.example" }\n');
		const checked = run('--check', encoded);
		expect(checked.stderr).toContain('notices.json: encoded email');
		expect(checked.status).toBe(1);
	});
});

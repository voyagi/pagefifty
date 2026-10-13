import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CAPTURE_TEXT_TYPES,
	decodeCharacterReferences,
	isUnreadableCaptureFile
} from './capture-files';
import { SCRUB_PLACEHOLDER } from './scrub';
import {
	captureFiles,
	captureFolders,
	censusElements,
	contactOffenders,
	contactStrings,
	contactStringsInFile,
	criterionCensus,
	folderProblems,
	isCaptureText,
	touchedCriteria,
	unreadableFiles,
	unscrubbedElements
} from '../../test/capture-detectors.ts';
import { canLinkFiles, NO_FILE_LINKS } from '../../test/fixtures/node.ts';

const CAPTURE = 'examples/2026-09-15';
const FILE_LINKS = canLinkFiles();

// The counts further down belong to the 2026-09-15 capture alone.
const CAPTURES = captureFolders('examples');

const xmlDir = join(CAPTURE, 'xml');
const xmlFiles = readdirSync(xmlDir)
	.filter((name) => name.endsWith('.xml'))
	.sort();
const jsonFiles = ['notices.json', 'fetch-log.json'];

describe('the detectors (positive controls)', () => {
	it('EMAIL_PATTERN and the ASCII pattern match a planted address', () => {
		expect(contactStrings('write to someone@example.com today')).toEqual([
			'someone@example.com',
			'someone@example.com'
		]);
	});

	it('the keyword check flags a planted number after a keyword', () => {
		expect(contactStrings('Kontakt Tel.: +31 20 000 0000 bis Freitag')).toEqual([
			'Tel.: +31 20 000 0000 ',
			'+31 20 000 0000'
		]);
		expect(contactStrings('<cbc:CompanyID>t:0345000000</cbc:CompanyID>')).toEqual(['t:0345000000']);
		expect(contactStrings(`Tel.: ${SCRUB_PLACEHOLDER}`)).toEqual([]);
	});

	it.each([
		['Rückfragen Tel.-Nr.: 0228 000000 bitte', 'Tel.-Nr.: 0228 000000 '],
		['Telefonnummer 0228 000000', 'Telefonnummer 0228 000000'],
		['Mobil: 0171 0000000', 'Mobil: 0171 0000000'],
		['GSM 0470 00 00 00', 'GSM 0470 00 00 00'],
		['Fon: 0228 000000', 'Fon: 0228 000000'],
		['Rufnummer 0228 000000', 'Rufnummer 0228 000000'],
		['Tél. : 02 000 00 00', 'Tél. : 02 000 00 00']
	])(
		'the keyword check flags a number after a number word or a mobile word in %j',
		(text, found) => {
			expect(contactStrings(text)).toEqual([found]);
		}
	);

	it('the bracketed-at check flags an address written with (at)', () => {
		expect(contactStrings('Fragen an vergabe(at)buyer.example bitte')).toEqual([
			'vergabe(at)buyer.example'
		]);
		expect(contactStrings('Preis (at) 5 EUR')).toEqual([]);
	});

	it.each([
		['Bitte wenden Sie sich an Frau Beispiel.', 'Frau Beispiel'],
		['z. Hd. Herrn Dr. Muster', 'Herrn Dr. Muster'],
		['contact met de heer J. Voorbeeld', 'de heer J.'],
		['Madame Exemple, service achats', 'Madame Exemple'],
		['attn. Mrs Example', 'Mrs Example']
	])('the address-form check flags the name after the form of address in %j', (text, found) => {
		expect(contactStrings(text)).toEqual([found]);
	});

	it.each([
		'Frauen und Männer',
		`Frau ${SCRUB_PLACEHOLDER}`,
		'Mo.-Fr. 9-17 Uhr',
		'Herrschaft',
		'mevrouw of meneer'
	])('the address-form check leaves %j alone', (text) => {
		expect(contactStrings(text)).toEqual([]);
	});

	it('the file check names a non-empty file it cannot read as text, and only that', () => {
		const text = new TextEncoder().encode('plain text, Straße 1');
		expect(isUnreadableCaptureFile('capture/documents/pack.pdf', text)).toBe(true);
		expect(isUnreadableCaptureFile('capture/documents/pack.zip', text)).toBe(true);
		expect(isUnreadableCaptureFile('capture/.deslop-corpus', new Uint8Array())).toBe(false);
		expect(
			CAPTURE_TEXT_TYPES.filter((type) => isUnreadableCaptureFile(`capture/file${type}`, text))
		).toEqual([]);
	});

	// A ZIP saved under a text name decodes to noise that no pattern reads, so it is named too.
	it('the file check names a file under a text name whose bytes are not text', () => {
		const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0xff, 0xfe, 0x9c]);
		expect(
			CAPTURE_TEXT_TYPES.filter((type) => isUnreadableCaptureFile(`capture/file${type}`, zip))
		).toEqual([...CAPTURE_TEXT_TYPES]);
		const nul = new TextEncoder().encode('tel\u0000 0228 000000');
		expect(isUnreadableCaptureFile('capture/notes.txt', nul)).toBe(true);
	});

	it('lists a capture folder with no xml folder, and every file in it however deep', () => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-captures-'));
		try {
			mkdirSync(join(root, '2026-10-10', 'documents', 'lot-1'), { recursive: true });
			writeFileSync(join(root, '2026-10-10', 'documents', 'lot-1', 'terms.txt'), 'text');
			writeFileSync(join(root, '2026-10-10', 'notices.json'), '{}');
			expect(captureFolders(root)).toEqual([`${root}/2026-10-10`]);
			expect(captureFiles(`${root}/2026-10-10`)).toEqual([
				join(root, '2026-10-10', 'documents', 'lot-1', 'terms.txt'),
				join(root, '2026-10-10', 'notices.json')
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it.each([
		[
			'an XML decimal reference',
			'x.xml',
			'Contact jana.beispiel&#64;buyer.example',
			'jana.beispiel@buyer.example'
		],
		[
			'an XML hex reference',
			'x.xml',
			'Fragen an vergabe&#x40;buyer.example',
			'vergabe@buyer.example'
		],
		[
			'a JSON unicode escape',
			'x.json',
			'{"note":"mail vergabe\\u0040buyer.example"}',
			'vergabe@buyer.example'
		],
		['a plus sign as a reference', 'x.xml', 'Bonn &#43;49 228 00000 http', '+49 228 00000']
	])('the file check finds an address or number written with %s', (_form, path, text, found) => {
		expect(contactStringsInFile(path, text)).toContain(found);
	});

	it('the file check finds nothing in text whose references spell no contact data', () => {
		expect(contactStringsInFile('x.xml', 'Caf&#233; &amp;#64; Beispiel &#;')).toEqual([]);
	});

	it('decodes decimal and hex references and leaves anything else as written', () => {
		expect(
			decodeCharacterReferences('a&#64;b &#x40; &#X40; &#233; &amp;#64; &#; &#99999999;')
		).toBe('a@b @ @ é &amp;#64; &#; &#99999999;');
	});

	it('the plus check flags a planted international number with no keyword', () => {
		expect(contactStrings('Bonn Deutschland +49 228 00000 http')).toEqual(['+49 228 00000']);
	});

	it('the element check flags a planted telephone value and a contact name behind a comment', () => {
		const planted =
			'<cac:Contact><!--BT-502--><cbc:Name>Office</cbc:Name>' +
			'<cbc:Telephone>+31 20 000 0000</cbc:Telephone></cac:Contact><cbc:Name>Lot</cbc:Name>';
		expect(censusElements(planted).unscrubbed).toEqual([
			'cbc:Telephone at 53',
			'contact cbc:Name at 26'
		]);
		expect(censusElements(planted).checked).toEqual({ 'cbc:Telephone': 1, 'contact cbc:Name': 1 });
	});

	it('the element check flags a planted person name in a touch point', () => {
		const planted =
			'<efac:TouchPoint><cac:PartyName><cbc:Name languageID="NLD">Jan Voorbeeld</cbc:Name>' +
			'</cac:PartyName></efac:TouchPoint><efac:Company><cbc:Name>Gemeente</cbc:Name></efac:Company>';
		expect(censusElements(planted).unscrubbed).toEqual(['touchpoint cbc:Name at 32']);
		expect(censusElements(planted).checked).toEqual({ 'touchpoint cbc:Name': 1 });
	});

	it('the element check reads the names of a contact block that never closes', () => {
		const planted = '<cac:Contact><cbc:Name>Office</cbc:Name>';
		expect(censusElements(planted).unscrubbed).toEqual(['contact cbc:Name at 13']);
	});

	it('the criterion check counts a criterion that holds the placeholder', () => {
		const criterion = (text: string) =>
			`<efac:SelectionCriteria><cbc:Description>${text}</cbc:Description></efac:SelectionCriteria>`;
		expect(
			criterionCensus(
				criterion('Umsatz 1.500.000 EUR') + criterion(`Referenz ${SCRUB_PLACEHOLDER}`)
			)
		).toEqual({ criteria: 2, touched: 1 });
	});

	// The tracked capture writes every opening tag bare (1375 of 1375), so only a planted one proves
	// a later capture's attributed criterion is still read.
	it('the criterion check counts a criterion whose opening tag carries an attribute', () => {
		const attributed =
			'<efac:SelectionCriteria xmlns:efac="urn:x">\n<cbc:Description>Referenz ' +
			`${SCRUB_PLACEHOLDER}</cbc:Description></efac:SelectionCriteria>`;
		expect(criterionCensus(attributed)).toEqual({ criteria: 1, touched: 1 });
		expect(criterionCensus('<efac:SelectionCriteriaList></efac:SelectionCriteriaList>')).toEqual({
			criteria: 0,
			touched: 0
		});
	});
});

describe('every capture folder under examples', () => {
	it('finds the 2026-09-15 capture among them', () => {
		expect(CAPTURES).toContain(CAPTURE);
	});

	// Every test that reads a whole capture gets 30 s: under the ship gate's load one took 5.3 s,
	// past vitest's 5 s default, and failed on time alone.
	it.each(CAPTURES)(
		'%s holds no file these checks cannot read as text',
		(capture) => {
			expect(unreadableFiles(capture)).toEqual([]);
		},
		30_000
	);

	it.each(CAPTURES)(
		'%s carries no email address, telephone number or name after a form of address in any file',
		(capture) => {
			expect(contactOffenders(capture)).toEqual([]);
		},
		30_000
	);

	it.each(CAPTURES)(
		'%s reads the placeholder in every contact element and every contact or touch point name',
		(capture) => {
			expect(unscrubbedElements(capture)).toEqual([]);
		},
		30_000
	);

	it.each(CAPTURES)(
		'%s keeps every selection criterion free of the placeholder',
		(capture) => {
			expect(touchedCriteria(capture)).toEqual([]);
		},
		30_000
	);
});

describe('one verdict over a capture folder', () => {
	it.each(CAPTURES)(
		'%s has no problem in the folder-wide verdict',
		(capture) => {
			expect(folderProblems(capture)).toEqual([]);
		},
		30_000
	);

	it('names the copy of a tracked notice with an address planted in its email element', () => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-verdict-'));
		try {
			const folder = join(root, '2026-10-13');
			const file = join(folder, 'xml', '600367-2026.xml');
			const tracked = readFileSync(join(xmlDir, '600367-2026.xml'), 'utf8');
			const element = `<cbc:ElectronicMail>${SCRUB_PLACEHOLDER}</cbc:ElectronicMail>`;
			const at = tracked.indexOf(element);
			expect(at).toBeGreaterThan(0);
			const address = ['vergabe', 'buyer.example'].join('@');
			mkdirSync(join(folder, 'xml'), { recursive: true });
			writeFileSync(
				file,
				tracked.replace(element, `<cbc:ElectronicMail>${address}</cbc:ElectronicMail>`)
			);
			expect(folderProblems(folder)).toEqual([
				`${file}: ${address}`,
				`${file} cbc:ElectronicMail at ${at}`
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// Git keeps a link as the path it points at, so the bytes behind it are never what a commit holds.
	it('names a link to a file in the folder as a link and never reads the address behind it', (context) => {
		context.skip(!FILE_LINKS, NO_FILE_LINKS);
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-verdict-'));
		try {
			const target = join(root, 'link-target.txt');
			const address = ['vergabe', 'buyer.example'].join('@');
			writeFileSync(target, `Contact ${address}\n`);
			const folder = join(root, '2026-10-13');
			mkdirSync(folder);
			writeFileSync(join(folder, 'notices.json'), '{}');
			const link = join(folder, 'notes.txt');
			symlinkSync(target, link, 'file');
			expect(folderProblems(folder)).toEqual([`${link}: a link, not a file`]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('names a link to a folder as a link and reads none of the files behind it', () => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-verdict-'));
		try {
			const outside = join(root, 'outside');
			mkdirSync(outside);
			writeFileSync(
				join(outside, 'notes.txt'),
				`Contact ${['vergabe', 'buyer.example'].join('@')}`
			);
			const folder = join(root, '2026-10-13');
			mkdirSync(folder);
			writeFileSync(join(folder, 'notices.json'), '{}');
			const link = join(folder, 'more');
			symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
			expect(folderProblems(folder)).toEqual([`${link}: a link, not a file`]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	// A command test over a folder that was never written would otherwise pass on four empty lists.
	it('names a folder that holds no files instead of calling it clean', () => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-verdict-'));
		try {
			const folder = join(root, '2026-10-13');
			mkdirSync(join(folder, 'xml'), { recursive: true });
			expect(folderProblems(folder)).toEqual([`${folder}: no files, so nothing was checked`]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('throws naming a JSON file in the folder that does not parse', () => {
		const root = mkdtempSync(join(tmpdir(), 'pagefifty-verdict-'));
		try {
			const folder = join(root, '2026-10-13');
			mkdirSync(folder);
			writeFileSync(join(folder, 'notices.json'), '{ "total": ');
			expect(() => folderProblems(folder)).toThrow(/notices\.json: /);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe(`the tracked capture ${CAPTURE}`, () => {
	it('holds all 363 notices and both JSON files', () => {
		expect(xmlFiles).toHaveLength(363);
		for (const name of xmlFiles) expect(name).toMatch(/^\d{6}-\d{4}\.xml$/);
		const top = readdirSync(CAPTURE);
		expect(top).toEqual(expect.arrayContaining([...jsonFiles, 'README.md', 'xml']));
	});

	it('keeps the capture instant and count in notices.json', () => {
		const notices = JSON.parse(readFileSync(join(CAPTURE, 'notices.json'), 'utf8')) as {
			fetchedAt: string;
			total: number;
			notices: unknown[];
		};
		expect(notices.fetchedAt).toBe('2026-09-15T19:50:49.157Z');
		expect(notices.total).toBe(363);
		expect(notices.notices).toHaveLength(363);
	});

	it('scans both JSON files, the README and every notice in the folder-wide checks', () => {
		expect(captureFiles(CAPTURE).filter(isCaptureText)).toHaveLength(
			jsonFiles.length + 1 + xmlFiles.length
		);
	});

	// The folder-wide check above finds no touched criterion; this pins how many it read.
	it('reads all 1375 selection criteria in the criterion check', () => {
		let criteria = 0;
		for (const name of xmlFiles) {
			criteria += criterionCensus(readFileSync(join(xmlDir, name), 'utf8')).criteria;
		}
		expect(criteria).toBe(1375);
	}, 30_000);

	it('reads the placeholder in every email, telephone and fax element and every contact or touch point name', () => {
		const totals: Record<string, number> = {};
		const unscrubbed: string[] = [];
		for (const name of xmlFiles) {
			const census = censusElements(readFileSync(join(xmlDir, name), 'utf8'));
			for (const [tag, count] of Object.entries(census.checked))
				totals[tag] = (totals[tag] ?? 0) + count;
			unscrubbed.push(...census.unscrubbed.map((where) => `${name} ${where}`));
		}
		expect(unscrubbed).toEqual([]);
		expect(totals).toEqual({
			'cbc:ElectronicMail': 1184,
			'cbc:Telephone': 1139,
			'cbc:Telefax': 282,
			'contact cbc:Name': 281,
			'touchpoint cbc:Name': 130
		});
	}, 30_000);
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capturePath, readFixture } from '../../test/fixtures/node';
import { toBcp47 } from './languages';
import { toNoticeRecord } from './record';
import { MAX_NOTICE_BYTES, readNotice, readNoticeXml, type ReadFailure } from './read-notice';

const encode = (text: string) => new TextEncoder().encode(text);
const captured = (notice: string) => readFileSync(capturePath(notice), 'utf8');

function read(text: string, noticeNumber = '609955-2026') {
	return readNotice(encode(text), { noticeNumber });
}

function readOk(text: string, noticeNumber = '609955-2026') {
	const result = read(text, noticeNumber);
	if (!result.ok) {
		throw new Error(`expected ${noticeNumber} to read, got ${result.kind}: ${result.detail}`);
	}
	return result.record;
}

function refused(text: string, noticeNumber = '609955-2026'): ReadFailure {
	const result = read(text, noticeNumber);
	if (result.ok) throw new Error(`expected ${noticeNumber} to be refused, but it read`);
	return result;
}

const ONE_LOT = readFixture('one-lot');
const PROCEDURE_TITLE =
	'<cbc:Name languageID="DEU">Bildungscampus Naumburg, Schönburger Straße, 06618 Naumburg, Los 4-09 Gebäudeautomation</cbc:Name>';

describe('readNotice on the one-lot notice 609955-2026', () => {
	it('reads its notice number and SDK version as published strings', () => {
		const record = readOk(ONE_LOT);
		expect(record.noticeNumber).toBe('609955-2026');
		expect(record.sdkVersion).toBe('eforms-sdk-1.13');
	});

	it('reads the procedure title in German with lang de and the raw code kept', () => {
		expect(readOk(ONE_LOT).title).toEqual({
			text: 'Bildungscampus Naumburg, Schönburger Straße, 06618 Naumburg, Los 4-09 Gebäudeautomation',
			lang: 'de',
			rawLang: 'DEU'
		});
	});

	it('reads one buyer with its name and country', () => {
		expect(readOk(ONE_LOT).buyers).toEqual([
			{ name: { text: 'Burgenlandkreis', lang: 'de', rawLang: 'DEU' }, country: 'DEU' }
		]);
	});

	it('reads one lot LOT-0000 whose tender deadline keeps its published offset', () => {
		const { lots } = readOk(ONE_LOT);
		expect(lots.map((lot) => lot.id)).toEqual(['LOT-0000']);
		expect(lots[0].deadlines).toEqual({ tender: '2026-10-06T10:30:00+02:00' });
		expect(lots[0].title?.lang).toBe('de');
	});
});

describe('readNotice across the capture', () => {
	it('reads a request deadline and no tender deadline on 607074-2026', () => {
		const { lots } = readOk(readFixture('request-deadline-only'), '607074-2026');
		expect(lots[0].deadlines).toEqual({ request: '2026-09-29T12:00:00+02:00' });
	});

	it('reads both deadlines when a lot publishes both', () => {
		const { lots } = readOk(readFixture('both-deadlines'), '607074-2026');
		expect(lots[0].deadlines).toEqual({
			request: '2026-09-29T12:00:00+02:00',
			tender: '2026-10-20T12:00:00+02:00'
		});
	});

	it('reads no deadline for a lot that publishes neither', () => {
		expect(readOk(readFixture('neither-deadline')).lots[0].deadlines).toEqual({});
	});

	it('keeps the seventeen lots of 600457-2026 in document order', () => {
		const { lots } = readOk(readFixture('largest'), '600457-2026');
		expect(lots.map((lot) => lot.id)).toEqual(
			Array.from({ length: 17 }, (_, index) => `LOT-${String(index + 1).padStart(4, '0')}`)
		);
	});

	it('lists all nine buyers of the joint procurement 611918-2026', () => {
		const { buyers } = readOk(captured('611918-2026'), '611918-2026');
		expect(buyers).toHaveLength(9);
		expect(new Set(buyers.map((buyer) => buyer.name.text)).size).toBe(9);
	});

	it('reads a notice on eForms SDK 1.14', () => {
		expect(readOk(readFixture('sdk-1.14'), '604971-2026').sdkVersion).toBe('eforms-sdk-1.14');
	});

	it('decodes an escaped ampersand in a published title', () => {
		expect(readOk(captured('605318-2026'), '605318-2026').title.text).toContain(
			'gemeente Putten & gemeente Bunschoten'
		);
	});

	it('decodes each entity and character reference exactly once', () => {
		const text = ONE_LOT.replace(
			PROCEDURE_TITLE,
			'<cbc:Name languageID="DEU">A &amp;lt; B &#252;&#x00FC; &quot;C&apos;s&quot; &gt; D &#x110000; &lt;E</cbc:Name>'
		);
		expect(readOk(text).title.text).toBe('A &lt; B üü "C\'s" > D &#x110000; <E');
	});

	// XML 1.0 Char: #x9, #xA, #xD, #x20 to #xD7FF, #xE000 to #xFFFD, #x10000 to #x10FFFF.
	it.each([
		['#x8', false],
		['#x9', true],
		['#xA', true],
		['#xB', false],
		['#xC', false],
		['#xD', true],
		['#0', false],
		['#x1F', false],
		['#x20', true],
		['#xD7FF', true],
		['#xD800', false],
		['#xDFFF', false],
		['#xE000', true],
		['#xFFFD', true],
		['#xFFFE', false],
		['#xFFFF', false],
		['#x10000', true],
		['#x10FFFF', true]
	] as const)('decodes &%s; only when XML allows that character: %s', (reference, legal) => {
		const text = ONE_LOT.replace(
			PROCEDURE_TITLE,
			`<cbc:Name languageID="DEU">A&${reference};B</cbc:Name>`
		);
		const hex = reference.startsWith('#x');
		const code = Number.parseInt(reference.slice(hex ? 2 : 1), hex ? 16 : 10);
		const expected = legal ? `A${String.fromCodePoint(code)}B` : `A&${reference};B`;
		expect(readOk(text).title.text).toBe(expected);
	});

	it('reads a byte order mark and CRLF line ends to the same record', () => {
		expect(readOk(readFixture('bom-crlf'))).toEqual(readOk(ONE_LOT));
	});
});

describe('readNotice record details', () => {
	const secondTitle = (replacement: string) => {
		const at = ONE_LOT.indexOf(PROCEDURE_TITLE, ONE_LOT.indexOf(PROCEDURE_TITLE) + 1);
		return ONE_LOT.slice(0, at) + replacement + ONE_LOT.slice(at + PROCEDURE_TITLE.length);
	};

	it('prefers the title in the notice language over one listed first', () => {
		const text = ONE_LOT.replace(
			PROCEDURE_TITLE,
			`<cbc:Name languageID="ENG">Education campus</cbc:Name>${PROCEDURE_TITLE}`
		);
		expect(readOk(text).title.lang).toBe('de');
		const english = text.replace('>DEU</cbc:NoticeLanguageCode>', '>ENG</cbc:NoticeLanguageCode>');
		expect(readOk(english).title).toEqual({ text: 'Education campus', lang: 'en', rawLang: 'ENG' });
	});

	it('keeps a title with no language code as text alone', () => {
		const text = ONE_LOT.replace(PROCEDURE_TITLE, '<cbc:Name>Plain title</cbc:Name>');
		expect(readOk(text).title).toEqual({ text: 'Plain title' });
	});

	it('keeps an unknown language code as the raw code, with no lang', () => {
		const text = ONE_LOT.replace(PROCEDURE_TITLE, '<cbc:Name languageID="XYZ">Titel</cbc:Name>');
		expect(readOk(text).title).toEqual({ text: 'Titel', rawLang: 'XYZ' });
	});

	it('reads a lot with no title of its own', () => {
		expect(readOk(secondTitle('')).lots[0].title).toBeUndefined();
	});

	it('takes the offset from EndDate when EndTime has none', () => {
		const text = ONE_LOT.replace(
			'<cbc:EndTime>10:30:00+02:00</cbc:EndTime>',
			'<cbc:EndTime>10:30:00</cbc:EndTime>'
		);
		expect(readOk(text).lots[0].deadlines.tender).toBe('2026-10-06T10:30:00+02:00');
	});

	it('reads a notice with no publication id of its own', () => {
		const text = ONE_LOT.replace(
			/<efbc:NoticePublicationID[^>]*>[^<]*<\/efbc:NoticePublicationID>/,
			''
		);
		expect(readOk(text, '609956-2026').noticeNumber).toBe('609956-2026');
	});

	it('refuses a tree with no ContractNotice root when handed one directly', () => {
		expect(toNoticeRecord({}, '609955-2026')).toEqual({
			ok: false,
			detail: 'missing ContractNotice'
		});
	});
});

describe('readNotice refusals of incomplete records', () => {
	it.each([
		[
			'the procedure title',
			(text: string) => text.replace(PROCEDURE_TITLE, ''),
			'ContractNotice/cac:ProcurementProject/cbc:Name'
		],
		[
			'every lot',
			(text: string) =>
				text.replace(/<cac:ProcurementProjectLot>[\s\S]*<\/cac:ProcurementProjectLot>/, ''),
			'ContractNotice/cac:ProcurementProjectLot'
		],
		[
			'the lot identifier',
			(text: string) => text.replace('<cbc:ID schemeName="Lot">LOT-0000</cbc:ID>', ''),
			'ContractNotice/cac:ProcurementProjectLot/cbc:ID'
		],
		[
			'the contracting party',
			(text: string) => text.replace(/<cac:ContractingParty>[\s\S]*?<\/cac:ContractingParty>/, ''),
			'ContractNotice/cac:ContractingParty'
		],
		[
			"the buyer's organisation",
			(text: string) =>
				text.replace(
					'<cbc:ID schemeName="organization">ORG-0001</cbc:ID>',
					'<cbc:ID schemeName="organization">ORG-0009</cbc:ID>'
				),
			'efac:Organization ORG-0001'
		],
		[
			"the buyer's name",
			(text: string) => text.replace('<cbc:Name languageID="DEU">Burgenlandkreis</cbc:Name>', ''),
			'efac:Organization ORG-0001/cac:PartyName/cbc:Name'
		],
		[
			"the buyer's country",
			(text: string) =>
				text.replace('<cbc:IdentificationCode listName="country">DEU</cbc:IdentificationCode>', ''),
			'efac:Organization ORG-0001/cac:PostalAddress/cac:Country/cbc:IdentificationCode'
		],
		[
			'the tender deadline time',
			(text: string) => text.replace('<cbc:EndTime>10:30:00+02:00</cbc:EndTime>', ''),
			'cac:TenderSubmissionDeadlinePeriod/cbc:EndTime'
		],
		[
			'a readable tender deadline date',
			(text: string) =>
				text.replace(
					'<cbc:EndDate>2026-10-06+02:00</cbc:EndDate>',
					'<cbc:EndDate>6 Oct 2026</cbc:EndDate>'
				),
			'cac:TenderSubmissionDeadlinePeriod is not a date and time with an offset'
		]
	])('refuses a notice without %s, naming it', (_what, edit, named) => {
		const text = edit(ONE_LOT);
		expect(text).not.toBe(ONE_LOT);
		const result = refused(text);
		expect(result.kind).toBe('malformed');
		expect(result.detail).toContain(named);
	});

	it('refuses a root that does not declare a prefix it uses', () => {
		const text = ONE_LOT.replace(
			' xmlns:efbc="http://data.europa.eu/p27/eforms-ubl-extension-basic-components/1"',
			''
		);
		expect(refused(text).detail).toBe('ContractNotice does not declare efbc');
	});

	it('refuses another default namespace', () => {
		const text = ONE_LOT.replace(
			'xmlns="urn:oasis:names:specification:ubl:schema:xsd:ContractNotice-2"',
			'xmlns="urn:example:other"'
		);
		expect(refused(text).detail).toContain('namespace prefix (default)');
	});

	it('refuses elements nested deeper than the parser allows', () => {
		const deep = `${'<x>'.repeat(120)}${'</x>'.repeat(120)}`;
		const text = ONE_LOT.replace('<cbc:UBLVersionID>', `${deep}<cbc:UBLVersionID>`);
		expect(refused(text).detail).toMatch(/^the parser stopped/);
	});
});

describe('readNotice refusals', () => {
	it('refuses a notice one byte over the size cap before decoding it', () => {
		const result = read(readFixture('oversize'));
		expect(result).toMatchObject({ ok: false, kind: 'too-large' });
	});

	it('does not refuse a notice exactly at the size cap for its size', () => {
		const padding = MAX_NOTICE_BYTES - encode(ONE_LOT).length - '<!---->'.length;
		const atCap = ONE_LOT.replace(/^(<\?xml[^>]*\?>)/, `$1<!--${'x'.repeat(padding)}-->`);
		expect(encode(atCap).length).toBe(MAX_NOTICE_BYTES);
		expect(read(atCap).ok).toBe(true);
	});

	it('refuses a DOCTYPE with an entity declaration', () => {
		expect(read(readFixture('doctype-entity'))).toMatchObject({ ok: false, kind: 'doctype' });
	});

	it('refuses an ENTITY declaration anywhere in the text', () => {
		const text = ONE_LOT.replace('<cbc:UBLVersionID>', '<!ENTITY probe "x"><cbc:UBLVersionID>');
		expect(read(text)).toMatchObject({ ok: false, kind: 'doctype' });
	});

	it('refuses a file cut inside a start tag', () => {
		expect(read(readFixture('truncated'))).toMatchObject({ ok: false, kind: 'malformed' });
	});

	it('refuses bytes that are not UTF-8', () => {
		const bytes = encode(ONE_LOT);
		bytes[200] = 0xff;
		expect(readNotice(bytes, { noticeNumber: '609955-2026' })).toMatchObject({
			ok: false,
			kind: 'malformed'
		});
	});

	it('refuses a root other than ContractNotice', () => {
		const text = ONE_LOT.replace('<ContractNotice ', '<PlannedNotice ').replace(
			'</ContractNotice>',
			'</PlannedNotice>'
		);
		expect(read(text)).toMatchObject({ ok: false, kind: 'malformed' });
	});

	it('refuses a known prefix bound to another namespace', () => {
		const text = ONE_LOT.replace(
			'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
			'xmlns:cbc="urn:example:not-ubl"'
		);
		const result = refused(text);
		expect(result.kind).toBe('malformed');
		expect(result.detail).toContain('namespace prefix cbc');
	});

	it('accepts the zero-padded publication id TED writes and refuses another number', () => {
		expect(ONE_LOT).toContain('>00609955-2026</efbc:NoticePublicationID>');
		expect(read(ONE_LOT, '609955-2026').ok).toBe(true);
		expect(read(ONE_LOT, '609956-2026')).toMatchObject({ ok: false, kind: 'malformed' });
	});

	it('names the path of a missing required element', () => {
		const text = ONE_LOT.replace('<cbc:CustomizationID>eforms-sdk-1.13</cbc:CustomizationID>', '');
		const result = refused(text);
		expect(result.kind).toBe('malformed');
		expect(result.detail).toContain('ContractNotice/cbc:CustomizationID');
	});

	it('returns a typed failure from readNoticeXml, never a partial tree', () => {
		const result = readNoticeXml(encode(readFixture('truncated')));
		expect(result.ok).toBe(false);
		expect('tree' in result).toBe(false);
	});
});

describe('toBcp47', () => {
	it.each([
		['DEU', 'de'],
		['NLD', 'nl'],
		['FRA', 'fr'],
		['ENG', 'en'],
		['GLE', 'ga'],
		['SWE', 'sv']
	])('maps %s to %s', (code, tag) => {
		expect(toBcp47(code)).toBe(tag);
	});

	it.each(['XYZ', 'de', '', 'DEUT'])('returns undefined for %j', (code) => {
		expect(toBcp47(code)).toBeUndefined();
	});
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capturePath, readFixture } from '../../test/fixtures/node';
import { FIXTURE_ROLES, type RoleName } from '../../test/fixtures/roles';
import { NoticeRecordSchema } from '../snapshot/index-row';
import { toBcp47 } from './languages';
import { readNotice } from './read-notice';
import { safeLink, type LotRecord, type NoticeRecord } from './record';

function noticeOf(role: RoleName, which: number): string {
	const entry = FIXTURE_ROLES[role];
	return entry.kind === 'synthetic' ? entry.derivedFrom : entry.notices[which].notice;
}

function readText(text: string, noticeNumber: string): NoticeRecord {
	const result = readNotice(new TextEncoder().encode(text), { noticeNumber });
	if (!result.ok) throw new Error(`${noticeNumber} did not read: ${result.kind}: ${result.detail}`);
	expect(NoticeRecordSchema.safeParse(result.record).success).toBe(true);
	return result.record;
}

const readRole = (role: RoleName, which = 0) =>
	readText(readFixture(role, which), noticeOf(role, which));

// Independent of the reader: the lot blocks and criterion codes as they stand in the notice text.
const lotBlocks = (text: string) => text.split('<cac:ProcurementProjectLot>').slice(1);
const publishedCodes = (block: string) =>
	[...block.matchAll(/listName="selection-criterion">([^<]*)</g)].map((match) => match[1]);
const codesOf = (lot: LotRecord) => lot.criteria.map((criterion) => criterion.code);
const everyDescription = (record: NoticeRecord) =>
	record.lots.flatMap((lot) => lot.criteria.flatMap((criterion) => criterion.descriptions));

function inLot(text: string, lot: number, anchor: string, replacement: string): string {
	const blocks = text.split('<cac:ProcurementProjectLot>');
	const block = blocks[lot + 1];
	if (!block.includes(anchor)) throw new Error(`lot ${lot} has no ${anchor}`);
	blocks[lot + 1] = block.replace(anchor, replacement);
	return blocks.join('<cac:ProcurementProjectLot>');
}

const ONE_LOT_URI = 'https://www.evergabe-online.de/tenderdocuments.html?id=887787';
const OPEN_REFERENCE = '<cac:CallForTendersDocumentReference>';
const CLOSE_REFERENCE = '</cac:CallForTendersDocumentReference>';

const documentsReference = (type: string, uri: string) =>
	`${OPEN_REFERENCE}<cbc:ID>added</cbc:ID><cbc:DocumentType>${type}</cbc:DocumentType>` +
	`<cac:Attachment><cac:ExternalReference><cbc:URI>${uri}</cbc:URI></cac:ExternalReference>` +
	`</cac:Attachment>${CLOSE_REFERENCE}`;

// The one-lot notice with a documents reference added before or after its own open one.
function withAddedReference(where: 'before' | 'after', type: string, uri: string): string {
	const added = documentsReference(type, uri);
	return where === 'before'
		? inLot(readFixture('one-lot'), 0, OPEN_REFERENCE, `${added}${OPEN_REFERENCE}`)
		: inLot(readFixture('one-lot'), 0, CLOSE_REFERENCE, `${CLOSE_REFERENCE}${added}`);
}

describe('the one-lot notice 609955-2026', () => {
	const record = readRole('one-lot');
	const [lot] = record.lots;

	it('pairs six criteria with their one German description each, in publication order', () => {
		expect(codesOf(lot)).toEqual([
			'slc-stand-other',
			'slc-suit-reg-trade',
			'slc-suit-reg-prof',
			'slc-stand-to-gen',
			'slc-stand-ins',
			'slc-stand-other'
		]);
		for (const criterion of lot.criteria) {
			expect(criterion.descriptions).toHaveLength(1);
			expect(criterion.descriptions[0]).toMatchObject({ lang: 'de', rawLang: 'DEU' });
			expect(criterion.parameters).toEqual([]);
		}
		expect(lot.criteria[0].descriptions[0].text).toMatch(/^Mit dem Angebot abzugeben:\n1\.\) /);
		expect(lot.criteria[4].descriptions[0].text).toContain('Betriebshaftpflichtversicherung');
	});

	it('reads the criteria source, the reserved code and no legal form for the group', () => {
		expect(lot.criteriaSources).toEqual(['epo-notice']);
		expect(lot.reserved).toBe('none');
		expect(lot.groupLegalForm).toBeUndefined();
	});

	it('reads the legal basis, the national legislation and the notice subtype as published', () => {
		expect(record.legalBasis).toBe('32014L0024');
		expect(record.nationalLegislation).toEqual([
			{ id: 'vgv', description: { text: 'EU-VOB/A', lang: 'de', rawLang: 'DEU' } }
		]);
		expect(record.noticeSubtype).toBe('16');
		expect(record.changeReasons).toEqual([]);
	});

	it('keeps the estimated value as the published decimal string with its currency', () => {
		expect(record.estimatedValue).toEqual({ amount: '834550.06', currency: 'EUR' });
		expect(lot.estimatedValue).toEqual({ amount: '834550.06', currency: 'EUR' });
	});

	it('reads the main and additional CPV codes once each', () => {
		expect(record.cpv).toEqual({ main: ['45315700'], additional: ['48921000'] });
	});

	it('adds CPV codes a lot names but the procedure does not, after the procedure ones', () => {
		const cpv = (code: string) =>
			`<cbc:ItemClassificationCode listName="cpv">${code}</cbc:ItemClassificationCode>`;
		const mainOnLot = inLot(readFixture('one-lot'), 0, cpv('45315700'), cpv('72000000'));
		const text = inLot(
			mainOnLot,
			0,
			'<cac:AdditionalCommodityClassification>',
			`<cac:AdditionalCommodityClassification>${cpv('72212000')}</cac:AdditionalCommodityClassification>` +
				'<cac:AdditionalCommodityClassification>'
		);
		expect(readText(text, '609955-2026').cpv).toEqual({
			main: ['45315700', '72000000'],
			additional: ['48921000', '72212000']
		});
	});

	it('reads a procedure note apart from the lot notes', () => {
		const text = readFixture('one-lot').replace(
			'<cac:RequestedTenderTotal>',
			'<cbc:Note languageID="DEU">Hinweis zum Verfahren</cbc:Note><cac:RequestedTenderTotal>'
		);
		const read = readText(text, '609955-2026');
		expect(read.procedureNotes).toEqual([
			{ text: 'Hinweis zum Verfahren', lang: 'de', rawLang: 'DEU' }
		]);
		expect(read.lots[0].notes).toHaveLength(1);
	});

	it('reads the documents link on the lot, with an https target', () => {
		expect(lot.documents).toEqual({ published: ONE_LOT_URI, href: ONE_LOT_URI });
		expect(record.documents).toBeUndefined();
	});

	it('reads the lot note and no procedure note', () => {
		expect(record.procedureNotes).toEqual([]);
		expect(lot.notes).toHaveLength(1);
		expect(lot.notes[0]).toMatchObject({ lang: 'de', rawLang: 'DEU' });
		expect(lot.notes[0].text).toMatch(/^#Besonders auch geeignet für:selbst#\n/);
	});
});

describe('criteria stay on their own lot', () => {
	it.each([
		['same-code-in-two-lots', 0, 'slc-stand-other', 2],
		['same-code-in-two-lots', 1, 'slc-stand-to-gen', 2],
		['largest', 0, 'slc-stand-ins', 17]
	] as const)('%s notice %i holds %s in each of its %i lots', (role, which, code, lots) => {
		const text = readFixture(role, which);
		const record = readText(text, noticeOf(role, which));
		expect(record.lots).toHaveLength(lots);
		const blocks = lotBlocks(text);
		record.lots.forEach((lot, index) => {
			expect(codesOf(lot), lot.id).toEqual(publishedCodes(blocks[index]));
			expect(codesOf(lot), lot.id).toContain(code);
		});
	});

	it('keeps lots in document order', () => {
		const text = readFixture('largest');
		const ids = lotBlocks(text).map(
			(block) => /^(?:\s|<!--[\s\S]*?-->)*<cbc:ID schemeName="Lot">([^<]*)</.exec(block)?.[1]
		);
		expect(ids).toHaveLength(17);
		expect(ids.every(Boolean)).toBe(true);
		expect(readText(text, '600457-2026').lots.map((lot) => lot.id)).toEqual(ids);
	});
});

describe('descriptions by language', () => {
	it('keeps a French and a Dutch description of one criterion in publication order', () => {
		const [first] = readRole('multilingual-criterion').lots[0].criteria;
		expect(first.descriptions.map(({ lang, rawLang }) => [lang, rawLang])).toEqual([
			['fr', 'FRA'],
			['nl', 'NLD']
		]);
		expect(first.descriptions[1].text).toMatch(/^Een lijst van de belangrijkste leveringen/);
	});

	it('reads the same description strings from a byte order mark and CRLF line ends', () => {
		const original = everyDescription(readRole('one-lot'));
		expect(original.length).toBeGreaterThan(0);
		expect(everyDescription(readRole('bom-crlf'))).toEqual(original);
	});

	it.each([
		['BUL', 'bg'],
		['CES', 'cs'],
		['DAN', 'da'],
		['DEU', 'de'],
		['ELL', 'el'],
		['ENG', 'en'],
		['EST', 'et'],
		['FIN', 'fi'],
		['FRA', 'fr'],
		['GLE', 'ga'],
		['HRV', 'hr'],
		['HUN', 'hu'],
		['ITA', 'it'],
		['LAV', 'lv'],
		['LIT', 'lt'],
		['MLT', 'mt'],
		['NLD', 'nl'],
		['POL', 'pl'],
		['POR', 'pt'],
		['RON', 'ro'],
		['SLK', 'sk'],
		['SLV', 'sl'],
		['SPA', 'es'],
		['SWE', 'sv']
	])('maps the EU official language %s to %s', (code, tag) => {
		expect(toBcp47(code)).toBe(tag);
	});

	it('keeps an unknown language code on a criterion as the raw code, with no lang', () => {
		const text = readFixture('one-lot').replace(
			'<cbc:Description languageID="DEU">Mit dem Angebot abzugeben:\n1.)',
			'<cbc:Description languageID="XKX">Mit dem Angebot abzugeben:\n1.)'
		);
		const [first] = readText(text, '609955-2026').lots[0].criteria;
		expect(first.descriptions[0].rawLang).toBe('XKX');
		expect(first.descriptions[0]).not.toHaveProperty('lang');
	});
});

describe('criteria sources and empty criteria', () => {
	it('reads an ESPD-only lot with an empty criteria list', () => {
		const [lot] = readRole('espd-only').lots;
		expect(lot.id).toBe('LOT-0000');
		expect(lot.criteriaSources).toEqual(['epo-sub-espd']);
		expect(lot.criteria).toEqual([]);
	});

	it('reads a lot with no selection-criteria element as an empty list, not a failure', () => {
		const [lot] = readRole('notice-source-no-criteria').lots;
		expect(lot.criteriaSources).toEqual(['epo-notice']);
		expect(lot.criteria).toEqual([]);
	});

	it('refuses a criterion without its code, naming the lot', () => {
		const text = readFixture('one-lot').replace(
			'<cbc:TendererRequirementTypeCode listName="selection-criterion">slc-stand-ins</cbc:TendererRequirementTypeCode>',
			''
		);
		const result = readNotice(new TextEncoder().encode(text), { noticeNumber: '609955-2026' });
		expect(result).toMatchObject({ ok: false, kind: 'malformed' });
		expect(result.ok ? '' : result.detail).toContain(
			'cac:ProcurementProjectLot[LOT-0000]/efac:SelectionCriteria/cbc:TendererRequirementTypeCode'
		);
	});
});

describe('values stay strings', () => {
	it('keeps "1.500" in the criterion text of 609345-2026 as written', () => {
		const record = readRole('decimal-in-text');
		expect(everyDescription(record).some(({ text }) => text.includes('1.500'))).toBe(true);
	});

	it('keeps the criterion parameters of 607074-2026 as string pairs with their code list', () => {
		const [lot] = readRole('change-notice').lots;
		expect(lot.criteria).toHaveLength(9);
		expect(lot.criteria[0].parameters).toEqual([
			{ listName: 'number-weight', code: 'ord-imp', value: '1' }
		]);
		const values = lot.criteria.flatMap((criterion) => criterion.parameters.map((p) => p.value));
		expect(values).toEqual(['1', '1', '2', '2', '1', '1', '1', '2', '2']);
	});

	it('keeps an estimated value of 0 as the string "0"', () => {
		expect(readRole('value-under-floor').estimatedValue).toEqual({ amount: '0', currency: 'EUR' });
	});
});

describe('legal basis, change reasons and SDK versions', () => {
	it('reads the legal basis 32024R2509 of 604971-2026', () => {
		expect(readRole('other-legal-basis', 0).legalBasis).toBe('32024R2509');
	});

	it('reads the legal basis "other" of 635218-2026, with no documents link anywhere', () => {
		const record = readRole('other-legal-basis', 1);
		expect(record.legalBasis).toBe('other');
		expect(record.noticeSubtype).toBe('E3');
		expect(record.documents).toBeUndefined();
		expect(record.lots.map((lot) => lot.documents)).toEqual([undefined]);
	});

	it('reads the change reason cor-buy of 607074-2026', () => {
		expect(readRole('change-notice', 0).changeReasons).toEqual(['cor-buy']);
	});

	it('reads the change reason cancel of the synthetic cancel notice', () => {
		expect(readRole('cancel-notice').changeReasons).toEqual(['cancel']);
	});

	it('reads the version 600017-2026 changes as <identifier>-<VersionID>', () => {
		expect(readRole('change-notice', 1).notice.changes).toEqual([
			'54426929-1700-4c06-bc98-4f41506ab64f-01'
		]);
	});

	// Some change links in the capture carry schemeName="notice-id-ref", which puts their text under
	// #text, so the rule depends on this shape as much as on the bare one above.
	it('reads a change link written with its schemeName attribute, as 601468-2026 writes it', () => {
		const text = readFileSync(capturePath('601468-2026'), 'utf8');
		expect(text).toContain('<efbc:ChangedNoticeIdentifier schemeName="notice-id-ref">');
		expect(readText(text, '601468-2026').notice.changes).toEqual([
			'403524b3-64a2-4a3d-95ca-ac90600cb5c8-02'
		]);
	});

	it('reads both versions of notice ad28f539 with their one procedure', () => {
		const identity = (version: string) => ({
			id: 'ad28f539-52a7-4def-81b0-b09c8a77968a',
			version,
			procedure: '86110bd2-4c2d-47f9-aa36-0fa9447a0dd7',
			changes: []
		});
		expect(readRole('superseded-pair', 0).notice).toEqual(identity('02'));
		expect(readRole('superseded-pair', 1).notice).toEqual(identity('01'));
	});

	it('refuses a VersionID that is not digits, naming cbc:VersionID', () => {
		const text = readFixture('one-lot').replace(
			'<cbc:VersionID>01</cbc:VersionID>',
			'<cbc:VersionID>v2</cbc:VersionID>'
		);
		expect(text).toContain('<cbc:VersionID>v2</cbc:VersionID>');
		const result = readNotice(new TextEncoder().encode(text), { noticeNumber: '609955-2026' });
		expect(result.ok ? '' : result.detail).toContain('cbc:VersionID');
	});

	it.each([
		['sdk-1.13', 'eforms-sdk-1.13'],
		['sdk-1.14', 'eforms-sdk-1.14']
	] as const)('reads %s with its version string', (role, version) => {
		expect(readRole(role).sdkVersion).toBe(version);
	});

	it('refuses a notice without its legal basis, naming it', () => {
		const text = readFixture('one-lot').replace(
			'<cbc:RegulatoryDomain>32014L0024</cbc:RegulatoryDomain>',
			''
		);
		const result = readNotice(new TextEncoder().encode(text), { noticeNumber: '609955-2026' });
		expect(result.ok ? '' : result.detail).toContain('ContractNotice/cbc:RegulatoryDomain');
	});
});

describe('reserved participation and the group legal form', () => {
	it('reads the reserved code the synthetic notice sets', () => {
		expect(readRole('reserved-participation').lots[0].reserved).toBe('res-ws');
	});

	const reservedCode = (code: string) =>
		'<cac:SpecificTendererRequirement><cbc:TendererRequirementTypeCode listName="reserved-procurement">' +
		`${code}</cbc:TendererRequirementTypeCode></cac:SpecificTendererRequirement>`;
	const withReservedCodes = (codes: string[]) =>
		inLot(readFixture('one-lot'), 0, reservedCode('none'), codes.map(reservedCode).join(''));

	it.each(['before', 'after'] as const)(
		'keeps a reservation published %s a none on the same lot',
		(where) => {
			const codes = where === 'before' ? ['res-ws', 'none'] : ['none', 'res-ws'];
			expect(readText(withReservedCodes(codes), '609955-2026').lots[0].reserved).toBe('res-ws');
		}
	);

	it.each([
		[['res-pub-ser', 'res-ws'], 'res-pub-ser'],
		[['none', 'none'], 'none']
	])('reads the codes %j on one lot as %s', (codes, expected) => {
		expect(readText(withReservedCodes(codes), '609955-2026').lots[0].reserved).toBe(expected);
	});

	it('reads the legal form 605918-2026 requires on its lot', () => {
		const [lot] = readRole('group-legal-form').lots;
		expect(lot.groupLegalForm?.required).toBe('true');
		expect(lot.groupLegalForm?.description).toMatchObject({ lang: 'de', rawLang: 'DEU' });
		expect(lot.groupLegalForm?.description?.text).toMatch(
			/^Die Teilnahme als Bietergemeinschaft ist zulässig/
		);
	});

	it('keeps two different declarations each on its own lot', () => {
		const declaration = (required: string, text: string) =>
			`<cac:TendererQualificationRequest><cbc:CompanyLegalFormCode listName="required">${required}` +
			'</cbc:CompanyLegalFormCode><cbc:CompanyLegalForm languageID="DEU">' +
			`${text}</cbc:CompanyLegalForm></cac:TendererQualificationRequest><cac:TendererQualificationRequest>`;
		const anchor = '<cac:TendererQualificationRequest>';
		const once = inLot(readFixture('multi-lot'), 0, anchor, declaration('true', 'Erstes Los'));
		const text = inLot(once, 1, anchor, declaration('false', 'Zweites Los'));
		const [first, second] = readText(text, '600779-2026').lots;
		expect(first.groupLegalForm).toEqual({
			required: 'true',
			description: { text: 'Erstes Los', lang: 'de', rawLang: 'DEU' }
		});
		expect(second.groupLegalForm).toEqual({
			required: 'false',
			description: { text: 'Zweites Los', lang: 'de', rawLang: 'DEU' }
		});
	});

	it('reads a legal form code with no text as the code alone', () => {
		const text = inLot(
			readFixture('one-lot'),
			0,
			'<cac:TendererQualificationRequest>',
			'<cac:TendererQualificationRequest><cbc:CompanyLegalFormCode listName="required">false' +
				'</cbc:CompanyLegalFormCode></cac:TendererQualificationRequest><cac:TendererQualificationRequest>'
		);
		expect(readText(text, '609955-2026').lots[0].groupLegalForm).toEqual({ required: 'false' });
	});
});

describe('refusals of incomplete fields, each naming its element', () => {
	it.each([
		[
			'a criterion parameter code',
			'change-notice',
			(text: string) =>
				text.replace(
					'<efbc:ParameterCode listName="number-weight">ord-imp</efbc:ParameterCode>',
					''
				),
			'/efac:SelectionCriteria/efac:CriterionParameter/efbc:ParameterCode'
		],
		[
			'a criterion parameter value',
			'change-notice',
			(text: string) => text.replace('<efbc:ParameterNumeric>1</efbc:ParameterNumeric>', ''),
			'/efac:SelectionCriteria/efac:CriterionParameter/efbc:ParameterNumeric'
		],
		[
			'the currency of an estimated value',
			'one-lot',
			(text: string) => text.replace(' currencyID="EUR">834550.06', '>834550.06'),
			'ContractNotice/cac:ProcurementProject/cac:RequestedTenderTotal/cbc:EstimatedOverallContractAmount with its currencyID'
		],
		[
			"the currency of a lot's estimated value",
			'one-lot',
			(text: string) => inLot(text, 0, ' currencyID="EUR">834550.06', '>834550.06'),
			'ProcurementProjectLot[LOT-0000]/cac:ProcurementProject/cac:RequestedTenderTotal/cbc:EstimatedOverallContractAmount with its currencyID'
		],
		[
			'the id of a legislation reference',
			'one-lot',
			(text: string) => text.replace('<cbc:ID>vgv</cbc:ID>', ''),
			'ContractNotice/cac:TenderingTerms/cac:ProcurementLegislationDocumentReference/cbc:ID'
		],
		[
			'the code of a group legal form',
			'group-legal-form',
			(text: string) =>
				text.replace(/<cbc:CompanyLegalFormCode[^>]*>true<\/cbc:CompanyLegalFormCode>/, ''),
			'/cac:TendererQualificationRequest/cbc:CompanyLegalFormCode'
		],
		[
			'the notice subtype',
			'one-lot',
			(text: string) =>
				text.replace('<cbc:SubTypeCode listName="notice-subtype">16</cbc:SubTypeCode>', ''),
			'efac:NoticeSubType/cbc:SubTypeCode'
		],
		[
			'its notice identifier',
			'one-lot',
			(text: string) =>
				text.replace(
					'<cbc:ID schemeName="notice-id">38c19032-e327-4ae0-b618-31b349376b36</cbc:ID>',
					''
				),
			'ContractNotice/cbc:ID with schemeName notice-id'
		],
		[
			'its VersionID',
			'one-lot',
			(text: string) => text.replace('<cbc:VersionID>01</cbc:VersionID>', ''),
			'ContractNotice/cbc:VersionID'
		],
		[
			'its procedure identifier',
			'one-lot',
			(text: string) =>
				text.replace(
					'<cbc:ContractFolderID>d3ec00fd-56a4-4251-8674-8297cf1736d8</cbc:ContractFolderID>',
					''
				),
			'ContractNotice/cbc:ContractFolderID'
		]
	] as const)('refuses a notice without %s', (_what, role, edit, named) => {
		const source = readFixture(role);
		const text = edit(source);
		expect(text).not.toBe(source);
		const result = readNotice(new TextEncoder().encode(text), { noticeNumber: noticeOf(role, 0) });
		expect(result).toMatchObject({ ok: false, kind: 'malformed' });
		expect(result.ok ? '' : result.detail).toContain(named);
	});

	it('keeps a parameter published without a code list as its code and value alone', () => {
		const text = readFixture('change-notice').replace(
			'<efbc:ParameterCode listName="number-weight">ord-imp',
			'<efbc:ParameterCode>ord-imp'
		);
		const [first] = readText(text, '607074-2026').lots[0].criteria;
		expect(first.parameters).toEqual([{ code: 'ord-imp', value: '1' }]);
	});

	it('reads only classification codes from the cpv list', () => {
		const text = readFixture('one-lot').replaceAll(
			'listName="cpv">48921000',
			'listName="other">48921000'
		);
		expect(readText(text, '609955-2026').cpv).toEqual({ main: ['45315700'], additional: [] });
	});
});

describe('buyers', () => {
	it('reads the nine buyers of 611918-2026 in publication order', () => {
		// This notice is indented and writes its organisation ids without a scheme name.
		const text = readFixture('joint-buyers');
		const parties = [
			...text.matchAll(
				/<cac:ContractingParty>[\s\S]*?<cac:Party>\s*<cac:PartyIdentification>\s*<cbc:ID[^>]*>([^<]*)</g
			)
		].map((match) => match[1]);
		const nameOf = (id: string) =>
			new RegExp(
				`<cbc:ID[^>]*>${id}</cbc:ID>\\s*</cac:PartyIdentification>\\s*` +
					'<cac:PartyName>\\s*<cbc:Name[^>]*>([^<]*)<'
			).exec(text)?.[1];
		const { buyers } = readText(text, '611918-2026');
		expect(parties).toHaveLength(9);
		expect(buyers.map((buyer) => buyer.name.text)).toEqual(parties.map(nameOf));
	});
});

describe('documents links and references', () => {
	it('decodes the escaped ampersand in the documents URI of 601374-2026 once', () => {
		const documents = readRole('escaped-link').lots[0].documents;
		expect(documents?.published).not.toContain('&amp;');
		expect(documents?.href).toBe(documents?.published);
		const url = new URL(documents?.href ?? '');
		expect(url.searchParams.get('function')).toBe('_Details');
		expect(url.searchParams.get('TenderOID')).toBe('54321-Tender-19e1d16fc74-67747e37da8b78');
	});

	it('decodes the escaped greater-than sign in the criterion text of 600017-2026', () => {
		const descriptions = everyDescription(readRole('escaped-text'));
		expect(descriptions.some(({ text }) => text.includes('(bspw. > 100.000'))).toBe(true);
		expect(descriptions.some(({ text }) => text.includes('&gt;'))).toBe(false);
	});

	it('decodes an escaped entity and a numeric reference in criterion text exactly once', () => {
		const text = readFixture('one-lot').replace(
			'Allgemeine Hinweise: siehe hierzu Bekanntmachung Ziffer 5.1.6- Allgemeine Informationen',
			'A &amp;amp; B &#x2013; C'
		);
		const [first] = readText(text, '609955-2026').lots[0].criteria;
		expect(first.descriptions[0].text).toContain(`A &amp; B ${String.fromCodePoint(0x2013)} C`);
	});

	it('keeps a javascript: documents URI as published text with no link target', () => {
		const text = readFixture('one-lot').replace(ONE_LOT_URI, 'javascript:alert(1)');
		expect(readText(text, '609955-2026').lots[0].documents).toEqual({
			published: 'javascript:alert(1)'
		});
	});

	it('decodes a documents URI before judging it, so an escaped colon gives no link target', () => {
		const text = readFixture('one-lot').replace(ONE_LOT_URI, 'javascript&#58;alert(1)');
		expect(readText(text, '609955-2026').lots[0].documents).toEqual({
			published: 'javascript:alert(1)'
		});
	});

	it('reads a procedure-level documents link beside the lot one', () => {
		const reference =
			'<cac:CallForTendersDocumentReference><cbc:ID>proc</cbc:ID><cac:Attachment><cac:ExternalReference>' +
			'<cbc:URI>http://example.org/procedure</cbc:URI></cac:ExternalReference></cac:Attachment>' +
			'</cac:CallForTendersDocumentReference>';
		const text = readFixture('one-lot').replace(
			'<cac:TenderingTerms><cac:ProcurementLegislationDocumentReference>',
			`<cac:TenderingTerms>${reference}<cac:ProcurementLegislationDocumentReference>`
		);
		const record = readText(text, '609955-2026');
		expect(record.documents).toEqual({
			published: 'http://example.org/procedure',
			href: 'http://example.org/procedure'
		});
		expect(record.lots[0].documents?.published).toBe(ONE_LOT_URI);
	});

	it('marks a lot whose only documents link is restricted, keeping its target', () => {
		const uri = 'https://app.tenpu.eu/public/tender/dps/1167';
		expect(readRole('restricted-documents').lots[0].documents).toEqual({
			published: uri,
			href: uri,
			restricted: true
		});
	});

	it.each(['before', 'after'] as const)(
		'prefers the open documents link to a restricted one published %s it',
		(where) => {
			const text = withAddedReference(where, 'restricted-document', 'https://example.org/closed');
			expect(readText(text, '609955-2026').lots[0].documents).toEqual({
				published: ONE_LOT_URI,
				href: ONE_LOT_URI
			});
		}
	);

	it('prefers a later open link that can be followed to an earlier one that cannot', () => {
		const text = withAddedReference('before', 'non-restricted-document', 'javascript:alert(1)');
		expect(readText(text, '609955-2026').lots[0].documents).toEqual({
			published: ONE_LOT_URI,
			href: ONE_LOT_URI
		});
	});

	it('ranks an open link that can be followed first, then an open one that cannot, then a restricted one', () => {
		const restricted = documentsReference('restricted-document', 'https://example.org/closed');
		const unfollowable = documentsReference('non-restricted-document', 'javascript:alert(1)');
		const all = inLot(
			readFixture('one-lot'),
			0,
			OPEN_REFERENCE,
			`${restricted}${unfollowable}${OPEN_REFERENCE}`
		);
		expect(readText(all, '609955-2026').lots[0].documents?.href).toBe(ONE_LOT_URI);
		const withoutOpen = all.replace(ONE_LOT_URI, 'www.example.org/documents');
		expect(readText(withoutOpen, '609955-2026').lots[0].documents).toEqual({
			published: 'javascript:alert(1)'
		});
	});

	it('keeps the first of two open links that can both be followed', () => {
		const text = withAddedReference('after', 'non-restricted-document', 'https://example.org/b');
		expect(readText(text, '609955-2026').lots[0].documents?.href).toBe(ONE_LOT_URI);
	});
});

describe('safeLink', () => {
	it.each([
		['https://example.org/a?b=1&c=2', 'https://example.org/a?b=1&c=2'],
		['http://example.org/', 'http://example.org/'],
		['HTTPS://Example.org/x', 'https://example.org/x']
	])('gives %s the link target %s', (published, href) => {
		expect(safeLink(published)).toEqual({ published, href });
	});

	it.each([
		'javascript:alert(1)',
		'JavaScript:alert(1)',
		'data:text/html,<b>x</b>',
		'vbscript:msgbox(1)',
		'java\tscript:alert(1)',
		'java\nscript:alert(1)',
		' javascript:alert(1)',
		'\u0000javascript:alert(1)',
		'ftp://example.org/documents',
		'//example.org/documents',
		'www.example.org/documents',
		'not a link',
		''
	])('keeps %j as text with no link target', (published) => {
		expect(safeLink(published)).toEqual({ published });
	});
});

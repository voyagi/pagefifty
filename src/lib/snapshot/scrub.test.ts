import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
	EMAIL_PATTERN,
	SCRUB_PLACEHOLDER,
	findNoticeSpans,
	isContactKey,
	scrubJsonValue,
	scrubNoticeXml
} from './scrub';

const P = SCRUB_PLACEHOLDER;

describe('scrubNoticeXml elements', () => {
	it('replaces the text of every email, telephone and fax element and keeps the tags', () => {
		const xml =
			'<cbc:Telephone>+49 345 514-0</cbc:Telephone><cbc:Telefax>+49 345 514-1</cbc:Telefax>' +
			'<cbc:ElectronicMail languageID="DEU">office@buyer.example</cbc:ElectronicMail>';
		expect(scrubNoticeXml(xml)).toBe(
			`<cbc:Telephone>${P}</cbc:Telephone><cbc:Telefax>${P}</cbc:Telefax>` +
				`<cbc:ElectronicMail languageID="DEU">${P}</cbc:ElectronicMail>`
		);
	});

	it('replaces a contact name and keeps the buyer organisation name', () => {
		const xml =
			'<cac:PartyName><cbc:Name languageID="DEU">Stadt Beispielheim</cbc:Name></cac:PartyName>' +
			'<cac:Contact><cbc:Name>Zentrale Vergabestelle</cbc:Name></cac:Contact>';
		expect(scrubNoticeXml(xml)).toBe(
			'<cac:PartyName><cbc:Name languageID="DEU">Stadt Beispielheim</cbc:Name></cac:PartyName>' +
				`<cac:Contact><cbc:Name>${P}</cbc:Name></cac:Contact>`
		);
	});

	it('scrubs a contact block whose children are separated by eSender comments', () => {
		const xml =
			'<cac:Contact><!--BT-502-Organization-Company (Order: 03)--><cbc:Name>Frau Beispiel</cbc:Name>' +
			'<!--BT-503-Organization-Company (Order: 04)--><cbc:Telephone>+49 1234 5678</cbc:Telephone>' +
			'<!--BT-506-Organization-Company (Order: 05)--><cbc:ElectronicMail>b@buyer.example</cbc:ElectronicMail>' +
			'</cac:Contact>';
		expect(scrubNoticeXml(xml)).toBe(
			`<cac:Contact><!--BT-502-Organization-Company (Order: 03)--><cbc:Name>${P}</cbc:Name>` +
				`<!--BT-503-Organization-Company (Order: 04)--><cbc:Telephone>${P}</cbc:Telephone>` +
				`<!--BT-506-Organization-Company (Order: 05)--><cbc:ElectronicMail>${P}</cbc:ElectronicMail>` +
				'</cac:Contact>'
		);
	});

	it('scrubs indented contact blocks and preserves CRLF line ends', () => {
		const xml =
			'<cac:Contact>\r\n\t<cbc:Name>Einkauf</cbc:Name>\r\n\t<cbc:Telefax>0228 99</cbc:Telefax>\r\n</cac:Contact>';
		expect(scrubNoticeXml(xml)).toBe(
			`<cac:Contact>\r\n\t<cbc:Name>${P}</cbc:Name>\r\n\t<cbc:Telefax>${P}</cbc:Telefax>\r\n</cac:Contact>`
		);
	});

	it('leaves a Name outside any contact block alone even after a closed contact block', () => {
		const xml = '<cac:Contact><cbc:Name>A</cbc:Name></cac:Contact><cbc:Name>Lot 1</cbc:Name>';
		expect(scrubNoticeXml(xml)).toBe(
			`<cac:Contact><cbc:Name>${P}</cbc:Name></cac:Contact><cbc:Name>Lot 1</cbc:Name>`
		);
	});

	it('replaces an email element whose text the address pattern does not recognise', () => {
		const xml = '<cbc:ElectronicMail>vergabe(at)buyer.example</cbc:ElectronicMail>';
		expect(scrubNoticeXml(xml)).toBe(`<cbc:ElectronicMail>${P}</cbc:ElectronicMail>`);
	});

	it('scrubs a contact block whose opening tag carries an attribute', () => {
		const xml = '<cac:Contact id="c1"><cbc:Name>Einkauf</cbc:Name></cac:Contact>';
		expect(scrubNoticeXml(xml)).toBe(
			`<cac:Contact id="c1"><cbc:Name>${P}</cbc:Name></cac:Contact>`
		);
	});

	// The name span and the email span start together and the email ends first, so a merge that
	// kept the shorter end would leave the rest of the name in place.
	it('removes all of a contact name that starts with an email address', () => {
		const xml = '<cac:Contact><cbc:Name>a@buyer.example Einkauf</cbc:Name></cac:Contact>';
		expect(scrubNoticeXml(xml)).toBe(`<cac:Contact><cbc:Name>${P}</cbc:Name></cac:Contact>`);
	});

	// A touch point is a contact point of an organisation, and a buyer can name a person there.
	it('replaces every name inside a touch point and keeps the company name beside it', () => {
		const xml =
			'<efac:Company><cac:PartyName><cbc:Name languageID="NLD">Gemeente Voorbeeld</cbc:Name></cac:PartyName></efac:Company>' +
			'<efac:TouchPoint><cac:PartyName><!--BT-500-Organization-TouchPoint--><cbc:Name languageID="NLD">Jan Voorbeeld</cbc:Name>' +
			'</cac:PartyName><cac:Contact><cbc:Name>Inkoop</cbc:Name></cac:Contact></efac:TouchPoint>';
		expect(scrubNoticeXml(xml)).toBe(
			'<efac:Company><cac:PartyName><cbc:Name languageID="NLD">Gemeente Voorbeeld</cbc:Name></cac:PartyName></efac:Company>' +
				`<efac:TouchPoint><cac:PartyName><!--BT-500-Organization-TouchPoint--><cbc:Name languageID="NLD">${P}</cbc:Name>` +
				`</cac:PartyName><cac:Contact><cbc:Name>${P}</cbc:Name></cac:Contact></efac:TouchPoint>`
		);
		expect(findNoticeSpans(xml).map((span) => span.kind)).toEqual([
			'touchpoint-name',
			'contact-name'
		]);
	});

	it('scrubs a touch point whose opening tag carries an attribute', () => {
		const xml =
			'<efac:TouchPoint id="t1"><cac:PartyName><cbc:Name>Jan Voorbeeld</cbc:Name></cac:PartyName></efac:TouchPoint>';
		expect(scrubNoticeXml(xml)).toBe(
			`<efac:TouchPoint id="t1"><cac:PartyName><cbc:Name>${P}</cbc:Name></cac:PartyName></efac:TouchPoint>`
		);
	});

	it('labels email and fax element spans with their own kinds', () => {
		const xml = '<cbc:ElectronicMail>x(at)y</cbc:ElectronicMail><cbc:Telefax>0228 99</cbc:Telefax>';
		expect(findNoticeSpans(xml).map((span) => span.kind)).toEqual([
			'email-element',
			'telefax-element'
		]);
	});
});

describe('scrubNoticeXml free text', () => {
	it('replaces an email address inside a description', () => {
		const xml =
			'<cbc:Description>Fragen per E-Mail an vk@review.example bis Freitag.</cbc:Description>';
		expect(scrubNoticeXml(xml)).toBe(
			`<cbc:Description>Fragen per E-Mail an ${P} bis Freitag.</cbc:Description>`
		);
	});

	it('replaces an email inside a URI and inside an identifier', () => {
		expect(scrubNoticeXml('<cbc:WebsiteURI>mailto:info@buyer.example</cbc:WebsiteURI>')).toBe(
			`<cbc:WebsiteURI>mailto:${P}</cbc:WebsiteURI>`
		);
		expect(scrubNoticeXml('<cbc:CompanyID>kammer@land.example</cbc:CompanyID>')).toBe(
			`<cbc:CompanyID>${P}</cbc:CompanyID>`
		);
	});

	it.each([
		['Telefon: +31 20 000 0000', `Telefon: ${P}`],
		['Tel. +49 (0) 221-98 578-0. Die Bieter', `Tel. ${P}. Die Bieter`],
		['Tel: 030 1234567', `Tel: ${P}`],
		['Telefax 0228 9499-163\nE-Mail', `Telefax ${P}\nE-Mail`],
		['Fax: +49 431 988-4702', `Fax: ${P}`],
		['Phone +32 2 000 00 00', `Phone ${P}`],
		['Téléphone : +32 2 000 00 00', `Téléphone : ${P}`],
		['Telefoon 088 000 0000', `Telefoon ${P}`],
		['Telefon: +49 (0)89 2176-2411   vergabe', `Telefon: ${P}   vergabe`],
		['Fax: 12 34 56', `Fax: ${P}`],
		['<cbc:CompanyID>T: 0541 000000</cbc:CompanyID>', `<cbc:CompanyID>T: ${P}</cbc:CompanyID>`],
		['<cbc:CompanyID>t:0431 000 0</cbc:CompanyID>', `<cbc:CompanyID>t:${P}</cbc:CompanyID>`],
		['F : 0228 000 00', `F : ${P}`],
		['Tél. 02 000 00 00', `Tél. ${P}`],
		['Rückfragen Tel.-Nr.: 0228 000000 bitte', `Rückfragen Tel.-Nr.: ${P} bitte`],
		['Telefon-Nr. 0228 000000', `Telefon-Nr. ${P}`],
		['Telefonnummer: 0228 000000', `Telefonnummer: ${P}`],
		['Telefoonnummer 088 000 0000', `Telefoonnummer ${P}`],
		['Fax-Nr.: 0228 000001', `Fax-Nr.: ${P}`],
		['tel. nr. 010 0000000', `tel. nr. ${P}`],
		['Phone number: 02 000 00 00', `Phone number: ${P}`],
		['oder Tel 0228 000000 anrufen', `oder Tel ${P} anrufen`],
		['Mobil: 0171 0000000', `Mobil: ${P}`],
		['Handynummer 0171 0000000', `Handynummer ${P}`],
		['GSM 0470 00 00 00', `GSM ${P}`],
		['mobiel 06 00000000', `mobiel ${P}`],
		['Fon: 0228 000000', `Fon: ${P}`],
		['Fon 0228 000000', `Fon ${P}`],
		['Rufnummer: 0228 000000', `Rufnummer: ${P}`],
		['Tel/Fax: 0228 000000', `Tel/Fax: ${P}`]
	])('replaces the number after a keyword in %j', (text, expected) => {
		expect(scrubNoticeXml(text)).toBe(expected);
	});

	it.each([
		'Fax oder auf elektronischem Wege beträgt diese Frist zehn Kalendertage',
		'per Telefax eingereichte Fragen sind unzulässig',
		'Fax erst 10 Kalendertage nach Absendung',
		'Ansprechpartner beim Referenzkunden mit Telefonnummer und E-Mail-Adresse',
		'<cbc:Telefax>',
		'Mobile Projektionsleinwand, Hotline 24/7',
		'Notruf Tel. 110 oder 112',
		'Anlage T: 3 Seiten',
		'Lose T: 12 bis 14',
		'Tel Aviv 2026',
		'Telefonie-Dienste 2026 bis 2029',
		'Mobilität 2026 bis 2030, Budget 1234567',
		'GSM-R Netz 900 MHz',
		'Fax-Nr. folgt',
		'Telefon noch offen, Aktenzeichen 1234567',
		'Fonds 2026 bis 2029, Budget 1234567',
		'Rufbereitschaft rund um die Uhr, Aktenzeichen 1234567',
		// Six digits make a number, and a separator is not a digit.
		'Durchwahl Tel. 12-34'
	])('keeps text with no phone number after a keyword: %j', (text) => {
		expect(scrubNoticeXml(text)).toBe(text);
	});

	it.each([
		['<cbc:CompanyID>+49 30 0000000</cbc:CompanyID>', `<cbc:CompanyID>${P}</cbc:CompanyID>`],
		['<cbc:CompanyID>t:+490000000000</cbc:CompanyID>', `<cbc:CompanyID>t:${P}</cbc:CompanyID>`],
		[
			'Bonn Deutschland +49 228 00000 http://www.x.example',
			`Bonn Deutschland ${P} http://www.x.example`
		],
		['Zentrale +49 (0) 221-00 000-0.', `Zentrale ${P}.`],
		// Starts like an amount grouped in thousands, but the last group runs on.
		['Zentrale +49.228.000000', `Zentrale ${P}`]
	])('replaces an international number wherever it stands: %j', (text, expected) => {
		expect(scrubNoticeXml(text)).toBe(expected);
	});

	it('labels an international number with no keyword as its own kind', () => {
		expect(findNoticeSpans('Bonn +49 228 000000').map((span) => span.kind)).toEqual([
			'international-phone'
		]);
	});

	it.each([
		'Los 001 bis 009',
		'Aktenzeichen 0012345',
		'Vergabe 2026-00123456',
		'Menge 1000 000 000',
		'<efbc:NoticePublicationID schemeName="ojs-notice-id">00600000-2026</efbc:NoticePublicationID>',
		'<cbc:ID schemeName="InternalID">BB-001.022/2026</cbc:ID>'
	])('keeps a publication number, a reference and other digits that start with 00: %j', (text) => {
		expect(scrubNoticeXml(text)).toBe(text);
	});

	it.each(['Aufschlag +10 %', 'Index +49', 'Wert +15.000.000 EUR', 'Version 2+4 Jahre'])(
		'keeps a plus sign that starts no international number: %j',
		(text) => {
			expect(scrubNoticeXml(text)).toBe(text);
		}
	);

	it('removes a person named right before their own email address', () => {
		const text =
			'eine E-Mail an Jana Beispiel, Jana.Beispiel@firm.example sowie Tom Muster, tom_muster@firm.example.';
		expect(scrubNoticeXml(text)).toBe(`eine E-Mail an ${P}, ${P} sowie ${P}, ${P}.`);
	});

	it('keeps words before an email when they do not spell its local part', () => {
		const text = 'an die Vergabestelle, vergabe.stelle.nord@buyer.example';
		expect(scrubNoticeXml(text)).toBe(`an die Vergabestelle, ${P}`);
	});

	it('keeps a word before an email whose local part is a single word', () => {
		const text = 'Rückfragen an Vergabe, vergabe@buyer.example';
		expect(scrubNoticeXml(text)).toBe(`Rückfragen an Vergabe, ${P}`);
	});

	it.each([
		['Kontakt: J. Beispiel, j.beispiel@firm.example', `Kontakt: ${P}, ${P}`],
		['Kontakt: J. Ab, j.ab@firm.example', `Kontakt: ${P}, ${P}`],
		// A part of the address that is not a word (a year, a number) spells no name.
		['Kontakt: J. Beispiel, j.beispiel.2024@firm.example', `Kontakt: ${P}, ${P}`]
	])(
		'removes a name written with an initial before its own email address: %j',
		(text, expected) => {
			expect(scrubNoticeXml(text)).toBe(expected);
		}
	);

	it.each([
		['Fragen an vergabe(at)buyer.example bitte', `Fragen an ${P} bitte`],
		['Fragen an vergabe [at] buyer.example bitte', `Fragen an ${P} bitte`],
		['Fragen an vergabe(AT)buyer.example', `Fragen an ${P}`],
		['an Jana Beispiel, jana.beispiel(at)firm.example.', `an ${P}, ${P}.`]
	])(
		'removes an address written with (at) or [at], and the name before it: %j',
		(text, expected) => {
			expect(scrubNoticeXml(text)).toBe(expected);
		}
	);

	it('labels an address written with (at) as its own kind', () => {
		expect(findNoticeSpans('vergabe(at)buyer.example').map((span) => span.kind)).toEqual([
			'obfuscated-email'
		]);
	});

	it.each(['Preis (at) 5 EUR', 'Treffpunkt [at] Rathaus'])(
		'keeps an (at) that joins no address: %j',
		(text) => {
			expect(scrubNoticeXml(text)).toBe(text);
		}
	);

	// An address writes a name without accents and spells umlauts out, and a double surname keeps
	// its hyphen in the text while the address may use a dot.
	it.each([
		['an Anne Muster-Beispiel, anne.muster-beispiel@firm.example', `an ${P}, ${P}`],
		['an Anne Muster-Beispiel, anne.muster.beispiel@firm.example', `an ${P}, ${P}`],
		['an Jörn Beispiel, joern.beispiel@firm.example', `an ${P}, ${P}`],
		['an Jürgen Beispiel, juergen.beispiel@firm.example', `an ${P}, ${P}`],
		['an Käte Beispiel, kaete.beispiel@firm.example', `an ${P}, ${P}`],
		['an Jana Großbeispiel, jana.grossbeispiel@firm.example', `an ${P}, ${P}`],
		['an Hélène Exemple, helene.exemple@firm.example', `an ${P}, ${P}`],
		['an Jana Beispiel <jana.beispiel@firm.example>', `an ${P} <${P}>`],
		['an Jana Beispiel &lt;jana.beispiel@firm.example&gt;', `an ${P} &lt;${P}&gt;`],
		// Capitals may join the words where a dot would, and a plus tag names a mailbox, not a person.
		['an Jörn Groß, JoernGross@firm.example', `an ${P}, ${P}`],
		['an Jana Beispiel, janaBeispiel@firm.example', `an ${P}, ${P}`],
		['an Jana Beispiel, jana.beispiel+vergabe@firm.example', `an ${P}, ${P}`]
	])('removes a name spelled the way its own address spells it: %j', (text, expected) => {
		expect(scrubNoticeXml(text)).toBe(expected);
	});

	it('removes a name typed with a combining mark instead of a precomposed letter', () => {
		const diaeresis = String.fromCodePoint(0x308);
		const text = `an Jo${diaeresis}rn Beispiel, joern.beispiel@firm.example`;
		expect(scrubNoticeXml(text)).toBe(`an ${P}, ${P}`);
	});

	it('keeps a place name whose umlaut only resembles the address', () => {
		const text = 'an die Vergabestelle Süd, vergabe.sued@buyer.example';
		expect(scrubNoticeXml(text)).toBe(`an die Vergabestelle Süd, ${P}`);
	});

	it('keeps initials before an email whose local part is initials alone', () => {
		const text = 'Leitung A. B, a.b@firm.example';
		expect(scrubNoticeXml(text)).toBe(`Leitung A. B, ${P}`);
	});

	it('keeps a criterion description with no contact data byte-identical', () => {
		const xml =
			'<cbc:Description languageID="DEU">Mindestumsatz 1.500.000 EUR in den letzten drei Geschäftsjahren; ' +
			'Referenzen aus 2023 bis 2025, Frist 2026-10-06T10:30:00+02:00.</cbc:Description>';
		expect(scrubNoticeXml(xml)).toBe(xml);
	});
});

// Strips what the scrub keys on from random text: an at sign, the brackets of an address written
// with (at), [at] or {at}, the opening of a tag and an ASCII digit.
const withoutScrubCues = (text: string) => text.replace(/[@<\d()[\]{}]/gu, '');

describe('scrubNoticeXml stability', () => {
	const sample =
		'<cac:Contact><!--c--><cbc:Name>Office</cbc:Name><cbc:Telephone>+49 1</cbc:Telephone></cac:Contact>' +
		'<cbc:Note>Telefon: +49 30 000000, E-Mail an Jana Beispiel, jana.beispiel@x.example</cbc:Note>';

	it('is idempotent', () => {
		const once = scrubNoticeXml(sample);
		expect(scrubNoticeXml(once)).toBe(once);
		expect(once).not.toBe(sample);
	});

	it('gives the same output for the same input', () => {
		expect(scrubNoticeXml(sample)).toBe(scrubNoticeXml(sample));
	});

	test.prop([fc.string({ unit: 'grapheme' }).map(withoutScrubCues)])(
		'never changes text that holds no at sign, no bracket, no tag and no digit',
		(text) => {
			expect(scrubNoticeXml(text)).toBe(text);
		}
	);

	// Random text almost never spells an address with a bracketed at, so the property above would
	// pass even if its generator let one through. This example holds the generator to it.
	it('leaves nothing of an address written with a bracketed at for the property to change', () => {
		const address = 'mail jana(at)x.example';
		expect(scrubNoticeXml(address)).not.toBe(address);
		expect(scrubNoticeXml(withoutScrubCues(address))).toBe(withoutScrubCues(address));
	});

	it('reports each span with its kind', () => {
		const kinds = findNoticeSpans(sample).map((span) => span.kind);
		expect(kinds).toEqual([
			'contact-name',
			'telephone-element',
			'phone-after-keyword',
			'name-before-email',
			'email'
		]);
	});
});

describe('EMAIL_PATTERN', () => {
	it('matches plain and non-ASCII addresses and nothing else', () => {
		expect(EMAIL_PATTERN.test('someone@example.com')).toBe(true);
		expect(EMAIL_PATTERN.test('jürgen.groß@stadt-köln.de')).toBe(true);
		expect(EMAIL_PATTERN.test('@example.com')).toBe(false);
		expect(EMAIL_PATTERN.test('someone@localhost')).toBe(false);
		expect(EMAIL_PATTERN.test(SCRUB_PLACEHOLDER)).toBe(false);
	});

	// A quadratic scan of this run takes tens of seconds; a linear one takes milliseconds.
	it('scans a long run with no at sign in linear time', () => {
		const run = 'x'.repeat(100_000);
		const started = performance.now();
		expect(EMAIL_PATTERN.test(run)).toBe(false);
		expect(scrubNoticeXml(`<!--${run}-->`)).toBe(`<!--${run}-->`);
		expect(performance.now() - started).toBeLessThan(1_000);
		expect(EMAIL_PATTERN.test(`${run}@buyer.example`)).toBe(true);
	}, 120_000);

	it('scans a keyword followed by a long run of spaces and dots in linear time', () => {
		const text = `Tel${' .'.repeat(50_000)}-Nr`;
		const started = performance.now();
		expect(scrubNoticeXml(text)).toBe(text);
		expect(scrubNoticeXml(`x${'x'.repeat(100_000)} (at) y`)).toBe(`x${'x'.repeat(100_000)} (at) y`);
		expect(performance.now() - started).toBeLessThan(1_000);
	}, 120_000);
});

describe('scrubJsonValue', () => {
	it('replaces contact fields and email strings and keeps key order and other values', () => {
		const input = {
			'publication-number': '600017-2026',
			'organisation-email-buyer': ['a@buyer.example'],
			'organisation-tel-buyer': '+49 30 000',
			contactPointName: 'Office',
			total: 363,
			note: 'Fragen an b@buyer.example, Telefon: +49 30 000000',
			'buyer-name': ['Stadt Beispielheim'],
			nested: [{ fax: 12345, ok: true, gone: null }]
		};
		const output = scrubJsonValue(input);
		expect(output).toEqual({
			'publication-number': '600017-2026',
			'organisation-email-buyer': [P],
			'organisation-tel-buyer': P,
			contactPointName: P,
			total: 363,
			note: `Fragen an ${P}, Telefon: ${P}`,
			'buyer-name': ['Stadt Beispielheim'],
			nested: [{ fax: P, ok: true, gone: null }]
		});
		expect(Object.keys(output as object)).toEqual(Object.keys(input));
	});

	it('replaces every string and number under a contact key and keeps flags and nulls', () => {
		expect(
			scrubJsonValue({
				contact: { name: 'Office', verified: true, fax: null, phones: ['+49 1', 2] }
			})
		).toEqual({ contact: { name: P, verified: true, fax: null, phones: [P, P] } });
	});

	it.each([
		['organisation-email-buyer', true],
		['organisation-tel-buyer', true],
		['telefax', true],
		['contactPointName', true],
		['mobilePhone', true],
		['organisation-mail', true],
		['buyerTelephone', true],
		// Only the word phone marks these two, so dropping it from the vocabulary turns them red.
		['buyer-phone', true],
		['phoneNumber', true],
		// The words the free-text phone rule reads before a number name a phone field as well.
		['mobile', true],
		['organisation-mobil-buyer', true],
		['mobiel', true],
		['gsm', true],
		['handyNummer', true],
		['telefon', true],
		['telefoon', true],
		['rufnummer', true],
		['fon', true],
		['mobility-lot', false],
		['information', false],
		['font-size', false],
		['publication-number', false],
		['selection-criterion-description-lot', false],
		['document-url-lot', false],
		['deadline-receipt-tender-date-lot', false],
		['links', false],
		['total', false]
	])('classifies the key %j as contact data: %j', (key, expected) => {
		expect(isContactKey(key)).toBe(expected);
	});
});

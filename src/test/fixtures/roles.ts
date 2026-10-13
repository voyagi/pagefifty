// One manifest for every phase 1 fixture. A capture role names notices in examples/2026-09-15 by
// publication number, never a copied file. A synthetic role names the tracked notice it is built
// from and the one change its builder makes, for the cases the capture does not hold.
//
// Source of every notice: TED, the European Union's Tenders Electronic Daily, © European Union,
// 1998-2026, reused under https://ted.europa.eu/en/legal-notice (Commission Decision 2011/833/EU;
// editorial content CC BY 4.0). The tracked copies have contact and touch point names, email
// addresses and telephone and fax numbers replaced with [removed]; the synthetic changes below
// are ours.
//
// No file system access here: the workerd project imports this file, reads notice text through
// Vite raw imports and calls buildSynthetic itself.

export const CAPTURE_ID = '2026-09-15';

interface NoticeRef {
	notice: string;
	note: string;
	evidence?: string;
	lots?: number;
	criterion?: number;
	pointsToDocuments?: boolean;
}

interface CaptureRole {
	kind: 'capture';
	notices: readonly NoticeRef[];
}

interface SyntheticRole {
	kind: 'synthetic';
	derivedFrom: string;
	change: string;
}

const capture = (...notices: NoticeRef[]): CaptureRole => ({ kind: 'capture', notices });
const synthetic = (derivedFrom: string, change: string): SyntheticRole => ({
	kind: 'synthetic',
	derivedFrom,
	change
});

export const FIXTURE_ROLES = {
	'one-lot': capture({
		notice: '609955-2026',
		note: 'one lot LOT-0000, six German criteria in the notice',
		lots: 1
	}),
	'multi-lot': capture({ notice: '600779-2026', note: 'two lots', lots: 2 }),
	largest: capture({
		notice: '600457-2026',
		note: 'largest file in the capture: 17 lots, 355,325 bytes as captured',
		lots: 17
	}),
	'same-code-in-two-lots': capture(
		{
			notice: '600779-2026',
			note: 'slc-stand-other in both lots',
			evidence: 'slc-stand-other',
			lots: 2
		},
		{
			notice: '602252-2026',
			note: 'slc-stand-to-gen in both lots',
			evidence: 'slc-stand-to-gen',
			lots: 2
		}
	),
	'espd-only': capture({
		notice: '601156-2026',
		note: 'BT-821 names only the ESPD, no criteria in the notice',
		evidence: 'epo-sub-espd'
	}),
	'documents-only': capture(
		{
			notice: '600367-2026',
			note: 'Dutch notice, criteria only in the procurement documents',
			evidence: 'epo-procurement-document'
		},
		{
			notice: '600380-2026',
			note: 'Belgian notice with three lots, criteria only in the documents',
			evidence: 'epo-procurement-document',
			lots: 3
		}
	),
	'change-notice': capture(
		{ notice: '607074-2026', note: 'change reason cor-buy', evidence: '>cor-buy<' },
		{ notice: '600017-2026', note: 'change reason update-add', evidence: '>update-add<' }
	),
	'superseded-pair': capture(
		{
			notice: '600367-2026',
			note: 'notice ad28f539 at VersionID 02, the latest version',
			evidence: '<cbc:VersionID>02</cbc:VersionID>'
		},
		{
			notice: '601147-2026',
			note: 'notice ad28f539 at VersionID 01, superseded by 600367-2026',
			evidence: '<cbc:VersionID>01</cbc:VersionID>'
		}
	),
	'sdk-1.13': capture({
		notice: '609955-2026',
		note: 'eForms SDK 1.13',
		evidence: 'eforms-sdk-1.13'
	}),
	'sdk-1.14': capture({
		notice: '604971-2026',
		note: 'eForms SDK 1.14',
		evidence: 'eforms-sdk-1.14'
	}),
	'before-dst': capture(
		{
			notice: '609569-2026',
			note: 'deadline 2026-10-23 23:59 CEST, before 2026-10-25 01:00 UTC',
			evidence: '2026-10-23+02:00'
		},
		{
			notice: '601844-2026',
			note: 'deadline 2026-10-23 10:00 CEST, before 2026-10-25 01:00 UTC',
			evidence: '2026-10-23+02:00'
		}
	),
	'after-dst': capture(
		{
			notice: '628444-2026',
			note: 'deadline 2026-10-26 09:00 UTC, after 2026-10-25 01:00 UTC',
			evidence: '2026-10-26+00:00'
		},
		{
			notice: '612411-2026',
			note: 'deadline 2026-10-26 09:00 CET, after 2026-10-25 01:00 UTC',
			evidence: '2026-10-26+01:00'
		}
	),
	'request-deadline-only': capture({
		notice: '607074-2026',
		note: 'a request deadline and no tender deadline',
		evidence: '<cac:ParticipationRequestReceptionPeriod>'
	}),
	'go-rule': capture(
		{ notice: '607074-2026', note: 'nine criteria in the notice', evidence: 'epo-notice' },
		{
			notice: '609955-2026',
			note: 'six criteria that point to the documents',
			evidence: 'epo-notice'
		},
		{ notice: '630477-2026', note: 'four criteria in the notice', evidence: 'epo-notice' }
	),
	'decimal-in-text': capture({
		notice: '609345-2026',
		note: '"1.500" written in criterion text',
		evidence: '1.500'
	}),
	'value-under-floor': capture(
		{
			notice: '615890-2026',
			note: 'estimated value 0 EUR',
			evidence: '<cbc:EstimatedOverallContractAmount currencyID="EUR">0<'
		},
		{
			notice: '612090-2026',
			note: 'estimated value 1 EUR',
			evidence: '<cbc:EstimatedOverallContractAmount currencyID="EUR">1<'
		}
	),
	'other-legal-basis': capture(
		{
			notice: '604971-2026',
			note: 'legal basis 32024R2509',
			evidence: '>32024R2509</cbc:RegulatoryDomain>'
		},
		{
			notice: '635218-2026',
			note: 'legal basis other, no documents URI',
			evidence: '>other</cbc:RegulatoryDomain>'
		}
	),
	'escaped-link': capture({
		notice: '601374-2026',
		note: 'documents URI whose query parameters are joined by an escaped ampersand',
		evidence: '&amp;TenderOID='
	}),
	'escaped-text': capture({
		notice: '600017-2026',
		note: 'criterion text with an escaped greater-than sign',
		evidence: '(bspw. &gt; 100.000'
	}),
	'group-legal-form': capture({
		notice: '605918-2026',
		note: 'its one lot requires a legal form for a group of tenderers and describes it',
		evidence: 'listName="required">true</cbc:CompanyLegalFormCode>',
		lots: 1
	}),
	'joint-buyers': capture({
		notice: '611918-2026',
		note: 'joint procurement by nine buyers',
		evidence: 'Westdeutscher Rundfunk',
		lots: 1
	}),
	'restricted-documents': capture({
		notice: '600954-2026',
		note: 'its one lot names only a restricted documents link (BT-615), no open one',
		evidence: '<cbc:DocumentType>restricted-document</cbc:DocumentType>',
		lots: 1
	}),
	'german-classifier': capture(
		{
			notice: '609955-2026',
			note: 'criterion 1 ends with a pointer to the procurement documents',
			criterion: 1,
			pointsToDocuments: true,
			evidence: 'Liste in den Vergabeunterlagen'
		},
		{
			notice: '600017-2026',
			note: 'criterion 3 asks for a trade register extract and points nowhere else',
			criterion: 3,
			pointsToDocuments: false,
			evidence: 'Auszug aus dem Handelsregister'
		}
	),
	'dutch-classifier': capture(
		{
			notice: '600954-2026',
			note: 'criterion 0 requires meeting the terms set in the Inschrijvingsleidraad',
			criterion: 0,
			pointsToDocuments: true,
			evidence: 'Inschrijvingsleidraad'
		},
		{
			notice: '604872-2026',
			note: 'criterion 0 describes the answer to write and names no document',
			criterion: 0,
			pointsToDocuments: false,
			evidence: 'Geboden oplossing'
		}
	),
	'french-classifier': capture(
		{
			notice: '626216-2026',
			note: 'criterion 0 sends the tenderer to annex F of the documents',
			criterion: 0,
			pointsToDocuments: true,
			evidence: 'Annexe F à compléter'
		},
		{
			notice: '602091-2026',
			note: 'criterion 1 asks for the ESPD under the law and names no document',
			criterion: 1,
			pointsToDocuments: false,
			evidence: 'Le DUME'
		}
	),
	'both-deadlines': synthetic('607074-2026', 'adds a tender deadline beside its request deadline'),
	'neither-deadline': synthetic('609955-2026', 'removes its tender deadline period'),
	'lots-differ': synthetic('600779-2026', "moves lot 2's tender deadline one day later"),
	'multilingual-criterion': synthetic(
		'602091-2026',
		'adds a Dutch description to its first criterion'
	),
	'cancel-notice': synthetic('600017-2026', 'sets the change reason code to cancel'),
	'cancel-intent-notice': synthetic('600017-2026', 'sets the change reason code to cancel-intent'),
	'change-no-reason': synthetic('600017-2026', 'removes its efac:ChangeReason element'),
	'reserved-participation': synthetic(
		'609955-2026',
		'reserves the lot with code res-ws, checked on the eForms reserved-procurement code list 2026-09-24'
	),
	'notice-source-no-criteria': synthetic(
		'609955-2026',
		'removes every efac:SelectionCriteria and keeps BT-821 epo-notice'
	),
	'doctype-entity': synthetic('609955-2026', 'adds a DOCTYPE declaring an entity'),
	truncated: synthetic(
		'609955-2026',
		'cuts the file inside the start tag of a criterion description'
	),
	'bom-crlf': synthetic('609955-2026', 'adds a UTF-8 byte order mark and CRLF line ends'),
	oversize: synthetic(
		'609955-2026',
		'pads an XML comment until the file is 2,097,153 bytes, built in memory only'
	),
	'english-classifier': synthetic(
		'635218-2026',
		'adds two English criteria, one pointing to the procurement documents and one not'
	)
} satisfies Record<string, CaptureRole | SyntheticRole>;

export type RoleName = keyof typeof FIXTURE_ROLES;
export type SyntheticRoleName = {
	[K in RoleName]: (typeof FIXTURE_ROLES)[K] extends SyntheticRole ? K : never;
}[RoleName];

const OVERSIZE_BYTES = 2_097_153;
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
const ONE_CRITERION = /<efac:SelectionCriteria>[\s\S]*?<\/efac:SelectionCriteria>/;

function replaceOnce(
	role: string,
	text: string,
	anchor: RegExp | string,
	replacement: string
): string {
	const found = typeof anchor === 'string' ? text.includes(anchor) : anchor.test(text);
	if (!found) throw new Error(`${role}: the source lacks ${String(anchor)}`);
	return text.replace(anchor, replacement);
}

function afterNth(role: string, text: string, marker: string, nth: number): number {
	let at = -1;
	for (let seen = 0; seen < nth; seen += 1) {
		at = text.indexOf(marker, at + 1);
		if (at < 0) throw new Error(`${role}: the source has fewer than ${nth} ${marker}`);
	}
	return at;
}

const withChangeReason = (role: string, source: string, code: string) =>
	replaceOnce(
		role,
		source,
		'listName="change-corrig-justification">update-add<',
		`listName="change-corrig-justification">${code}<`
	);

function englishCriteria(): string {
	const criterion = (code: string, text: string) =>
		`<efac:SelectionCriteria><cbc:TendererRequirementTypeCode listName="selection-criterion">${code}` +
		`</cbc:TendererRequirementTypeCode><cbc:Description languageID="ENG">${text}</cbc:Description>` +
		'</efac:SelectionCriteria>';
	return (
		'<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><efext:EformsExtension>' +
		criterion(
			'slc-abil-ref-services',
			'Tenderers must meet the minimum requirements for references set out in section 4 of the procurement documents.'
		) +
		criterion(
			'slc-stand-to-gen',
			'The average yearly general turnover over the last three financial years must be at least EUR 400,000.'
		) +
		'</efext:EformsExtension></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>'
	);
}

const BUILDERS: { [K in SyntheticRoleName]: (source: string) => string } = {
	'both-deadlines': (source) =>
		replaceOnce(
			'both-deadlines',
			source,
			'<cac:ParticipationRequestReceptionPeriod>',
			'<cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>2026-10-20+02:00</cbc:EndDate>' +
				'<cbc:EndTime>12:00:00+02:00</cbc:EndTime></cac:TenderSubmissionDeadlinePeriod>' +
				'<cac:ParticipationRequestReceptionPeriod>'
		),
	'neither-deadline': (source) =>
		replaceOnce(
			'neither-deadline',
			source,
			/<cac:TenderSubmissionDeadlinePeriod>[\s\S]*?<\/cac:TenderSubmissionDeadlinePeriod>/,
			''
		),
	'lots-differ': (source) => {
		const secondLot = afterNth('lots-differ', source, '<cac:ProcurementProjectLot>', 2);
		return (
			source.slice(0, secondLot) +
			replaceOnce(
				'lots-differ',
				source.slice(secondLot),
				/(<cac:TenderSubmissionDeadlinePeriod>[\s\S]*?<cbc:EndDate>)2026-10-05/,
				'$12026-10-06'
			)
		);
	},
	'multilingual-criterion': (source) =>
		replaceOnce(
			'multilingual-criterion',
			source,
			/(<efac:SelectionCriteria>[\s\S]*?<cbc:Description languageID="FRA">[^<]*<\/cbc:Description>)/,
			'$1<cbc:Description languageID="NLD">Een lijst van de belangrijkste leveringen in de laatste drie jaar, ' +
				'te rekenen vanaf de datum van opening van de offertes.</cbc:Description>'
		),
	'cancel-notice': (source) => withChangeReason('cancel-notice', source, 'cancel'),
	'cancel-intent-notice': (source) =>
		withChangeReason('cancel-intent-notice', source, 'cancel-intent'),
	'change-no-reason': (source) =>
		replaceOnce('change-no-reason', source, /<efac:ChangeReason>[\s\S]*?<\/efac:ChangeReason>/, ''),
	'reserved-participation': (source) =>
		replaceOnce(
			'reserved-participation',
			source,
			'listName="reserved-procurement">none<',
			'listName="reserved-procurement">res-ws<'
		),
	'notice-source-no-criteria': (source) => {
		if (!ONE_CRITERION.test(source))
			throw new Error('notice-source-no-criteria: the source has no criteria');
		return source.replace(new RegExp(ONE_CRITERION.source, 'g'), '');
	},
	'doctype-entity': (source) =>
		replaceOnce(
			'doctype-entity',
			source,
			/^(<\?xml[^>]*\?>)/,
			'$1<!DOCTYPE ContractNotice [<!ENTITY probe "expanded">]>'
		),
	truncated: (source) => {
		const criterion = afterNth('truncated', source, '<efac:SelectionCriteria>', 1);
		const description = afterNth('truncated', source.slice(criterion), '<cbc:Description ', 1);
		return source.slice(0, criterion + description + '<cbc:Description lang'.length);
	},
	'bom-crlf': (source) => {
		if (source.includes('\r') || !source.includes('\n')) {
			throw new Error('bom-crlf: the source must use LF line ends');
		}
		return BYTE_ORDER_MARK + source.replaceAll('\n', '\r\n');
	},
	oversize: (source) => {
		const padding = OVERSIZE_BYTES - new TextEncoder().encode(source).length - '<!---->'.length;
		if (padding < 1) throw new Error('oversize: the source is already too large to pad');
		return replaceOnce('oversize', source, /^(<\?xml[^>]*\?>)/, `$1<!--${'x'.repeat(padding)}-->`);
	},
	'english-classifier': (source) => {
		const lot = afterNth('english-classifier', source, '<cac:ProcurementProjectLot>', 1);
		return (
			source.slice(0, lot) +
			replaceOnce(
				'english-classifier',
				source.slice(lot),
				'<cac:TenderingTerms>',
				`<cac:TenderingTerms>${englishCriteria()}`
			)
		);
	}
};

export function buildSynthetic(role: SyntheticRoleName, sourceText: string): string {
	return BUILDERS[role](sourceText);
}

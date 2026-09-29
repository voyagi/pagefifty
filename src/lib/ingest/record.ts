// The notice tree from read-notice.ts turned into the record every page reads. Values stay strings
// as published: a figure is parsed later by code that knows its locale, never here.
// Imported by scripts/build-records.mjs under Node type stripping, so erasable syntax only and
// relative imports with their .ts extension.
import { pointsToDocuments } from '../core/document-pointer.ts';
import { toBcp47 } from './languages.ts';
import { linkTarget } from './link-target.ts';

export interface LangText {
	text: string;
	lang?: string;
	rawLang?: string;
}

export interface Buyer {
	name: LangText;
	country: string;
}

export interface LotDeadlines {
	request?: string;
	tender?: string;
}

// The amount is the decimal string as published ("834550.06", "0"); the list applies its own floor.
export interface Amount {
	amount: string;
	currency: string;
}

// A notice's link text as published, and a link target only for http and https: the text comes
// from a third party and becomes an href on the tender page.
export interface SafeLink {
	published: string;
	href?: string;
}

// The procurement documents a notice names. BT-15 (document type non-restricted-document) is the
// open address the law asks for; BT-615 (restricted-document) needs an access request, so a
// restricted link is marked and can never be shown as the open documents.
export interface DocumentsLink extends SafeLink {
	restricted?: true;
}

export interface LegislationReference {
	id: string;
	description?: LangText;
}

// listName tells a score weight (number-weight) from a threshold (number-threshold); both stay text.
export interface CriterionParameter {
	listName?: string;
	code: string;
	value: string;
}

// pointsToDocuments is true when any language version of the text sends the reader to the
// procurement documents; set once here so no page runs the classifier.
export interface Criterion {
	code: string;
	descriptions: LangText[];
	parameters: CriterionParameter[];
	pointsToDocuments: boolean;
}

export interface GroupLegalForm {
	required: string;
	description?: LangText;
}

export interface LotRecord {
	id: string;
	title?: LangText;
	deadlines: LotDeadlines;
	criteria: Criterion[];
	criteriaSources: string[];
	// The reserved-procurement code (BT-71) as published, "none" included; of several, a reservation
	// wins over "none". Absent means the lot declares no code at all (635218-2026 in the capture),
	// which is unknown: never read it as "none", and never let it count toward GO.
	reserved?: string;
	notes: LangText[];
	groupLegalForm?: GroupLegalForm;
	estimatedValue?: Amount;
	documents?: DocumentsLink;
}

export interface NoticeRecord {
	noticeNumber: string;
	sdkVersion: string;
	noticeSubtype: string;
	legalBasis: string;
	nationalLegislation: LegislationReference[];
	title: LangText;
	buyers: Buyer[];
	procedureNotes: LangText[];
	estimatedValue?: Amount;
	cpv: { main: string[]; additional: string[] };
	documents?: DocumentsLink;
	changeReasons: string[];
	lots: LotRecord[];
}

export type RecordResult = { ok: true; record: NoticeRecord } | { ok: false; detail: string };

type XmlNode = Record<string, unknown>;

const ROOT = 'ContractNotice';
const EFORMS_EXTENSION = [
	'ext:UBLExtensions',
	'ext:UBLExtension',
	'ext:ExtensionContent',
	'efext:EformsExtension'
];

class RecordFault extends Error {}

const missing = (path: string) => new RecordFault(`missing ${path}`);

// The parser runs with entity processing off, so text keeps its references as written. Decoding
// them here in one pass means "&amp;lt;" becomes "&lt;" and is never decoded a second time. A
// DOCTYPE is refused before parsing, so no entity beyond these five can be declared.
const REFERENCE = /&(?:(amp|lt|gt|quot|apos)|#([0-9]+|[xX][0-9a-fA-F]+));/g;
const NAMED: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'"
};

// XML 1.0's Char production. A reference to anything else (NUL, a control character, half of a
// surrogate pair, U+FFFE) names no character a notice may hold, so it stays as written.
function isXmlChar(code: number): boolean {
	return (
		code === 0x9 ||
		code === 0xa ||
		code === 0xd ||
		(code >= 0x20 && code <= 0xd7ff) ||
		(code >= 0xe000 && code <= 0xfffd) ||
		(code >= 0x10000 && code <= 0x10ffff)
	);
}

function decodeReferences(text: string): string {
	return text.replace(REFERENCE, (reference: string, name: string | undefined, number: string) => {
		if (name) return NAMED[name];
		const hex = /^x/i.test(number);
		const code = Number.parseInt(hex ? number.slice(1) : number, hex ? 16 : 10);
		return isXmlChar(code) ? String.fromCodePoint(code) : reference;
	});
}

function isNode(value: unknown): value is XmlNode {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asList(value: unknown): unknown[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

// Every element named by the path, following repeats at any level, in document order. The parser
// makes known repeating elements arrays; anything else may be one value or several.
function walk(start: unknown, path: readonly string[]): unknown[] {
	let level = asList(start);
	for (const name of path) {
		level = level.flatMap((node) => (isNode(node) ? asList(node[name]) : []));
	}
	return level;
}

// An element with attributes carries its text under #text; an empty one has none and reads as ''.
function textOf(value: unknown): string {
	const text = isNode(value) ? value['#text'] : value;
	return typeof text === 'string' ? decodeReferences(text) : '';
}

function attribute(value: unknown, name: string): string | undefined {
	const found = isNode(value) ? value[`@_${name}`] : undefined;
	return typeof found === 'string' ? decodeReferences(found) : undefined;
}

function firstText(start: unknown, path: readonly string[]): string | undefined {
	for (const value of walk(start, path)) {
		const text = textOf(value);
		if (text) return text;
	}
	return undefined;
}

function requiredText(start: unknown, path: readonly string[], where: string): string {
	const text = firstText(start, path);
	if (text === undefined) throw missing(`${where}/${path.join('/')}`);
	return text;
}

function langText(value: unknown): LangText {
	const rawLang = attribute(value, 'languageID');
	const lang = rawLang && toBcp47(rawLang);
	return { text: textOf(value), ...(lang && { lang }), ...(rawLang && { rawLang }) };
}

// A title can be published once per language; the one in the notice's own language comes first.
function pickName(names: unknown[], noticeLanguage: string | undefined): LangText | undefined {
	const withText = names.filter((name) => textOf(name));
	const own = withText.find((name) => attribute(name, 'languageID') === noticeLanguage);
	const chosen = own ?? withText[0];
	return chosen === undefined ? undefined : langText(chosen);
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/;
// Hours run to 23. XML also allows 24:00:00 for the end of a day, and Date.parse accepts it, but the
// record schema does not, and no notice in the capture uses it, so it is refused here by name.
const TIME = /^((?:[01]\d|2[0-3]):\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/;

// Date.parse accepts 30 February (V8 rolls it over to 2 March), so the day is also checked against
// the calendar: a real day survives the round trip through Date unchanged. The notice's digits are
// compared as text and never turned into numbers here.
function isCalendarDay(year: string, month: string, day: string): boolean {
	const written = `${year}-${month}-${day}`;
	const date = new Date(`${written}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${written}T`);
}

const asNumericOffset = (offset: string) => (offset === 'Z' ? '+00:00' : offset);

// EndTime's offset, or EndDate's when EndTime has none. Two different offsets would put the day
// and the time in different zones and could move the deadline by a day, so neither is guessed.
function deadlineOffset(dateOffset?: string, timeOffset?: string): string | undefined {
	if (dateOffset && timeOffset && asNumericOffset(dateOffset) !== asNumericOffset(timeOffset)) {
		return undefined;
	}
	return timeOffset ?? dateOffset;
}

// EndDate carries the day and EndTime the time, each with an offset; together they are one instant
// in the buyer's own offset, which the deadline display later reads.
function deadline(period: unknown, where: string): string | undefined {
	if (period === undefined) return undefined;
	const date = DATE.exec(requiredText(period, ['cbc:EndDate'], where));
	const time = TIME.exec(requiredText(period, ['cbc:EndTime'], where));
	const offset = deadlineOffset(date?.[4], time?.[2]);
	const valid = date && time && offset && isCalendarDay(date[1], date[2], date[3]);
	const instant = valid ? `${date[1]}-${date[2]}-${date[3]}T${time[1]}${offset}` : '';
	if (Number.isNaN(Date.parse(instant))) {
		throw new RecordFault(`${where} is not a date and time with an offset`);
	}
	return instant;
}

function lotDeadlines(lot: unknown, where: string): LotDeadlines {
	const tendering = ['cac:TenderingProcess'];
	const request = deadline(
		walk(lot, [...tendering, 'cac:ParticipationRequestReceptionPeriod'])[0],
		`${where}/cac:ParticipationRequestReceptionPeriod`
	);
	const tender = deadline(
		walk(lot, [...tendering, 'cac:TenderSubmissionDeadlinePeriod'])[0],
		`${where}/cac:TenderSubmissionDeadlinePeriod`
	);
	return { ...(request && { request }), ...(tender && { tender }) };
}

const unique = (values: string[]) => [...new Set(values)];

function texts(start: unknown, path: readonly string[]): string[] {
	return walk(start, path)
		.map(textOf)
		.filter((text) => text !== '');
}

// Every element with text, in publication order, each with its own language.
function langTexts(start: unknown, path: readonly string[]): LangText[] {
	return walk(start, path)
		.filter((value) => textOf(value))
		.map(langText);
}

// One element can hold codes from several code lists, told apart only by listName.
function codesIn(requests: unknown[], listName: string): string[] {
	return walk(requests, ['cac:SpecificTendererRequirement', 'cbc:TendererRequirementTypeCode'])
		.filter((code) => attribute(code, 'listName') === listName)
		.map(textOf)
		.filter((text) => text !== '');
}

function toAmount(projects: unknown[], where: string): Amount | undefined {
	const path = ['cac:RequestedTenderTotal', 'cbc:EstimatedOverallContractAmount'];
	const [element] = walk(projects, path);
	if (element === undefined) return undefined;
	const amount = textOf(element);
	const currency = attribute(element, 'currencyID');
	if (!amount || !currency) throw missing(`${where}/${path.join('/')} with its currencyID`);
	return { amount, currency };
}

// An open link beats a restricted one, and within one kind a link that can be followed beats one
// that cannot; otherwise the first published wins. In the capture 451 lots name one open link,
// seven only a restricted one, and one the same open link twice.
function toDocuments(terms: unknown[]): DocumentsLink | undefined {
	const links = walk(terms, ['cac:CallForTendersDocumentReference']).flatMap(
		(reference): DocumentsLink[] => {
			const uri = firstText(reference, ['cac:Attachment', 'cac:ExternalReference', 'cbc:URI']);
			if (uri === undefined) return [];
			const restricted = firstText(reference, ['cbc:DocumentType']) === 'restricted-document';
			return [{ ...safeLink(uri), ...(restricted && { restricted }) }];
		}
	);
	const rank = (link: DocumentsLink) => (link.restricted ? 2 : 0) + (link.href ? 0 : 1);
	return links.reduce<DocumentsLink | undefined>(
		(best, link) => (best === undefined || rank(link) < rank(best) ? link : best),
		undefined
	);
}

function toParameter(parameter: unknown, where: string): CriterionParameter {
	const path = `${where}/efac:CriterionParameter`;
	const [codeElement] = walk(parameter, ['efbc:ParameterCode']);
	const code = textOf(codeElement);
	if (!code) throw missing(`${path}/efbc:ParameterCode`);
	const value = requiredText(parameter, ['efbc:ParameterNumeric'], path);
	const listName = attribute(codeElement, 'listName');
	return { ...(listName && { listName }), code, value };
}

function toCriterion(criterion: unknown, lotWhere: string): Criterion {
	const where = `${lotWhere}/efac:SelectionCriteria`;
	const code = walk(criterion, ['cbc:TendererRequirementTypeCode']).find(
		(each) => attribute(each, 'listName') === 'selection-criterion' && textOf(each)
	);
	if (code === undefined) throw missing(`${where}/cbc:TendererRequirementTypeCode`);
	const descriptions = langTexts(criterion, ['cbc:Description']);
	return {
		code: textOf(code),
		descriptions,
		parameters: walk(criterion, ['efac:CriterionParameter']).map((each) =>
			toParameter(each, where)
		),
		pointsToDocuments: descriptions.some((each) => pointsToDocuments(each.text))
	};
}

// The legal form a group of tenderers must take sits in the lot's own qualification request.
function toGroupLegalForm(requests: unknown[], where: string): GroupLegalForm | undefined {
	const request = requests.find(
		(each) =>
			walk(each, ['cbc:CompanyLegalFormCode']).length +
				walk(each, ['cbc:CompanyLegalForm']).length >
			0
	);
	if (request === undefined) return undefined;
	const required = requiredText(
		request,
		['cbc:CompanyLegalFormCode'],
		`${where}/cac:TendererQualificationRequest`
	);
	const [description] = langTexts(request, ['cbc:CompanyLegalForm']);
	return { required, ...(description && { description }) };
}

function toLot(lot: unknown, noticeLanguage: string | undefined): LotRecord {
	const id = requiredText(lot, ['cbc:ID'], `${ROOT}/cac:ProcurementProjectLot`);
	const where = `${ROOT}/cac:ProcurementProjectLot[${id}]`;
	const project = walk(lot, ['cac:ProcurementProject']);
	const terms = walk(lot, ['cac:TenderingTerms']);
	const requests = walk(terms, ['cac:TendererQualificationRequest']);
	const title = pickName(walk(project, ['cbc:Name']), noticeLanguage);
	// A lot can publish several codes. A real reservation is what keeps a firm out, so it wins over
	// "none" in whatever order the two are published; otherwise the first code stands.
	const reservedCodes = codesIn(requests, 'reserved-procurement');
	const reserved = reservedCodes.find((code) => code !== 'none') ?? reservedCodes[0];
	const groupLegalForm = toGroupLegalForm(requests, where);
	const estimatedValue = toAmount(project, `${where}/cac:ProcurementProject`);
	const documents = toDocuments(terms);
	return {
		id,
		...(title && { title }),
		deadlines: lotDeadlines(lot, where),
		criteria: walk(terms, [...EFORMS_EXTENSION, 'efac:SelectionCriteria']).map((criterion) =>
			toCriterion(criterion, where)
		),
		criteriaSources: codesIn(requests, 'selection-criteria-source'),
		...(reserved && { reserved }),
		notes: langTexts(project, ['cbc:Note']),
		...(groupLegalForm && { groupLegalForm }),
		...(estimatedValue && { estimatedValue }),
		...(documents && { documents })
	};
}

function companiesById(root: unknown): Map<string, unknown> {
	const companies = walk(root, [
		...EFORMS_EXTENSION,
		'efac:Organizations',
		'efac:Organization',
		'efac:Company'
	]);
	const byId = new Map<string, unknown>();
	for (const company of companies) {
		const id = firstText(company, ['cac:PartyIdentification', 'cbc:ID']);
		if (id && !byId.has(id)) byId.set(id, company);
	}
	return byId;
}

function toBuyers(root: unknown): Buyer[] {
	const companies = companiesById(root);
	const parties = walk(root, ['cac:ContractingParty']);
	if (parties.length === 0) throw missing(`${ROOT}/cac:ContractingParty`);
	return parties.map((party) => {
		const where = `${ROOT}/cac:ContractingParty`;
		const id = requiredText(party, ['cac:Party', 'cac:PartyIdentification', 'cbc:ID'], where);
		const company = companies.get(id);
		if (company === undefined) throw missing(`efac:Organization ${id}`);
		const name = walk(company, ['cac:PartyName', 'cbc:Name']).find((each) => textOf(each));
		if (name === undefined) throw missing(`efac:Organization ${id}/cac:PartyName/cbc:Name`);
		const country = requiredText(
			company,
			['cac:PostalAddress', 'cac:Country', 'cbc:IdentificationCode'],
			`efac:Organization ${id}`
		);
		return { name: langText(name), country };
	});
}

function toLegislation(root: XmlNode): LegislationReference[] {
	const path = ['cac:TenderingTerms', 'cac:ProcurementLegislationDocumentReference'];
	return walk(root, path).map((reference) => {
		const id = requiredText(reference, ['cbc:ID'], `${ROOT}/${path.join('/')}`);
		const [description] = langTexts(reference, ['cbc:DocumentDescription']);
		return { id, ...(description && { description }) };
	});
}

// CPV codes from the procedure and from every lot, each code once, in publication order.
function cpvCodes(projects: unknown[], classification: string): string[] {
	const codes = walk(projects, [classification, 'cbc:ItemClassificationCode']).filter(
		(code) => attribute(code, 'listName') === 'cpv'
	);
	return unique(codes.map(textOf).filter((text) => text !== ''));
}

function buildRecord(root: XmlNode, noticeNumber: string): NoticeRecord {
	const sdkVersion = requiredText(root, ['cbc:CustomizationID'], ROOT);
	const extension = [...EFORMS_EXTENSION, 'efac:NoticeSubType', 'cbc:SubTypeCode'];
	const noticeSubtype = requiredText(root, extension, ROOT);
	const legalBasis = requiredText(root, ['cbc:RegulatoryDomain'], ROOT);
	const noticeLanguage = firstText(root, ['cbc:NoticeLanguageCode']);
	const procedure = walk(root, ['cac:ProcurementProject']);
	const title = pickName(walk(procedure, ['cbc:Name']), noticeLanguage);
	if (title === undefined) throw missing(`${ROOT}/cac:ProcurementProject/cbc:Name`);
	const lots = walk(root, ['cac:ProcurementProjectLot']);
	if (lots.length === 0) throw missing(`${ROOT}/cac:ProcurementProjectLot`);
	const projects = [...procedure, ...walk(lots, ['cac:ProcurementProject'])];
	const estimatedValue = toAmount(procedure, `${ROOT}/cac:ProcurementProject`);
	const documents = toDocuments(walk(root, ['cac:TenderingTerms']));
	return {
		noticeNumber,
		sdkVersion,
		noticeSubtype,
		legalBasis,
		nationalLegislation: toLegislation(root),
		title,
		buyers: toBuyers(root),
		procedureNotes: langTexts(procedure, ['cbc:Note']),
		...(estimatedValue && { estimatedValue }),
		cpv: {
			main: cpvCodes(projects, 'cac:MainCommodityClassification'),
			additional: cpvCodes(projects, 'cac:AdditionalCommodityClassification')
		},
		...(documents && { documents }),
		changeReasons: texts(root, [
			...EFORMS_EXTENSION,
			'efac:Changes',
			'efac:ChangeReason',
			'cbc:ReasonCode'
		]),
		lots: lots.map((lot) => toLot(lot, noticeLanguage))
	};
}

export function toNoticeRecord(tree: unknown, noticeNumber: string): RecordResult {
	const root = isNode(tree) ? tree[ROOT] : undefined;
	if (!isNode(root)) return { ok: false, detail: `missing ${ROOT}` };
	try {
		return { ok: true, record: buildRecord(root, noticeNumber) };
	} catch (error) {
		if (error instanceof RecordFault) return { ok: false, detail: error.message };
		throw error;
	}
}

// Only an absolute http or https URL becomes a link target; javascript:, data:, a relative or an
// unparseable URI keeps its published text and no href.
export function safeLink(published: string): SafeLink {
	const href = linkTarget(published);
	return href === undefined ? { published } : { published, href };
}

// TED's own id for the notice, zero-padded as published ("00609955-2026"), when the notice has one.
export function noticePublicationId(tree: unknown): string | undefined {
	const root = isNode(tree) ? tree[ROOT] : undefined;
	return firstText(root, [...EFORMS_EXTENSION, 'efac:Publication', 'efbc:NoticePublicationID']);
}

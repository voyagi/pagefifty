// The notice tree from read-notice.ts turned into the record every page reads. Values stay strings
// as published: a figure is parsed later by code that knows its locale, never here.
// Imported by scripts/build-records.mjs under Node type stripping, so erasable syntax only and
// relative imports with their .ts extension.
import { toBcp47 } from './languages.ts';

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

export interface LotRecord {
	id: string;
	title?: LangText;
	deadlines: LotDeadlines;
}

export interface NoticeRecord {
	noticeNumber: string;
	sdkVersion: string;
	title: LangText;
	buyers: Buyer[];
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
const TIME = /^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/;

// Date.parse accepts 30 February (V8 answers a number for it), so the day is also checked against
// the calendar before it becomes part of a deadline.
function isCalendarDay(year: string, month: string, day: string): boolean {
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
	return (
		date.getUTCFullYear() === Number(year) &&
		date.getUTCMonth() === Number(month) - 1 &&
		date.getUTCDate() === Number(day)
	);
}

// EndDate carries the day and EndTime the time, each with an offset; together they are one instant
// in the buyer's own offset, which the deadline display later reads.
function deadline(period: unknown, where: string): string | undefined {
	if (period === undefined) return undefined;
	const date = DATE.exec(requiredText(period, ['cbc:EndDate'], where));
	const time = TIME.exec(requiredText(period, ['cbc:EndTime'], where));
	const offset = time?.[2] ?? date?.[4];
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

function toLot(lot: unknown, noticeLanguage: string | undefined): LotRecord {
	const id = requiredText(lot, ['cbc:ID'], `${ROOT}/cac:ProcurementProjectLot`);
	const where = `${ROOT}/cac:ProcurementProjectLot[${id}]`;
	const title = pickName(walk(lot, ['cac:ProcurementProject', 'cbc:Name']), noticeLanguage);
	return { id, ...(title && { title }), deadlines: lotDeadlines(lot, where) };
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

function buildRecord(root: XmlNode, noticeNumber: string): NoticeRecord {
	const sdkVersion = requiredText(root, ['cbc:CustomizationID'], ROOT);
	const noticeLanguage = firstText(root, ['cbc:NoticeLanguageCode']);
	const title = pickName(walk(root, ['cac:ProcurementProject', 'cbc:Name']), noticeLanguage);
	if (title === undefined) throw missing(`${ROOT}/cac:ProcurementProject/cbc:Name`);
	const lots = walk(root, ['cac:ProcurementProjectLot']);
	if (lots.length === 0) throw missing(`${ROOT}/cac:ProcurementProjectLot`);
	return {
		noticeNumber,
		sdkVersion,
		title,
		buyers: toBuyers(root),
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

// TED's own id for the notice, zero-padded as published ("00609955-2026"), when the notice has one.
export function noticePublicationId(tree: unknown): string | undefined {
	const root = isNode(tree) ? tree[ROOT] : undefined;
	return firstText(root, [...EFORMS_EXTENSION, 'efac:Publication', 'efbc:NoticePublicationID']);
}

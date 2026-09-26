// The one module that imports the XML parser (depcruise single-parser-entry), so every notice
// passes the size cap, the DOCTYPE refusal and validation before it is parsed. Each step fails
// with a typed result, never a partial record.
// Imported by scripts/build-records.mjs under Node type stripping: erasable syntax only and
// relative imports with their .ts extension.
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { noticePublicationId, toNoticeRecord, type NoticeRecord } from './record.ts';

export const MAX_NOTICE_BYTES = 2 * 1024 * 1024;

export type ReadFailure = {
	ok: false;
	kind: 'too-large' | 'doctype' | 'malformed';
	detail: string;
};

export type TreeResult = { ok: true; tree: unknown } | ReadFailure;
export type NoticeResult = { ok: true; record: NoticeRecord } | ReadFailure;

const ROOT = 'ContractNotice';

// A notice could bind a known prefix to another namespace, and a prefix check against these URIs
// catches that before the reader trusts element names such as cbc:Name.
const NAMESPACES: ReadonlyMap<string, string> = new Map([
	['', 'urn:oasis:names:specification:ubl:schema:xsd:ContractNotice-2'],
	['cac', 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'],
	['cbc', 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'],
	['efac', 'http://data.europa.eu/p27/eforms-ubl-extension-aggregate-components/1'],
	['efbc', 'http://data.europa.eu/p27/eforms-ubl-extension-basic-components/1'],
	['efext', 'http://data.europa.eu/p27/eforms-ubl-extensions/1'],
	['ext', 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2']
]);
const DEFAULT_DECLARATION = '@_xmlns';
const PREFIX_DECLARATION = '@_xmlns:';

// Each of these repeats wherever it occurs, so a one-lot notice has the same shape as a ten-lot one.
const REPEATING: ReadonlySet<string> = new Set([
	'cac:ProcurementProjectLot',
	'cac:ContractingParty',
	'efac:Organization',
	'efac:SelectionCriteria',
	'cbc:Description',
	'efac:CriterionParameter',
	'cac:TendererQualificationRequest',
	'cac:SpecificTendererRequirement',
	'efac:Changes',
	'efac:ChangeReason',
	'cac:ProcurementLegislationDocumentReference',
	'cac:AdditionalCommodityClassification',
	'cac:CallForTendersDocumentReference',
	'cbc:Name',
	'cbc:Note'
]);

// Values stay strings ("1.500" is 1500 in German and 1.5 in English); entities stay as written and
// record.ts decodes the five predefined ones once.
const parser = new XMLParser({
	ignoreAttributes: false,
	removeNSPrefix: false,
	parseTagValue: false,
	parseAttributeValue: false,
	processEntities: false,
	maxNestedTags: 100,
	isArray: (tagName: string) => REPEATING.has(tagName)
});

const UTF8 = new TextDecoder('utf-8', { fatal: true });

const fail = (kind: ReadFailure['kind'], detail: string): ReadFailure => ({
	ok: false,
	kind,
	detail
});

function decode(bytes: Uint8Array): string | undefined {
	try {
		return UTF8.decode(bytes).replace(/\r\n?/g, '\n');
	} catch {
		return undefined;
	}
}

function declaredPrefix(key: string): string | undefined {
	if (key === DEFAULT_DECLARATION) return '';
	return key.startsWith(PREFIX_DECLARATION) ? key.slice(PREFIX_DECLARATION.length) : undefined;
}

function declarationFault(key: string, uri: unknown): string | undefined {
	const prefix = declaredPrefix(key);
	const expected = prefix === undefined ? undefined : NAMESPACES.get(prefix);
	if (expected === undefined || expected === uri) return undefined;
	return `namespace prefix ${prefix || '(default)'} is bound to ${String(uri)}, expected ${expected}`;
}

// Every declaration on every element of the parsed tree. Text, comments and attribute values that
// only quote a declaration bind nothing, so they never refuse a notice. The walk keeps its own
// list instead of recursing or spreading, so a notice of many thousand elements cannot overflow
// the stack.
function namespaceFault(tree: unknown): string | undefined {
	const pending: unknown[] = [tree];
	while (pending.length > 0) {
		const node = pending.pop();
		if (typeof node !== 'object' || node === null) continue;
		for (const [key, value] of Object.entries(node)) {
			const fault = declarationFault(key, value);
			if (fault) return fault;
			pending.push(value);
		}
	}
	return undefined;
}

function rootFault(tree: unknown): string | undefined {
	const names = Object.keys(tree as object).filter((name) => !name.startsWith('?'));
	if (names.length !== 1 || names[0] !== ROOT)
		return `root element ${names.join(', ')} is not ${ROOT}`;
	const root = (tree as Record<string, unknown>)[ROOT] as Record<string, unknown>;
	for (const [prefix, uri] of NAMESPACES) {
		const attribute = prefix ? `@_xmlns:${prefix}` : '@_xmlns';
		if (root[attribute] !== uri)
			return `${ROOT} does not declare ${prefix || 'its default namespace'}`;
	}
	return undefined;
}

function parse(text: string): TreeResult {
	try {
		return { ok: true, tree: parser.parse(text) };
	} catch (error) {
		return fail('malformed', `the parser stopped: ${String(error)}`);
	}
}

export function readNoticeXml(bytes: Uint8Array): TreeResult {
	if (bytes.byteLength > MAX_NOTICE_BYTES) {
		return fail('too-large', `${bytes.byteLength} bytes, over the ${MAX_NOTICE_BYTES} byte cap`);
	}
	const text = decode(bytes);
	if (text === undefined) return fail('malformed', 'not UTF-8 text');
	if (/<!DOCTYPE|<!ENTITY/i.test(text)) return fail('doctype', 'a DOCTYPE or ENTITY declaration');
	const valid = XMLValidator.validate(text);
	if (valid !== true) {
		return fail('malformed', `${valid.err.code} at line ${valid.err.line}: ${valid.err.msg}`);
	}
	const parsed = parse(text);
	if (!parsed.ok) return parsed;
	const badNamespace = namespaceFault(parsed.tree);
	if (badNamespace) return fail('malformed', badNamespace);
	const badRoot = rootFault(parsed.tree);
	return badRoot ? fail('malformed', badRoot) : parsed;
}

// TED zero-pads the first part of its own id ("00609955-2026" for notice 609955-2026).
const withoutLeadingZeros = (id: string) => id.replace(/^0+(?=\d)/, '');

export function readNotice(
	bytes: Uint8Array,
	{ noticeNumber }: { noticeNumber: string }
): NoticeResult {
	const parsed = readNoticeXml(bytes);
	if (!parsed.ok) return parsed;
	const published = noticePublicationId(parsed.tree);
	if (
		published !== undefined &&
		withoutLeadingZeros(published) !== withoutLeadingZeros(noticeNumber)
	) {
		return fail('malformed', `publication id ${published} is not notice ${noticeNumber}`);
	}
	const built = toNoticeRecord(parsed.tree, noticeNumber);
	return built.ok ? built : fail('malformed', built.detail);
}

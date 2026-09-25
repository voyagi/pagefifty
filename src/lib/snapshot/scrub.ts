// Removes personal contact data from TED notices before they are tracked (CONTEXT D-35): the
// product reads none of it, and once pushed it cannot be taken back. Pure and dependency free,
// because scripts/scrub-capture.mjs imports this file directly under Node type stripping and the
// XML parser is reserved for the notice reader.

export const SCRUB_PLACEHOLDER = '[removed]';

// The lookbehind only lets a match start where a run of address characters starts. Every match
// starts there anyway, and without it a long run with no @ (a padded comment, an encoded blob) is
// rescanned from each of its characters, which is quadratic.
export const EMAIL_PATTERN = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u;

// Some buyers write (at) or [at] in place of the at sign so that crawlers miss the address. The
// same lookbehind keeps this scan linear.
const OBFUSCATED_EMAIL =
	/(?<![\p{L}\p{N}._%+-])([\p{L}\p{N}._%+-]+)\s?[([{]at[)\]}]\s?[\p{L}\p{N}.-]+\.\p{L}{2,}/giu;

type ScrubKind =
	| 'email-element'
	| 'telephone-element'
	| 'telefax-element'
	| 'contact-name'
	| 'touchpoint-name'
	| 'email'
	| 'obfuscated-email'
	| 'phone-after-keyword'
	| 'international-phone'
	| 'name-before-email';

export interface ScrubSpan {
	start: number;
	end: number;
	kind: ScrubKind;
}

const ELEMENT_KINDS: ReadonlyArray<[tag: string, kind: ScrubKind]> = [
	['cbc:ElectronicMail', 'email-element'],
	['cbc:Telephone', 'telephone-element'],
	['cbc:Telefax', 'telefax-element']
];

// eSender files put XML comments between sibling tags, so nothing here may assume that only
// whitespace separates two tags. Element text never holds a comment in the capture, and an
// element whose text did would stay unscrubbed and fail the capture test rather than pass silently.
function elementTextPattern(tag: string): RegExp {
	return new RegExp(`<${tag}(?:\\s[^>]*)?(?<!/)>([^<]*)</${tag}>`, 'dg');
}

const CONTACT_BLOCK = /<cac:Contact(?:\s[^>]*)?>[\s\S]*?<\/cac:Contact>/g;
// A touch point is another contact point of an organisation, and buyers put a person's name in
// its PartyName as well as department names, so every name inside one goes. The product reads
// buyer names from efac:Company, never from a touch point.
const TOUCHPOINT_BLOCK = /<efac:TouchPoint(?:\s[^>]*)?>[\s\S]*?<\/efac:TouchPoint>/g;

// Only a number that directly follows one of these words counts: the capture's free text names
// review chambers' switchboards this way, while digits elsewhere are deadlines, values and codes.
// A word may carry a number word, joined or apart ("Telefonnummer", "Tel.-Nr.", "tel. nr.").
// German letterheads also write Fon and Rufnummer. A lone T or F before a colon is the letterhead
// form buyers type into identifier fields.
// ASCII digits only, so text without them can never match. Every gap is bounded, so a keyword
// followed by a long run of spaces cannot make the scan quadratic.
const PHONE_AFTER_KEYWORD =
	/(?<!\p{L})(?:(?:telefax|telefon|telefoon|t\p{L}l\p{L}phone|phone|fax|fon|rufnummer|mobile?|mobiel|handy|gsm)(?:nummer|nr)?|t[eé]l(?=[\s.:-])|[tf](?=\s?:))(?:[\s.]{0,2}-?\s{0,2}(?:nr|nummer|number|no|n°)\.?)?[\s.:]{0,4}(\+?(?:\([0-9]+\)[^\S\r\n]?)?[0-9](?:(?:[0-9()/.-]|[^\S\r\n])*[0-9])?)/dgiu;
const MIN_PHONE_DIGITS = 6;

// A plus sign, a country code and at least eight digits in all is a telephone number wherever it
// stands, keyword or not. The lookbehind keeps "2+4" and the like out, and a plus before an amount
// grouped in thousands ("+15.000.000") is a value, not a number to dial. The 00 form gets no rule
// of its own: publication numbers ("00635909-2026") and buyers' internal references
// ("BB-001.022/2026") share its shape, and every 00 number in the 2026-09-15 capture stood after a
// keyword or in a telephone element.
const INTERNATIONAL_PHONE = /(?<![\p{L}\p{N}+])(\+[1-9](?:[\s()/.-]{0,2}[0-9]){7,})/dgu;
const SIGNED_AMOUNT = /^\+[0-9]{1,3}(?:[.,][0-9]{3})+$/;

function groupSpans(pattern: RegExp, text: string, kind: ScrubKind): ScrubSpan[] {
	const spans: ScrubSpan[] = [];
	for (const match of text.matchAll(pattern)) {
		const group = match.indices?.[1];
		if (!group) throw new Error(`scrub pattern ${pattern.source} needs the d flag and one group`);
		spans.push({ start: group[0], end: group[1], kind });
	}
	return spans;
}

function namesInBlocks(text: string, block: RegExp, kind: ScrubKind): ScrubSpan[] {
	const spans: ScrubSpan[] = [];
	for (const found of text.matchAll(block)) {
		for (const span of groupSpans(elementTextPattern('cbc:Name'), found[0], kind)) {
			spans.push({ ...span, start: span.start + found.index, end: span.end + found.index });
		}
	}
	return spans;
}

function elementSpans(text: string): ScrubSpan[] {
	return [
		...ELEMENT_KINDS.flatMap(([tag, kind]) => groupSpans(elementTextPattern(tag), text, kind)),
		...namesInBlocks(text, CONTACT_BLOCK, 'contact-name'),
		...namesInBlocks(text, TOUCHPOINT_BLOCK, 'touchpoint-name')
	];
}

function phoneSpans(text: string): ScrubSpan[] {
	const keyword = groupSpans(PHONE_AFTER_KEYWORD, text, 'phone-after-keyword').filter(
		(span) => text.slice(span.start, span.end).replace(/[^0-9]/g, '').length >= MIN_PHONE_DIGITS
	);
	const international = groupSpans(INTERNATIONAL_PHONE, text, 'international-phone').filter(
		(span) => !SIGNED_AMOUNT.test(text.slice(span.start, span.end))
	);
	return [...keyword, ...international];
}

// A notice that names a person right before that person's own address ("an Jana Beispiel,
// jana.beispiel@...") would keep the name once the address is gone, so the words spelled by the
// address's local part are removed with it. An initial counts ("J. Beispiel" before
// j.beispiel@...), but a local part of initials alone spells no name worth the risk of a false
// match. No list of names exists anywhere in the code.
const NAME_WINDOW = 120;

// An address writes a name without accents and spells umlauts out ("Jörn Groß" before
// joern.gross@), so the name is looked for in a folded copy of the text in which every UTF-16
// unit becomes its unaccented lower-case letter. One unit in, one unit out, so an offset in the
// copy is an offset in the text.
function foldUnits(text: string): string {
	let folded = '';
	for (let at = 0; at < text.length; at += 1) {
		folded += text[at].normalize('NFD')[0].toLowerCase()[0];
	}
	return folded;
}

// In the address ae, oe and ue may stand for an umlaut the copy folded to a, o and u, and ss for
// the sharp s the copy keeps. Text typed in decomposed form keeps its combining marks in the
// copy, so any may follow a letter.
const SPELLED_OUT: Readonly<Record<string, string>> = {
	ae: '(?:ae|a)',
	oe: '(?:oe|o)',
	ue: '(?:ue|u)',
	ss: '(?:ss|ß)'
};

function spelledOut(token: string): string {
	return foldUnits(token).replace(
		/[aou]e|ss|./gsu,
		(unit) => `${SPELLED_OUT[unit] ?? unit}\\p{M}*`
	);
}

function nameBeforeEmail(
	text: string,
	emailStart: number,
	localPart: string
): ScrubSpan | undefined {
	// A plus tag ("jana.beispiel+vergabe@") names a mailbox, not a person, and capitals may join the
	// words where a dot would ("JanaBeispiel@").
	const tokens = localPart
		.split('+')[0]
		.split(/[._-]+/)
		.flatMap((part) => part.split(/(?<=\p{Ll})(?=\p{Lu})/u))
		.filter((token) => /^\p{L}+$/u.test(token));
	if (tokens.length < 2 || !tokens.some((token) => token.length >= 2)) return undefined;
	const windowStart = Math.max(0, emailStart - NAME_WINDOW);
	const before = foldUnits(text.slice(windowStart, emailStart));
	// A double surname keeps its hyphen in the text, and a mail header puts the address in angle
	// brackets, escaped in XML.
	const name = new RegExp(
		`(?<!\\p{L})(${tokens.map(spelledOut).join('[\\s.-]+')})(?:[\\s,;:(<]|&lt;){0,3}$`,
		'u'
	).exec(before);
	if (!name) return undefined;
	const start = windowStart + name.index;
	return { start, end: start + name[1].length, kind: 'name-before-email' };
}

function emailSpans(text: string): ScrubSpan[] {
	const spans: ScrubSpan[] = [];
	const add = (start: number, address: string, localPart: string, kind: ScrubKind) => {
		const name = nameBeforeEmail(text, start, localPart);
		if (name) spans.push(name);
		spans.push({ start, end: start + address.length, kind });
	};
	for (const match of text.matchAll(new RegExp(EMAIL_PATTERN.source, 'gu'))) {
		add(match.index, match[0], match[0].slice(0, match[0].indexOf('@')), 'email');
	}
	for (const match of text.matchAll(OBFUSCATED_EMAIL)) {
		add(match.index, match[0], match[1], 'obfuscated-email');
	}
	return spans;
}

function mergeSpans(spans: ScrubSpan[]): ScrubSpan[] {
	const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
	const merged: ScrubSpan[] = [];
	for (const span of sorted) {
		const last = merged.at(-1);
		if (last && span.start < last.end) last.end = Math.max(last.end, span.end);
		else merged.push({ ...span });
	}
	return merged;
}

export function findTextSpans(text: string): ScrubSpan[] {
	return mergeSpans([...emailSpans(text), ...phoneSpans(text)]);
}

export function findNoticeSpans(text: string): ScrubSpan[] {
	return mergeSpans([...elementSpans(text), ...emailSpans(text), ...phoneSpans(text)]);
}

export function replaceSpans(
	text: string,
	spans: readonly ScrubSpan[],
	replacement: string
): string {
	let out = '';
	let cursor = 0;
	for (const span of spans) {
		out += text.slice(cursor, span.start) + replacement;
		cursor = span.end;
	}
	return out + text.slice(cursor);
}

export function scrubNoticeXml(text: string): string {
	return replaceSpans(text, findNoticeSpans(text), SCRUB_PLACEHOLDER);
}

function scrubText(text: string): string {
	return replaceSpans(text, findTextSpans(text), SCRUB_PLACEHOLDER);
}

// The words PHONE_AFTER_KEYWORD reads before a number name a phone field too, so a local number under
// a key such as "mobile" is replaced like one under "phone".
const CONTACT_KEY_TOKENS = new Set([
	'email',
	'mail',
	'tel',
	'telephone',
	'phone',
	'fax',
	'telefax',
	'telefon',
	'telefoon',
	'fon',
	'rufnummer',
	'mobile',
	'mobil',
	'mobiel',
	'handy',
	'gsm',
	'contact'
]);

export function isContactKey(key: string): boolean {
	const tokens = key
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/);
	return tokens.some((token) => CONTACT_KEY_TOKENS.has(token));
}

function replaceLeaves(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(replaceLeaves);
	if (typeof value === 'string' || typeof value === 'number') return SCRUB_PLACEHOLDER;
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [key, replaceLeaves(inner)])
		);
	}
	return value;
}

export function scrubJsonValue(value: unknown): unknown {
	if (typeof value === 'string') return scrubText(value);
	if (Array.isArray(value)) return value.map(scrubJsonValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [
				key,
				isContactKey(key) ? replaceLeaves(inner) : scrubJsonValue(inner)
			])
		);
	}
	return value;
}

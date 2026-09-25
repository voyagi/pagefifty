// Which files of a capture folder the contact checks can read. The capture test and
// scripts/scrub-capture.mjs both import this, so they never disagree about a folder. A PDF, a ZIP
// or an office file hides its words from every pattern, so it goes into a capture only once it is
// extracted to text and scrubbed. An empty file (the untracked deslop marker) hides nothing.
// Dependency free, for the same reason as scrub.ts: the script imports it under type stripping.

export const CAPTURE_TEXT_TYPES: readonly string[] = ['.json', '.xml', '.md', '.txt', '.html'];

export function isCaptureText(path: string): boolean {
	return CAPTURE_TEXT_TYPES.some((type) => path.endsWith(type));
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

// A file under a text name counts as text only when its bytes are UTF-8 with no NUL character: a ZIP
// saved as .xml decodes to noise that no pattern reads, so it is named rather than passed.
function isReadableText(bytes: Uint8Array): boolean {
	try {
		return !UTF8.decode(bytes).includes('\u0000');
	} catch {
		return false;
	}
}

export function isUnreadableCaptureFile(path: string, bytes: Uint8Array): boolean {
	return bytes.length > 0 && !(isCaptureText(path) && isReadableText(bytes));
}

// XML may write any character as a numeric reference (&#64; and &#x40; are both an at sign), and a
// pattern run over the raw text sees neither, so both contact checks also read the text decoded.
const CHARACTER_REFERENCE = /&#(?:([0-9]+)|[xX]([0-9a-fA-F]+));/g;

export function decodeCharacterReferences(text: string): string {
	return text.replace(
		CHARACTER_REFERENCE,
		(reference: string, decimal: string | undefined, hex: string | undefined) => {
			const code =
				decimal === undefined ? Number.parseInt(hex ?? '', 16) : Number.parseInt(decimal, 10);
			return code <= 0x10ffff ? String.fromCodePoint(code) : reference;
		}
	);
}

// Every amount a comparison uses is read here, by code, from the verified quote; a number the model
// wrote is only ever compared with this reading (SPEC R4). Loaded by the capture command under Node
// type stripping: erasable syntax only, no imports.

type Basis = 'net' | 'gross' | 'unstated';
type Comparator = 'at-least' | 'more-than' | 'unstated';

export type MoneyReading =
	| { kind: 'none' }
	| { kind: 'several' }
	| { kind: 'one'; cents: number; basis: Basis; comparator: Comparator };

const AMOUNT =
	/(?<![\p{L}\p{N}])(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*(?:EUR|Euro|€)(?![\p{L}\p{N}])/giu;

function basisOf(text: string): Basis {
	if (/(?<!\p{L})netto(?!\p{L})/iu.test(text)) return 'net';
	return /(?<!\p{L})brutto(?!\p{L})/iu.test(text) ? 'gross' : 'unstated';
}

function comparatorOf(text: string): Comparator {
	if (/(?<!\p{L})mindest/iu.test(text)) return 'at-least';
	return /(?<!\p{L})mehr\s+als(?!\p{L})/iu.test(text) ? 'more-than' : 'unstated';
}

export function parseMoney(text: string, lang?: string): MoneyReading {
	const amounts = lang === 'de' ? [...text.matchAll(AMOUNT)] : [];
	if (amounts.length === 0) return { kind: 'none' };
	if (amounts.length > 1) return { kind: 'several' };
	const [, whole, fraction = ''] = amounts[0];
	const cents = Number.parseInt(whole.replaceAll('.', '') + fraction.padEnd(2, '0'), 10);
	return { kind: 'one', cents, basis: basisOf(text), comparator: comparatorOf(text) };
}

export function sameNumber(modelText: string, reading: MoneyReading, lang?: string): boolean {
	const model = parseMoney(modelText, lang);
	return reading.kind === 'one' && model.kind === 'one' && model.cents === reading.cents;
}

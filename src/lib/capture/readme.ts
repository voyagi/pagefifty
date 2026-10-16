// The one text module for a capture folder's README (D-33), worded as examples/2026-09-15/README.md.
// The reuse terms are TED's and are quoted as that README quotes them. Imported under Node type
// stripping: erasable syntax only.
import { SERVER_TIME_ZONE, formatDeadline } from '../core/deadline.ts';
import type { Modes } from '../server/transport-mode.ts';
import { dayText } from '../snapshot/capture-id.ts';

interface ReadmeParts {
	captureDate: string;
	fetchedAt: string;
	query: string;
	since: string;
	modes: Modes;
	written: number;
	searchTotal: number;
	leftOut: readonly { notice: string; reason: string }[];
	failed: readonly { notice: string; reason: string }[];
	// Failed notices whose search hit named no usable notice identifier and version.
	unversioned: number;
}

const counted = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const SOURCE_AND_TERMS = [
	'## Source and reuse terms',
	'',
	"Source: TED, the European Union's Tenders Electronic Daily, https://ted.europa.eu.",
	'',
	'© European Union, 1998-2026. The TED legal notice says the procurement notices "can be freely reused, for commercial or non-commercial purposes". Reuse follows Commission Decision 2011/833/EU of 12 December 2011 on the reuse of Commission documents, and the editorial content of the TED websites is licensed under CC BY 4.0. Terms: https://ted.europa.eu/en/legal-notice'
];

const sinceDay = (since: string) => `${since.slice(0, 4)}-${since.slice(4, 6)}-${since.slice(6)}`;

function whenAndWhat(parts: ReadmeParts): string[] {
	const first = dayText(sinceDay(parts.since));
	const captured = dayText(parts.captureDate);
	return [
		'## When and what',
		'',
		`- Captured ${parts.fetchedAt} (${formatDeadline(parts.fetchedAt, SERVER_TIME_ZONE)}), the \`fetchedAt\` value in \`notices.json\`.`,
		`- Query, as recorded in \`notices.json\`: \`${parts.query}\`. The search sent \`scope: ACTIVE\` and asked for only the latest version of each notice, and \`notices.json\` records both settings.`,
		`- The window runs from ${first}, the first publication day the query names, to the capture day, ${captured}. A tender published before ${first} and still open is not in this capture.`,
		'- The search reads competition notices only, so a procedure its buyer ended through a later result notice is not detected here.',
		`- ${counted(parts.written, 'notice')} written, of the ${parts.searchTotal} TED stated for the search: \`notices.json\` lists them (\`total\` is the written count, \`searchTotal\` TED's) and \`xml/\` holds one eForms notice file per publication number.`,
		'- `fetch-log.json` lists every request of this run, search pages and notice downloads, with its time, status and size. `run.json` records the run: its start and end, the commit it ran from, the query and what became of each listed notice.',
		`- Modes of this run: TED ${parts.modes.ted}, Token Factory ${parts.modes.tokenFactory}, Tavily ${parts.modes.tavily}. \`run.json\` records them beside every metered call the run attempted.`
	];
}

// TED's search flag does not deliver latest versions alone, so a capture can hold fewer notices than
// TED listed, and each one left out is named with its reason.
function leftOutSection(leftOut: ReadmeParts['leftOut']): string[] {
	if (leftOut.length === 0) return [];
	return [
		'## Left out',
		'',
		'These notices were in the search answer and are not in this capture:',
		'',
		...leftOut.map(({ notice, reason }) => `- ${notice}: ${reason}`),
		''
	];
}

// A failed notice whose search hit named its version has already taken any older version of it out
// (Left out). Only one that named none could still leave an older version listed, so the README
// warns about those alone.
function versionWarning(unversioned: number): string[] {
	if (unversioned === 0) return [];
	const which = unversioned === 1 ? 'it' : 'one of them';
	return [
		`TED named no version for ${counted(unversioned, 'notice')} listed here, so an earlier version of ${which} may still be listed here as open.`,
		''
	];
}

function notCapturedSection(parts: ReadmeParts): string[] {
	if (parts.failed.length === 0) return [];
	return [
		'## Not captured',
		'',
		'These notices were in the search answer, but their XML could not be downloaded, read or served as published, so they are not in this capture:',
		'',
		...parts.failed.map(({ notice, reason }) => `- ${notice}: ${reason}`),
		'',
		...versionWarning(parts.unversioned)
	];
}

const WHAT_WAS_CHANGED = [
	'## What was changed',
	'',
	"Every contact name, every email address (also one written with (at) or [at] in place of the at sign), every telephone element and every fax element in these files was replaced with `[removed]`, as was every name given to a buyer's extra contact point (a touch point, where some buyers type a person's name), every telephone, fax or mobile number written straight after a word such as Telefon, Tel., Tél., Fax, Phone, Telefoon, Mobil or GSM, with or without a number word (Telefonnummer, Tel.-Nr.), or after a lone T: or F:, every international telephone number (a plus sign, a country code and at least eight digits) wherever it stands, and the name of a person written right before that person's own email address. The capture command made these replacements in a staging folder before this folder was written. Apart from them the files are exactly as TED published them: the element structure, deadlines and values are unchanged. Replacements can sit inside free-text descriptions and organisation names, wherever an address or a number stood.",
	'',
	'The app uses none of this contact data, the repository is meant to be public, and the GDPR asks for no more personal data than the purpose needs, so none of it is kept here. Before the staging folder was moved into `examples/`, the command ran the check that `node scripts/scrub-capture.mjs --check` runs, and it writes no folder in which that check finds contact data, a file that is not text or a link. The capture test, which uses separate patterns, fails if any file here still holds contact data.',
	'',
	'A later capture goes into its own dated folder beside this one. This folder is never captured again in place. A scrub fix is applied again from the raw notices the command keeps outside the repository.'
];

export function captureReadme(parts: ReadmeParts): string {
	return [
		`# TED capture of ${parts.captureDate}`,
		'',
		`Open IT tenders from the Netherlands, Belgium and Germany, as TED listed them on ${dayText(parts.captureDate)}. The capture command (\`npm run capture\`) wrote this folder, and the records build serves it.`,
		'',
		...whenAndWhat(parts),
		'',
		...leftOutSection(parts.leftOut),
		...notCapturedSection(parts),
		...SOURCE_AND_TERMS,
		'',
		...WHAT_WAS_CHANGED,
		''
	].join('\n');
}

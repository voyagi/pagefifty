// The words the profile page shows for field errors and the save status, from the UI-SPEC
// Copywriting Contract. Pure: times arrive already formatted, so nothing here reads a clock.
import type { FieldProblem } from './fields';
import type { ImportRefusal } from './import';
import { PROFILE_SCHEMA_VERSION } from './schema';

export type FieldError =
	| { kind: 'money' | 'staff' | 'years'; reason: FieldProblem }
	| { kind: 'certificate-date'; reason: 'not-a-date' }
	| { kind: 'certificate-name'; reason: 'empty' };

const NUMBER_ERRORS: Record<'money' | 'staff' | 'years', Record<FieldProblem, string>> = {
	money: {
		'not-a-number': 'Not a number yet. Write the whole amount in euros, like 1240000.',
		'below-zero': 'Turnover cannot be below 0. Write the whole amount in euros, like 1240000.',
		'too-long': 'That amount is too long. Write the whole amount in euros, like 1240000.'
	},
	staff: {
		'not-a-number': 'Not a whole number yet. Write the number of people, like 19.',
		'below-zero': 'Staff cannot be below 0. Write the number of people, like 19.',
		'too-long': 'That number is too long for a staff count. Write the number of people, like 19.'
	},
	years: {
		'not-a-number':
			'Not a whole number yet. Write the number of completed financial years, like 3.',
		'below-zero':
			'Completed financial years cannot be below 0. Write the number of completed financial years, like 3.',
		'too-long':
			'That number is too long for a count of years. Write the number of completed financial years, like 3.'
	}
};

function errorSentence(error: FieldError): string {
	switch (error.kind) {
		case 'certificate-date':
			return 'Not a date yet. Pick the day the certificate runs out, like 31 Mar 2027.';
		case 'certificate-name':
			return 'Name the certificate, like ISO 22301.';
		default:
			return NUMBER_ERRORS[error.kind][error.reason];
	}
}

// The field keeps its last valid value in storage while it shows an error, so the hint says what
// that value is.
export function fieldErrorText(error: FieldError, savedValue?: string): string {
	const sentence = errorSentence(error);
	return savedValue === undefined ? sentence : `${sentence} Saved value: ${savedValue}.`;
}

const MEMORY_NOTE =
	'This browser blocks storage, so the profile lasts only while this page is open. Export the file to keep it.';

// 'kept' is a profile read from storage that this view has not saved yet: it may have been imported,
// so its savedAt is never called a save in this browser. After an import the status is the
// import's own, for the same reason.
export type SaveStatus =
	| { kind: 'nothing'; inMemory: boolean }
	| { kind: 'kept'; inMemory: boolean }
	| { kind: 'saved'; time: string }
	| { kind: 'reading'; file: string }
	| { kind: 'imported'; file: string; inMemory: boolean }
	| { kind: 'not-saved'; fields: readonly string[]; rest: 'saved' | 'nothing' | 'memory' }
	| { kind: 'removed'; name: string }
	| { kind: 'failed' }
	| { kind: 'refused' }
	| { kind: 'newer'; version: number; reads: number };

function notSavedText(fields: readonly string[], rest: 'saved' | 'nothing' | 'memory'): string {
	const lead =
		fields.length === 1
			? `Not saved: ${fields[0]} needs a valid value.`
			: `Not saved: ${fields.length} fields need a valid value.`;
	if (rest === 'saved') return `${lead} The rest is saved.`;
	if (rest === 'memory') return `${lead} ${MEMORY_NOTE}`;
	return lead;
}

export function saveStatusText(status: SaveStatus): string {
	switch (status.kind) {
		case 'nothing':
			return status.inMemory ? `Nothing saved yet. ${MEMORY_NOTE}` : 'Nothing saved yet.';
		case 'kept':
			return status.inMemory ? `Kept on this page only. ${MEMORY_NOTE}` : 'Saved in this browser.';
		case 'saved':
			return `Saved in this browser at ${status.time}.`;
		case 'reading':
			return `Reading ${status.file}.`;
		case 'imported':
			return status.inMemory
				? `Imported ${status.file}. It replaced the profile on this page. ${MEMORY_NOTE}`
				: `Imported ${status.file}. It replaced the profile that was in this browser.`;
		case 'not-saved':
			return notSavedText(status.fields, status.rest);
		case 'removed':
			return `Removed ${status.name}.`;
		case 'failed':
			return 'Not saved: this browser refused to store the profile.';
		case 'refused':
			return 'Not saved: that change does not fit the profile, so nothing was changed.';
		case 'newer':
			return `This browser holds a profile saved by a newer version of Pagefifty (schemaVersion ${status.version}). This page reads schemaVersion ${status.reads}. Nothing was changed.`;
	}
}

// A refusal reads as its lead sentence, one line per field (for schema errors), and the closing
// sentence, which every refusal ends on because each one leaves storage exactly as it was.
export interface RefusalText {
	lead: string;
	fields: string[];
	closing: string;
}

const NOTHING_CHANGED = 'Nothing was changed.';
const MAX_FIELD_LINES = 20;
const MAX_FOUND_LENGTH = 60;

// Paths the phase 1 form shows under its own labels; any other path is spelled from its parts.
const FIELD_LABELS: Record<string, string> = {
	'profile.registration.country': 'Country of registration',
	'profile.completedFinancialYears': 'Completed financial years',
	'profile.staff.total': 'Total staff',
	'profile.countries': 'Countries you work in',
	'profile.languages': 'Languages your team works in',
	schemaVersion: 'schemaVersion',
	savedAt: 'Saved at',
	lastExportedAt: 'Last exported'
};

const PATH_WORDS: Record<string, string> = {
	profile: 'profile',
	registration: 'registration',
	country: 'country',
	register: 'register',
	authorisations: 'authorisations',
	name: 'name',
	reservedOperator: 'reserved operator',
	securityClearances: 'security clearances',
	level: 'level',
	completedFinancialYears: 'completed financial years',
	turnover: 'turnover',
	year: 'year',
	generalNet: 'general net turnover',
	specific: 'specific turnover',
	businessLine: 'business line',
	net: 'net turnover',
	staff: 'staff',
	total: 'total',
	byRole: 'by role',
	role: 'role',
	domain: 'domain',
	count: 'count',
	yearlyAverages: 'yearly averages',
	average: 'average',
	insurance: 'insurance',
	kind: 'kind',
	coverEuros: 'cover in euros',
	validUntil: 'valid until',
	certificates: 'certificates',
	standard: 'standard',
	scope: 'scope',
	references: 'references',
	client: 'client',
	clientType: 'client type',
	start: 'start',
	completion: 'completion',
	valueNet: 'net value',
	categories: 'categories',
	performedByFirm: 'performed by the firm',
	countries: 'countries',
	languages: 'languages'
};

// Every issue code zod 4 can raise, so no line reads as a bare code.
const PROBLEMS: Record<string, string> = {
	invalid_type: 'the value has the wrong type',
	too_big: 'the value is too large or too long',
	too_small: 'the value is too small or too short',
	invalid_format: 'the value is not in the expected format',
	not_multiple_of: 'the value is not a whole step of what is allowed',
	unrecognized_keys: 'Pagefifty does not know this field',
	invalid_union: 'the value matches none of the accepted forms',
	invalid_key: 'a key in it is not valid',
	invalid_element: 'an entry in it is not valid',
	invalid_value: 'the value is not one of the accepted values'
};

// The schema raises a custom issue only for a repeated row, on the key the row repeats.
const REPEATED: Record<string, string> = {
	year: 'the year is listed twice',
	standard: 'the certificate is listed twice'
};

function problemText(issue: FieldIssue): string {
	if (issue.problem === 'custom') {
		const last = issue.path.at(-1);
		if (typeof last === 'string' && Object.hasOwn(REPEATED, last)) return REPEATED[last];
	} else if (Object.hasOwn(PROBLEMS, issue.problem)) {
		return PROBLEMS[issue.problem];
	}
	return 'the value is not valid';
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const clip = (text: string) =>
	text.length > MAX_FOUND_LENGTH ? `${text.slice(0, MAX_FOUND_LENGTH - 3)}...` : text;

// "Turnover row 2, year" for ['profile', 'turnover', 1, 'year']; a key the schema does not know is
// named as it stands in the file ("Profile field extra0"). Both tables are read by own key only, so
// a file key such as constructor or __proto__ is never answered by what a plain object inherits.
function fieldLabel(path: readonly (string | number)[]): string {
	const joined = path.join('.');
	const known = Object.hasOwn(FIELD_LABELS, joined) ? FIELD_LABELS[joined] : undefined;
	if (known !== undefined) return known;
	const inProfile = path[0] === 'profile';
	let label = inProfile ? 'Profile' : 'File';
	let named = false;
	for (const part of inProfile ? path.slice(1) : path) {
		if (typeof part === 'number') {
			label += ` row ${part + 1}`;
			continue;
		}
		const word = Object.hasOwn(PATH_WORDS, part) ? PATH_WORDS[part] : undefined;
		if (word === undefined) {
			label += ` field ${clip(part)}`;
		} else {
			label = named ? `${label}, ${word}` : capitalise(word);
		}
		named = true;
	}
	return label;
}

function foundText(found: unknown): string {
	if (found === undefined) return 'nothing';
	return clip(JSON.stringify(found) ?? String(found));
}

type FieldIssue = NonNullable<ImportRefusal['fields']>[number];

function fieldLine(issue: FieldIssue): string {
	const problem = problemText(issue);
	const found = foundText(issue.found);
	// A clipped value already ends on its three dots; a full stop after them would read as four.
	return `${fieldLabel(issue.path)}: ${problem}. Found ${found}${found.endsWith('...') ? '' : '.'}`;
}

function refusalLead(refusal: ImportRefusal): string {
	const file = refusal.fileName;
	switch (refusal.reason) {
		case 'too-large':
			return `${file} is too large to be a profile file: it is over 256 KB, and an exported profile is a few KB. Choose a file exported from Pagefifty.`;
		case 'unreadable':
			return `This browser could not read ${file}. It may have been moved or changed after it was chosen. Choose the file again.`;
		case 'not-json':
			return `${file} is not a profile file because it is not JSON. Choose a .json file exported from Pagefifty, like pagefifty-profile-2026-09-20.json.`;
		case 'no-version':
			return `${file} has no schemaVersion, so Pagefifty cannot tell which version wrote it. Choose a file exported from Pagefifty.`;
		case 'newer-version':
			return `${file} was written by a newer version of Pagefifty (schemaVersion ${refusal.version}). This page reads schemaVersion ${PROFILE_SCHEMA_VERSION}.`;
		case 'invalid': {
			const count = refusal.fields?.length ?? 0;
			if (count === 0) {
				return `${file} was not imported because Pagefifty could not bring it up to the version this page reads. Choose a file exported from Pagefifty.`;
			}
			return count === 1
				? `${file} was not imported because 1 field is not valid:`
				: `${file} was not imported because ${count} fields are not valid:`;
		}
	}
}

export function importRefusalLines(refusal: ImportRefusal): RefusalText {
	const issues = refusal.fields ?? [];
	const fields = issues.slice(0, MAX_FIELD_LINES).map(fieldLine);
	if (issues.length > MAX_FIELD_LINES) fields.push(`and ${issues.length - MAX_FIELD_LINES} more`);
	return { lead: refusalLead(refusal), fields, closing: NOTHING_CHANGED };
}

// A file that passed every check can still be refused by the store; each answer names who refused.
export function importAppliedText(
	applied: 'failed' | 'invalid' | 'newer-version',
	file: string
): RefusalText {
	const lead = {
		failed: `${file} was read but not imported: this browser refused to store it, so its storage may be full or blocked.`,
		invalid: `${file} was read but not imported: the profile it holds does not fit this page's profile.`,
		'newer-version': `${file} was not imported: this browser holds a profile saved by a newer version of Pagefifty, and this page will not overwrite it.`
	}[applied];
	return { lead, fields: [], closing: NOTHING_CHANGED };
}

// HH:MM in the given zone, 24-hour.
export function clockTime(instant: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone
	}).format(instant);
}

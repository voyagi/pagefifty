// The words the profile page shows for field errors and the save status, from the UI-SPEC
// Copywriting Contract. Pure: times arrive already formatted, so nothing here reads a clock.
import type { FieldProblem } from './fields';

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
// so its savedAt is never called a save in this browser.
export type SaveStatus =
	| { kind: 'nothing'; inMemory: boolean }
	| { kind: 'kept'; inMemory: boolean }
	| { kind: 'saved'; time: string }
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

// HH:MM in the given zone, 24-hour.
export function clockTime(instant: Date, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone
	}).format(instant);
}

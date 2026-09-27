import { canonicalStoredJson } from './canonical';
import type { StoredProfile } from './schema';

// A download started from the same task that revokes its URL can be cancelled in some browsers,
// so the URL is kept for a while; one small blob held a little longer costs nothing.
const REVOKE_AFTER_MS = 30_000;

const twoDigits = (value: number) => String(value).padStart(2, '0');

// The calendar day on this device, YYYY-MM-DD. toISOString would give the UTC day, which is the
// day before for a Dutch user exporting just after midnight.
export function localIsoDay(date: Date): string {
	return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

export function exportFileName(localDate: Date): string {
	return `pagefifty-profile-${localIsoDay(localDate)}.json`;
}

// When this browser last exported is local metadata, not part of the portable profile. Keeping it
// would make the second export of an unchanged profile differ from the first, once the first
// export has stamped it.
export function exportProfileJson(stored: StoredProfile): string {
	return canonicalStoredJson({ ...stored, lastExportedAt: null });
}

export function downloadProfile(
	stored: StoredProfile,
	now: Date,
	doc: Document = document
): string {
	const name = exportFileName(now);
	const url = URL.createObjectURL(
		new Blob([exportProfileJson(stored)], { type: 'application/json' })
	);
	const link = doc.createElement('a');
	link.href = url;
	link.download = name;
	doc.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
	return name;
}

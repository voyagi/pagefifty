// Values the profile form shows but never stores: which turnover years it asks for, their average
// and whether a certificate has run out.
import { localIsoDay } from './export';
import type { Profile } from './schema';

export type CertificateStatus =
	{ state: 'undated' } | { state: 'valid'; until: string } | { state: 'expired'; on: string };

// Rows are keyed by the year a financial year ends, and the form offers the three before this one.
export function turnoverYears(today: Date): [number, number, number] {
	const year = today.getFullYear();
	return [year - 3, year - 2, year - 1];
}

// Shown only when every year asked for holds a figure; 0 is a figure, a missing one is unknown.
export function averageTurnover(
	profile: Pick<Profile, 'turnover'>,
	years: readonly number[]
): number | undefined {
	if (years.length === 0) return undefined;
	let total = 0;
	for (const year of years) {
		const figure = profile.turnover.find((row) => row.year === year)?.generalNet;
		if (figure === undefined) return undefined;
		total += figure;
	}
	return total / years.length;
}

// A certificate past its date stays in the profile, marked expired on that date. It holds through
// the whole of its last day, compared on this device's calendar.
export function certificateStatus(
	certificate: Profile['certificates'][number],
	today: Date
): CertificateStatus {
	const until = certificate.validUntil;
	if (until === undefined) return { state: 'undated' };
	return until < localIsoDay(today) ? { state: 'expired', on: until } : { state: 'valid', until };
}

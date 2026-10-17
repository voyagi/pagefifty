// Which kept notices a failed download makes stale: TED's search names each hit's notice identifier
// (BT-701) and version (BT-757), so a notice whose XML failed can still say it replaced one the run
// read. Imported by scripts/capture.mjs under Node type stripping: erasable syntax only.
import type { SearchHit } from './ted-search.ts';

interface HitVersion {
	id: string;
	version: number;
}

interface KeptVersion {
	noticeNumber: string;
	notice: { id: string; version: string };
}

interface FailedHit {
	notice: string;
	hit: SearchHit;
}

// TED's schema types the version as an int32, and the records carry the published digit string, so
// both read as an integer; anything else is no version, and then nothing is compared.
function versionNumber(value: unknown): number | undefined {
	if (typeof value === 'number')
		return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
	return typeof value === 'string' && /^\d+$/.test(value) ? Number.parseInt(value, 10) : undefined;
}

export function hitVersion(hit: SearchHit): HitVersion | undefined {
	const id = hit['notice-identifier'];
	const version = versionNumber(hit['notice-version']);
	return typeof id === 'string' && id !== '' && version !== undefined ? { id, version } : undefined;
}

export function outdatedByFailed(
	kept: readonly KeptVersion[],
	failed: readonly FailedHit[]
): { notice: string; reason: string }[] {
	const newest = new Map<string, { notice: string; version: number }>();
	for (const { notice, hit } of failed) {
		const named = hitVersion(hit);
		if (named === undefined) continue;
		const current = newest.get(named.id);
		if (current === undefined || named.version > current.version) {
			newest.set(named.id, { notice, version: named.version });
		}
	}
	return kept.flatMap((record) => {
		const failedNewer = newest.get(record.notice.id);
		if (failedNewer === undefined) return [];
		if (failedNewer.version <= Number.parseInt(record.notice.version, 10)) return [];
		const reason = `a newer version (${failedNewer.notice}, version ${failedNewer.version}) failed`;
		return [{ notice: record.noticeNumber, reason }];
	});
}

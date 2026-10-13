// Which of one run's notices a capture lists: the latest version of each notice only. The records
// build and the capture command both call selectLatest, so the rule exists once.
// Imported by scripts/build-records.mjs under Node type stripping: erasable syntax only and
// relative imports with their .ts extension.
import type { NoticeRecord } from './record.ts';

interface LeftOut {
	notice: string;
	reason: string;
}

interface Selection {
	kept: NoticeRecord[];
	leftOut: LeftOut[];
	sameProcedure: string[][];
}

// A number reaching here passed NOTICE_NUMBER, so it is "<running number>-<year>".
function publicationKey(noticeNumber: string): [year: number, running: number] {
	const [running, year] = noticeNumber.split('-').map(Number);
	return [year, running];
}

function byPublication(a: NoticeRecord, b: NoticeRecord): number {
	const [yearA, runningA] = publicationKey(a.noticeNumber);
	const [yearB, runningB] = publicationKey(b.noticeNumber);
	return yearA - yearB || runningA - runningB;
}

const versionOf = (record: NoticeRecord) => Number.parseInt(record.notice.version, 10);

function latestById(ordered: readonly NoticeRecord[]): Map<string, NoticeRecord> {
	const latest = new Map<string, NoticeRecord>();
	for (const record of ordered) {
		const current = latest.get(record.notice.id);
		if (current === undefined || versionOf(record) > versionOf(current)) {
			latest.set(record.notice.id, record);
		}
	}
	return latest;
}

// TED's onlyLatestVersions flag returned both versions of notice ad28f539 in the 2026-09-15
// capture (600367-2026 and 601147-2026), so the rule decides from the notices themselves.
export function selectLatest(records: readonly NoticeRecord[]): Selection {
	const ordered = [...records].sort(byPublication);
	const latest = latestById(ordered);
	const kept: NoticeRecord[] = [];
	const leftOut: LeftOut[] = [];
	for (const record of ordered) {
		const winner = latest.get(record.notice.id) ?? record;
		if (winner === record) kept.push(record);
		else
			leftOut.push({ notice: record.noticeNumber, reason: `superseded by ${winner.noticeNumber}` });
	}
	return { kept, leftOut, sameProcedure: [] };
}

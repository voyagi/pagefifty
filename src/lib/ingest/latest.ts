// Which of one run's notices a capture lists: the latest version of each notice, never one a later
// notice replaced, and never one TED marks cancelled. The records build and the capture command
// both call selectLatest, so the rule exists once.
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

// How a change notice names this version (BT-758). Compared whole, since the identifier is a UUID
// whose own hyphens make any split ambiguous.
const linkOf = (record: NoticeRecord) => `${record.notice.id}-${record.notice.version}`;

// Walking in publication order, a later record of an equal version replaces the earlier one, so of
// two duplicates the higher publication number wins.
function winnersById(ordered: readonly NoticeRecord[]): Map<string, NoticeRecord> {
	const winners = new Map<string, NoticeRecord>();
	for (const record of ordered) {
		const current = winners.get(record.notice.id);
		if (current === undefined || versionOf(record) >= versionOf(current)) {
			winners.set(record.notice.id, record);
		}
	}
	return winners;
}

// Built from every record the run read, kept or not. D-16 says "another kept notice", but read
// that way a cancelling change notice, itself left out, would leave its predecessor listed as an
// open tender, which DATA-02 forbids.
function successorsByLink(ordered: readonly NoticeRecord[]): Map<string, NoticeRecord> {
	const successors = new Map<string, NoticeRecord>();
	for (const record of ordered) {
		for (const change of record.notice.changes) {
			if (change !== linkOf(record)) successors.set(change, record);
		}
	}
	return successors;
}

function reasonLeftOut(
	record: NoticeRecord,
	winners: ReadonlyMap<string, NoticeRecord>,
	successors: ReadonlyMap<string, NoticeRecord>
): string | undefined {
	const winner = winners.get(record.notice.id) ?? record;
	if (versionOf(winner) > versionOf(record)) return `superseded by ${winner.noticeNumber}`;
	const successor = successors.get(linkOf(record));
	if (successor !== undefined) return `superseded by ${successor.noticeNumber}`;
	if (winner !== record) return `duplicate of ${winner.noticeNumber}`;
	return record.changeReasons.includes('cancel') ? 'cancelled' : undefined;
}

function sharedProcedures(kept: readonly NoticeRecord[]): string[][] {
	const byProcedure = new Map<string, string[]>();
	for (const record of kept) {
		const group = byProcedure.get(record.notice.procedure) ?? [];
		group.push(record.noticeNumber);
		byProcedure.set(record.notice.procedure, group);
	}
	return [...byProcedure.values()].filter((group) => group.length > 1);
}

// TED's onlyLatestVersions flag returned both versions of notice ad28f539 in the 2026-09-15
// capture (600367-2026 and 601147-2026), so the rule decides from the notices themselves.
export function selectLatest(records: readonly NoticeRecord[]): Selection {
	const ordered = [...records].sort(byPublication);
	const winners = winnersById(ordered);
	const successors = successorsByLink(ordered);
	const kept: NoticeRecord[] = [];
	const leftOut: LeftOut[] = [];
	for (const record of ordered) {
		const reason = reasonLeftOut(record, winners, successors);
		if (reason === undefined) kept.push(record);
		else leftOut.push({ notice: record.noticeNumber, reason });
	}
	return { kept, leftOut, sameProcedure: sharedProcedures(kept) };
}

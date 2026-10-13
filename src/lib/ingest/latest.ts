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

const versionKey = (id: string, version: string) => `${id}#${Number.parseInt(version, 10)}`;

const keyOf = (record: NoticeRecord) => versionKey(record.notice.id, record.notice.version);

// TED's eForms schema gives a change link (BT-758) two forms: "<identifier>-<VersionID>" under
// schemeName notice-id-ref, or the changed notice's publication number padded to eight digits,
// "XXXXXXXX-YYYY", under ojs-notice-id. Most links in the capture carry no schemeName, so the form
// is read from the text. An identifier is a UUID, four hyphens of its own, so a link of digits, one
// hyphen and a four-digit year can only be a publication number.
const PUBLICATION_LINK = /^(\d{1,8})-(\d{4})$/;

// A publication number names whichever notice of the run was published under it, and stands for
// that notice's own version, so the rest of the rule treats both forms alike. A number outside the
// run names nothing here.
function publishedKey(
	running: string,
	year: string,
	published: ReadonlyMap<string, NoticeRecord>
): string | undefined {
	const named = published.get(`${Number.parseInt(running, 10)}-${year}`);
	return named === undefined ? undefined : keyOf(named);
}

// In the identifier form, the identifier's own hyphens never matter: the version is the digits after
// the last hyphen, read as an integer like every other version here, so "-1" and "-01" name the same
// version. A link with no digits there names no version a record can hold (the reader refuses such
// a VersionID).
function linkKey(change: string, published: ReadonlyMap<string, NoticeRecord>): string | undefined {
	const publication = PUBLICATION_LINK.exec(change);
	if (publication !== null) return publishedKey(publication[1], publication[2], published);
	const at = change.lastIndexOf('-');
	const version = change.slice(at + 1);
	return at > 0 && /^\d+$/.test(version) ? versionKey(change.slice(0, at), version) : undefined;
}

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
	const published = new Map(ordered.map((record) => [record.noticeNumber, record]));
	const successors = new Map<string, NoticeRecord>();
	for (const record of ordered) {
		for (const change of record.notice.changes) {
			const key = linkKey(change, published);
			if (key !== undefined && key !== keyOf(record)) successors.set(key, record);
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
	const successor = successors.get(keyOf(record));
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

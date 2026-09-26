// One row per notice for the list, and the schema the server parses the built index with.
// Imported by scripts/build-records.mjs under Node type stripping: erasable syntax only.
import { z } from 'zod';
import type { Buyer, LangText, LotDeadlines, LotRecord, NoticeRecord } from '../ingest/record.ts';

// Each part is typed with the record type it reads back, so the schema and the record the build
// writes cannot drift apart without a type error.
const LangTextSchema: z.ZodType<LangText> = z.strictObject({
	text: z.string(),
	lang: z.string().optional(),
	rawLang: z.string().optional()
});

const DEADLINE = z.iso.datetime({ offset: true });

const DeadlinesSchema: z.ZodType<LotDeadlines> = z.strictObject({
	request: DEADLINE.optional(),
	tender: DEADLINE.optional()
});

const BuyerSchema: z.ZodType<Buyer> = z.strictObject({ name: LangTextSchema, country: z.string() });

const LotRowSchema: z.ZodType<Pick<LotRecord, 'id' | 'deadlines'>> = z.strictObject({
	id: z.string(),
	deadlines: DeadlinesSchema
});

// A notice number as TED's site and search API write it: the running number of the year without
// the zero padding its XML carries, then the year. It has five digits in January ("12345-2025"
// was published on 9 January 2025) and six by September ("609955-2026"); the XML pads it to eight.
// The build refuses a listing number of any other shape, so every record it writes can be served.
export const NOTICE_NUMBER = /^[1-9]\d{0,7}-\d{4}$/;

// Strict objects: a field the build writes and this schema does not name fails the load loudly
// instead of being dropped from the page.
const IndexRowSchema = z.strictObject({
	noticeNumber: z.string().regex(NOTICE_NUMBER),
	title: LangTextSchema,
	buyers: z.array(BuyerSchema),
	lots: z.array(LotRowSchema)
});

export const SnapshotIndexSchema = z.strictObject({
	capture: z.strictObject({
		id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		fetchedAt: z.iso.datetime(),
		total: z.number().int().nonnegative(),
		query: z.string()
	}),
	rows: z.array(IndexRowSchema)
});

export type IndexRow = z.infer<typeof IndexRowSchema>;
export type SnapshotIndex = z.infer<typeof SnapshotIndexSchema>;

export function toIndexRow(record: NoticeRecord): IndexRow {
	return {
		noticeNumber: record.noticeNumber,
		title: record.title,
		buyers: record.buyers,
		lots: record.lots.map(({ id, deadlines }) => ({ id, deadlines }))
	};
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The capture's day as the buyers in scope count it (Central European Time), written "15 Sep 2026".
// Month names come from this table, because en-GB formatting now writes September as "Sept".
export function captureDay(fetchedAt: string): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Amsterdam',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric'
	}).formatToParts(new Date(fetchedAt));
	const part = (type: string) => Number(parts.find((each) => each.type === type)?.value);
	return `${part('day')} ${MONTHS[part('month') - 1]} ${part('year')}`;
}

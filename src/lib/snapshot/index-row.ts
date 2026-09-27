// One row per notice for the list, and the schemas the build checks and the server parses the
// built index and records with.
// Imported by scripts/build-records.mjs under Node type stripping: erasable syntax only.
import { z } from 'zod';
import type {
	Amount,
	Buyer,
	Criterion,
	CriterionParameter,
	DocumentsLink,
	GroupLegalForm,
	LangText,
	LegislationReference,
	LotDeadlines,
	LotRecord,
	NoticeRecord
} from '../ingest/record.ts';

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

// Values are strings as published; a number here means something parsed a notice value.
const AmountSchema: z.ZodType<Amount> = z.strictObject({
	amount: z.string(),
	currency: z.string()
});

const DocumentsLinkSchema: z.ZodType<DocumentsLink> = z.strictObject({
	published: z.string(),
	href: z.string().optional(),
	restricted: z.literal(true).optional()
});

const ParameterSchema: z.ZodType<CriterionParameter> = z.strictObject({
	listName: z.string().optional(),
	code: z.string(),
	value: z.string()
});

const CriterionSchema: z.ZodType<Criterion> = z.strictObject({
	code: z.string(),
	descriptions: z.array(LangTextSchema),
	parameters: z.array(ParameterSchema)
});

const GroupLegalFormSchema: z.ZodType<GroupLegalForm> = z.strictObject({
	required: z.string(),
	description: LangTextSchema.optional()
});

const LegislationSchema: z.ZodType<LegislationReference> = z.strictObject({
	id: z.string(),
	description: LangTextSchema.optional()
});

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
	country: z.array(z.string()),
	cpvCodes: z.array(z.string()),
	estimatedValue: AmountSchema.optional(),
	lots: z.array(LotRowSchema)
});

const LotRecordSchema: z.ZodType<LotRecord> = z.strictObject({
	id: z.string(),
	title: LangTextSchema.optional(),
	deadlines: DeadlinesSchema,
	criteria: z.array(CriterionSchema),
	criteriaSources: z.array(z.string()),
	reserved: z.string().optional(),
	notes: z.array(LangTextSchema),
	groupLegalForm: GroupLegalFormSchema.optional(),
	estimatedValue: AmountSchema.optional(),
	documents: DocumentsLinkSchema.optional()
});

export const NoticeRecordSchema: z.ZodType<NoticeRecord> = z.strictObject({
	noticeNumber: z.string().regex(NOTICE_NUMBER),
	sdkVersion: z.string(),
	noticeSubtype: z.string(),
	legalBasis: z.string(),
	nationalLegislation: z.array(LegislationSchema),
	title: LangTextSchema,
	buyers: z.array(BuyerSchema),
	procedureNotes: z.array(LangTextSchema),
	estimatedValue: AmountSchema.optional(),
	cpv: z.strictObject({ main: z.array(z.string()), additional: z.array(z.string()) }),
	documents: DocumentsLinkSchema.optional(),
	changeReasons: z.array(z.string()),
	lots: z.array(LotRecordSchema)
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

const unique = (values: string[]) => [...new Set(values)];

// The card's value is the procedure's (D-09). A notice with one lot may publish it on that lot
// only, and then the lot is the whole procedure; values on several lots can overlap, so they are
// never summed or picked into the card's one value.
function cardValue(record: NoticeRecord): Amount | undefined {
	if (record.estimatedValue) return record.estimatedValue;
	return record.lots.length === 1 ? record.lots[0].estimatedValue : undefined;
}

// The list filters on country and CPV group from any main or additional code (research Pitfall 4:
// a main CPV can sit outside the IT groups while an additional one is inside).
export function toIndexRow(record: NoticeRecord): IndexRow {
	const estimatedValue = cardValue(record);
	return {
		noticeNumber: record.noticeNumber,
		title: record.title,
		buyers: record.buyers,
		country: unique(record.buyers.map((buyer) => buyer.country)),
		cpvCodes: unique([...record.cpv.main, ...record.cpv.additional]),
		...(estimatedValue && { estimatedValue }),
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

// One row per notice for the list, and the schemas the build checks and the server parses the
// built index and records with.
// Imported by scripts/build-records.mjs under Node type stripping: erasable syntax only.
import { z } from 'zod';
import { summarizeLot, type LotCoverageInput } from '../core/coverage-facts.ts';
import {
	VERSION_ID,
	type Amount,
	type Buyer,
	type Criterion,
	type CriterionParameter,
	type DocumentsLink,
	type GroupLegalForm,
	type LangText,
	type LegislationReference,
	type LotDeadlines,
	type LotRecord,
	type NoticeIdentity,
	type NoticeRecord
} from '../ingest/record.ts';
import { isCaptureId, namesRealFirstDay } from './capture-id.ts';

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
	parameters: z.array(ParameterSchema),
	pointsToDocuments: z.boolean()
});

const GroupLegalFormSchema: z.ZodType<GroupLegalForm> = z.strictObject({
	required: z.string(),
	description: LangTextSchema.optional()
});

const LegislationSchema: z.ZodType<LegislationReference> = z.strictObject({
	id: z.string(),
	description: LangTextSchema.optional()
});

const LotCoverageSchema: z.ZodType<LotCoverageInput> = z.strictObject({
	criteriaCount: z.number().int().nonnegative(),
	sources: z.array(z.string()),
	pointsToDocuments: z.boolean()
});

type LotRow = Pick<LotRecord, 'id' | 'deadlines'> & { coverage: LotCoverageInput };

const LotRowSchema: z.ZodType<LotRow> = z.strictObject({
	id: z.string(),
	deadlines: DeadlinesSchema,
	coverage: LotCoverageSchema
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
	cancelIntent: z.literal(true).optional(),
	// The build refuses a notice with no lot, so an empty list means a damaged file.
	lots: z.array(LotRowSchema).min(1)
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

const NoticeIdentitySchema: z.ZodType<NoticeIdentity> = z.strictObject({
	id: z.string().min(1),
	version: z.string().regex(VERSION_ID),
	procedure: z.string().min(1),
	changes: z.array(z.string())
});

export const NoticeRecordSchema: z.ZodType<NoticeRecord> = z.strictObject({
	noticeNumber: z.string().regex(NOTICE_NUMBER),
	notice: NoticeIdentitySchema,
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
	cancelIntent: z.literal(true).optional(),
	lots: z.array(LotRecordSchema).min(1)
});

// The build also writes this line on its own, as capture.json beside the index, so a 404 can name
// the snapshot's days without reading the index.
export const CaptureLineSchema = z.strictObject({
	id: z.string().refine(isCaptureId, { error: 'a capture is named by a calendar day, YYYY-MM-DD' }),
	fetchedAt: z.iso.datetime(),
	// The count TED stated for its search, never the number of rows: rows leave out leftOut, so
	// the 2026-09-15 capture states 363 and serves 362. The entry page quotes it as TED's count.
	total: z.number().int().nonnegative(),
	query: z.string().refine(namesRealFirstDay, {
		error: 'its publication-date>= names no calendar day as one YYYYMMDD clause'
	}),
	// Only a capture made with --open-after has one: every lot it holds closes after this instant.
	openAfter: z.iso.datetime({ offset: true }).optional()
});

export const SnapshotIndexSchema = z.strictObject({
	capture: CaptureLineSchema,
	// Listed notices the active and latest rule kept off the list, each with its reason. Required,
	// so an index built before the rule existed fails the load instead of serving a replaced version.
	leftOut: z.array(
		z.strictObject({ notice: z.string().regex(NOTICE_NUMBER), reason: z.string().min(1) })
	),
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
		...(record.cancelIntent && { cancelIntent: record.cancelIntent }),
		lots: record.lots.map((lot) => ({
			id: lot.id,
			deadlines: lot.deadlines,
			coverage: summarizeLot(lot)
		}))
	};
}

// One writer of the capture's day for the pages and the tests, kept where the browser can import it.
export { captureDay } from './capture-id.ts';

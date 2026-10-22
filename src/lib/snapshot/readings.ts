// The model's readings as a capture publishes them (readings.json) and the reply schema they are
// validated with. The capture command writes them, the site reads them, and neither side may
// describe an item a second way: the item schema is checked against core's ModelItem by the type
// checker. Imported by the capture command under Node type stripping: erasable syntax only.
import { z } from 'zod';
import type { ModelItem, NoticeReadingsLike } from '../core/lot-reading.ts';

// Spike 004's schema, in its order: the request and the recorded replies use exactly these.
export const READING_KINDS = [
	'turnover-general',
	'turnover-specific',
	'staff-count',
	'references',
	'certificate',
	'insurance',
	'registration',
	'points-to-documents',
	'other'
] as const;

// Every key of ModelItem and no other, each field's output assignable to ModelItem's: the satisfies
// clause fails the type check on a field either side lacks. ModelItem keeps kind a plain string,
// since core only ever uses a model kind to withhold a comparison. No minimum quote length here: a
// short quote rejects its one requirement in the quote check, never the whole reply.
const replyItemShape = {
	criterion: z.int().min(1),
	kind: z.enum(READING_KINDS),
	quote: z.string(),
	reading: z.string(),
	numberText: z.string(),
	period: z.string(),
	mandatory: z.boolean()
} satisfies { [Key in keyof ModelItem]-?: z.ZodType<ModelItem[Key]> };

export const ReplyItemSchema = z.strictObject(replyItemShape);

export const ReplySchema = z.strictObject({ requirements: z.array(ReplyItemSchema) });

const count = z.int().nonnegative();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export const ReadingRunSchema = z.strictObject({
	model: z.string(),
	provider: z.string(),
	region: z.string(),
	thinking: z.boolean(),
	runDate: z.string().regex(DAY),
	prices: z.strictObject({
		inputUsdPerMillion: z.string(),
		outputUsdPerMillion: z.string(),
		listedOn: z.string().regex(DAY)
	}),
	lots: z.strictObject({ withCriteria: count, read: count, reused: count, notRead: count }),
	sends: count,
	tokens: z.strictObject({ input: count, output: count, reasoning: count }),
	costUsd: z.string().regex(/^\d+\.\d{6}$/),
	quotes: z.strictObject({ verified: count, rejected: count })
});

export const NOT_READ_REASONS = [
	'dry-run',
	'cap-reached',
	'reply-invalid',
	'send-failed',
	'outside-the-run'
] as const;

const LotEntrySchema = z.discriminatedUnion('status', [
	z.strictObject({
		lot: z.string(),
		status: z.literal('read'),
		textSha256: z.string().regex(SHA256)
	}),
	z.strictObject({ lot: z.string(), status: z.literal('no-criteria') }),
	z.strictObject({
		lot: z.string(),
		status: z.literal('not-read'),
		reason: z.enum(NOT_READ_REASONS)
	})
]);

export const ReadingEntrySchema = z.strictObject({
	notice: z.string(),
	textSha256: z.string().regex(SHA256),
	promptSha256: z.string().regex(SHA256),
	model: z.string(),
	readOn: z.string().regex(DAY),
	responseId: z.string(),
	usage: z.strictObject({ input: count, output: count, reasoning: count }),
	items: z.array(ReplyItemSchema)
});

export const ReadingsFileSchema = z.strictObject({
	schemaVersion: z.literal(1),
	run: ReadingRunSchema,
	notices: z.array(z.strictObject({ notice: z.string(), lots: z.array(LotEntrySchema) })),
	readings: z.array(ReadingEntrySchema)
});

// One notice's slice of a ReadingsFile, as the records build writes it for the page to load. The
// satisfies clause fails the type check if core's lotStatusOf could be handed a shape it does not
// describe.
export const NoticeReadingsSchema = z.strictObject({
	notice: z.string(),
	lots: z.array(LotEntrySchema),
	readings: z.array(ReadingEntrySchema)
}) satisfies z.ZodType<NoticeReadingsLike>;

// The notices of a capture the model read at least one lot of, as the records build writes them.
export const ReadNoticesSchema = z.array(z.string());

export type ReplyItem = z.infer<typeof ReplyItemSchema>;
export type ReadingRun = z.infer<typeof ReadingRunSchema>;
export type ReadingEntry = z.infer<typeof ReadingEntrySchema>;
export type LotEntry = z.infer<typeof LotEntrySchema>;
export type ReadingsFile = z.infer<typeof ReadingsFileSchema>;
export type NoticeReadings = z.infer<typeof NoticeReadingsSchema>;

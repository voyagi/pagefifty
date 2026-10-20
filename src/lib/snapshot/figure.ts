// The home page's figure as a capture publishes it (examples/{capture}/figure.json), written by
// scripts/figure.mjs from the capture's built readings and never by hand, and the one field of the
// capture's run.json the figure quotes. Imported by scripts under Node type stripping: erasable syntax
// only.
import { z } from 'zod';
import { CAPTURE_ID } from './capture-id.ts';

const count = z.int().nonnegative();

export const FigureFileSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		capture: z.string().regex(CAPTURE_ID),
		population: count,
		counts: z.strictObject({ go: count, partnerNeeded: count, noGo: count, askFirst: count }),
		firm: z.literal('demo'),
		capturedOn: z.string().regex(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/),
		costUsd: z.string().regex(/^\d+\.\d{6}$/),
		command: z.string().min(1).nullable(),
		lotRule: z.literal('most-lenient-lot'),
		runs: z.literal(1)
	})
	.refine(
		({ population, counts }) =>
			counts.go + counts.partnerNeeded + counts.noGo + counts.askFirst === population,
		{ error: 'the four counts do not sum to the population', path: ['counts'] }
	);

// run.json has no schema in src beyond what the command writes; the figure reads its command and
// nothing else, so every other key is left to the command's own tests.
export const RunCommandSchema = z.object({ command: z.string().min(1) });

export type FigureFile = z.infer<typeof FigureFileSchema>;

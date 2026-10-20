// Figure files for the home figure tests. EXAMPLE_FIGURE is what scripts/figure.mjs writes for the
// 2026-09-15 example (generated-folders.test.ts runs the script and compares): every notice there
// counts as ask first, so it cannot show a count in the wrong place. SPREAD_FIGURE gives every
// number its own value for that.
import { FigureFileSchema, type FigureFile } from '$lib/snapshot/figure';

export const EXAMPLE_FIGURE: FigureFile = FigureFileSchema.parse({
	schemaVersion: 1,
	capture: '2026-09-15',
	population: 362,
	counts: { go: 0, partnerNeeded: 0, noGo: 0, askFirst: 362 },
	firm: 'demo',
	capturedOn: '15 Sep 2026',
	costUsd: '0.003150',
	command: null,
	lotRule: 'most-lenient-lot',
	runs: 1
});

export const SPREAD_FIGURE: FigureFile = FigureFileSchema.parse({
	schemaVersion: 1,
	capture: '2026-10-21',
	population: 40,
	counts: { go: 7, partnerNeeded: 5, noGo: 3, askFirst: 25 },
	firm: 'demo',
	capturedOn: '21 Oct 2026',
	costUsd: '0.041260',
	command: 'node scripts/capture.mjs --live --cap 400',
	lotRule: 'most-lenient-lot',
	runs: 1
});

export const COUNT_KEYS = ['go', 'partnerNeeded', 'noGo', 'askFirst'] as const;

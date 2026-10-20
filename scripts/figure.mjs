#!/usr/bin/env node
// figure.mjs - writes examples/<capture>/figure.json, the figure the home page states for a capture
// the model read: of the notices it serves, how many the demo firm meets alone, needs a partner for,
// is out of regardless, and cannot read or must ask first, each notice under its most lenient lot.
//
// It reads the capture's records build (index, records, readings, reading run), decides every lot
// with the tender page's own rules from src (figureOf, at the capture instant, for DEMO_PROFILE), and
// takes the inference cost from the reading run and the command from the capture folder's own
// run.json, never from .capture-cache/runs, so a refused second run of the day changes nothing here.
// A capture with no run.json gets a null command, which the page words as a one-off read. The
// capture command never computes the figure: it may not reach the profile.
//
// Usage:  node scripts/figure.mjs <capture> [--check] [--examples <dir>] [--generated <dir>]
//         (defaults: examples and src/lib/snapshot/generated beside this script's repository;
//         run node scripts/build-records.mjs first, which npm run dev, build and test each do)
//         --check writes nothing and compares the capture's figure.json with the figure its
//         readings give.
// Exit codes: 0 figure.json written, or with --check, figure.json matches,
//             1 a built file or the capture's run.json does not match its schema, the write failed,
//               or with --check, figure.json differs,
//             2 bad usage, no built records for the capture, a capture with no reading run, or with
//               --check, no figure.json.

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { figureOf } from '../src/lib/core/figure.ts';
import { DEMO_PROFILE } from '../src/lib/profile/demo-firm.ts';
import { captureDay, isCaptureId } from '../src/lib/snapshot/capture-id.ts';
import { FigureFileSchema, RunCommandSchema } from '../src/lib/snapshot/figure.ts';
import { NoticeRecordSchema, SnapshotIndexSchema } from '../src/lib/snapshot/index-row.ts';
import { NoticeReadingsSchema, ReadingRunSchema } from '../src/lib/snapshot/readings.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

class FigureError extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

function parseArgs(argv) {
	const [capture, ...flags] = argv;
	if (capture === undefined || !isCaptureId(capture)) {
		throw new FigureError(
			2,
			`the first argument must be a capture day, YYYY-MM-DD; got ${JSON.stringify(capture ?? '')}`
		);
	}
	const options = {
		capture,
		examples: join(repository, 'examples'),
		generated: join(repository, 'src', 'lib', 'snapshot', 'generated'),
		check: false
	};
	for (let index = 0; index < flags.length; index += 1) {
		const [flag, value] = [flags[index], flags[index + 1]];
		if (flag === '--check' && !options.check) {
			options.check = true;
			continue;
		}
		if ((flag !== '--examples' && flag !== '--generated') || !value) {
			throw new FigureError(
				2,
				`unknown or incomplete argument ${flag}; see the usage in this file`
			);
		}
		options[flag.slice(2)] = resolve(value);
		index += 1;
	}
	return options;
}

function readChecked(path, schema) {
	let json;
	try {
		json = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		throw new FigureError(1, `${path} could not be read as JSON: ${error.message}`);
	}
	const parsed = schema.safeParse(json);
	if (!parsed.success) {
		throw new FigureError(1, `${path} does not match its schema: ${parsed.error.message}`);
	}
	return parsed.data;
}

function servedNotices(built, index) {
	return index.rows.map(({ noticeNumber }) => {
		const record = readChecked(join(built, 'records', `${noticeNumber}.json`), NoticeRecordSchema);
		const readingsPath = join(built, 'readings', `${noticeNumber}.json`);
		return existsSync(readingsPath)
			? { record, readings: readChecked(readingsPath, NoticeReadingsSchema) }
			: { record };
	});
}

function commandOf(folder) {
	const path = join(folder, 'run.json');
	return existsSync(path) ? readChecked(path, RunCommandSchema).command : null;
}

function figureFileOf({ capture, examples, generated }) {
	const built = join(generated, capture);
	if (!existsSync(join(built, 'index.json'))) {
		throw new FigureError(
			2,
			`no built records for capture ${capture} under ${generated}: run node scripts/build-records.mjs first`
		);
	}
	if (!existsSync(join(examples, capture))) {
		throw new FigureError(
			2,
			`no capture folder ${join(examples, capture)} to write the figure into`
		);
	}
	const runPath = join(built, 'reading-run.json');
	if (!existsSync(runPath)) {
		throw new FigureError(
			2,
			`capture ${capture} holds no reading run: the model read none of its notices, so it has no figure`
		);
	}
	const index = readChecked(join(built, 'index.json'), SnapshotIndexSchema);
	const run = readChecked(runPath, ReadingRunSchema);
	const { fetchedAt } = index.capture;
	const { population, go, partnerNeeded, noGo, askFirst } = figureOf(
		servedNotices(built, index),
		DEMO_PROFILE,
		new Date(fetchedAt).toISOString()
	);
	const file = {
		schemaVersion: 1,
		capture,
		population,
		counts: { go, partnerNeeded, noGo, askFirst },
		firm: 'demo',
		capturedOn: captureDay(fetchedAt),
		costUsd: run.costUsd,
		command: commandOf(join(examples, capture)),
		lotRule: 'most-lenient-lot',
		runs: 1
	};
	const checked = FigureFileSchema.safeParse(file);
	if (!checked.success) {
		throw new FigureError(
			1,
			`the figure of ${capture} does not match its schema: ${checked.error.message}`
		);
	}
	return checked.data;
}

// Through a temp name and a rename, so a failed write never leaves half a figure for the build.
function writeFigure(folder, figure) {
	const target = join(folder, 'figure.json');
	const temp = join(folder, `.figure-${process.pid}.json`);
	try {
		writeFileSync(temp, `${JSON.stringify(figure, null, 2)}\n`);
		renameSync(temp, target);
	} catch (error) {
		rmSync(temp, { force: true });
		throw new FigureError(1, `could not write ${target}: ${error.message}`);
	}
	return target;
}

// The committed file must be exactly what the readings give today, byte for byte, so a figure typed
// or edited by hand, or left over from readings that changed since, fails here and in the tests.
function checkFigure(folder, figure) {
	const target = join(folder, 'figure.json');
	if (!existsSync(target)) throw new FigureError(2, `${figure.capture}: no ${target} to check`);
	if (readFileSync(target, 'utf8') !== `${JSON.stringify(figure, null, 2)}\n`) {
		throw new FigureError(
			1,
			`${figure.capture}: ${target} differs from the figure its readings give; node scripts/figure.mjs ${figure.capture} writes it again`
		);
	}
	console.log(`figure: ${figure.capture}: ${target} matches its readings`);
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const figure = figureFileOf(options);
	const folder = join(options.examples, options.capture);
	if (options.check) {
		checkFigure(folder, figure);
		return;
	}
	const target = writeFigure(folder, figure);
	const { go, partnerNeeded, noGo, askFirst } = figure.counts;
	console.log(
		`figure: ${figure.capture}: ${figure.population} notices, go ${go}, partner needed ${partnerNeeded}, no-go ${noGo}, ask first ${askFirst}; written to ${target}`
	);
}

try {
	main();
} catch (error) {
	console.error(`figure: ${error.message}`);
	process.exit(error instanceof FigureError ? error.code : 1);
}

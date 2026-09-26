#!/usr/bin/env node
// build-records.mjs - turns every tracked capture under examples/<capture date>/ into the records
// the pages read, so no notice XML is parsed while a page is served.
//
// For each examples/<YYYY-MM-DD>/ holding a notices.json, the capture's xml/ files become the
// recorded responses of a snapshot transport, keyed by the TED address each was fetched from, and
// every notice the listing names is read through that transport and the one notice reader
// (src/lib/ingest/read-notice.ts). The result is <out>/<capture date>/index.json (one row per
// notice) and records/<notice>.json, written compact into a temp folder and moved into place only
// when every notice of every capture was read. This script is a thin caller: the reading rules
// live in src, where the import rules and tests see them.
//
// Runs as predev, prebuild, premutate and vitest globalSetup, so the gitignored output never drifts
// from the tracked capture. Two runs writing one folder at the same moment can collide on Windows
// (the second rename meets the first one's folder), so nothing should start two at once.
//
// Usage:  node scripts/build-records.mjs [--examples <dir>] [--out <dir>]
//         (defaults: examples and src/lib/snapshot/generated beside this script's repository)
// Exit codes: 0 records written,
//             1 a notice could not be read or a write step failed (nothing half-written is left),
//             2 bad usage or no capture folder found.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNotice } from '../src/lib/ingest/read-notice.ts';
import {
	NoticeRecordSchema,
	SnapshotIndexSchema,
	toIndexRow
} from '../src/lib/snapshot/index-row.ts';
import {
	createSnapshotTransport,
	requestKey,
	tedNoticeXmlUrl
} from '../src/lib/snapshot/transport.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURE_ID = /^\d{4}-\d{2}-\d{2}$/;
const TEMP_PREFIX = '.tmp-';

class UsageError extends Error {}

function parseArgs(argv) {
	const options = {
		examples: join(repository, 'examples'),
		out: join(repository, 'src', 'lib', 'snapshot', 'generated')
	};
	for (let index = 0; index < argv.length; index += 2) {
		const [flag, value] = [argv[index], argv[index + 1]];
		if ((flag !== '--examples' && flag !== '--out') || !value) {
			throw new UsageError(`unknown or incomplete argument ${flag ?? ''}; see the usage in this file`);
		}
		options[flag.slice(2)] = resolve(value);
	}
	return options;
}

function captureIds(examples) {
	if (!existsSync(examples)) return [];
	return readdirSync(examples, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && CAPTURE_ID.test(entry.name))
		.filter((entry) => existsSync(join(examples, entry.name, 'notices.json')))
		.map((entry) => entry.name)
		.sort();
}

function readListing(folder) {
	const listing = JSON.parse(readFileSync(join(folder, 'notices.json'), 'utf8'));
	const numbers = (listing.notices ?? []).map((notice) => notice?.['publication-number']);
	return { listing, numbers };
}

async function snapshotTransport(folder) {
	const xmlFolder = join(folder, 'xml');
	const entries = new Map();
	const files = existsSync(xmlFolder) ? readdirSync(xmlFolder) : [];
	for (const file of files.filter((name) => name.endsWith('.xml'))) {
		const key = await requestKey(new Request(tedNoticeXmlUrl(file.slice(0, -'.xml'.length))));
		entries.set(key, join(xmlFolder, file));
	}
	return createSnapshotTransport(entries, async (path) => new Uint8Array(await readFile(path)));
}

async function readOne(transport, number) {
	if (typeof number !== 'string' || number.length === 0) {
		return { ok: false, kind: 'listing', detail: 'a notice in notices.json has no publication-number' };
	}
	const response = await transport(new Request(tedNoticeXmlUrl(number)));
	if (response.status !== 200) return { ok: false, kind: 'missing', detail: await response.text() };
	return readNotice(new Uint8Array(await response.arrayBuffer()), { noticeNumber: number });
}

async function buildCapture(examples, id) {
	const started = performance.now();
	const folder = join(examples, id);
	const { listing, numbers } = readListing(folder);
	const transport = await snapshotTransport(folder);
	const records = [];
	const failures = [];
	for (const number of numbers) {
		const result = await readOne(transport, number);
		if (!result.ok) {
			failures.push({ number: number ?? '(none)', kind: result.kind, detail: result.detail });
			continue;
		}
		// The loader parses each record with this schema, so one it would refuse is never written.
		const checked = NoticeRecordSchema.safeParse(result.record);
		if (checked.success) records.push(checked.data);
		else failures.push({ number, kind: 'record', detail: checked.error.message });
	}
	const duplicates = numbers.filter((number, index) => numbers.indexOf(number) !== index);
	for (const number of new Set(duplicates)) {
		failures.push({ number, kind: 'listing', detail: 'listed more than once in notices.json' });
	}
	const index = SnapshotIndexSchema.safeParse({
		capture: { id, fetchedAt: listing.fetchedAt, total: listing.total, query: listing.query },
		rows: records.map(toIndexRow)
	});
	if (!index.success && failures.length === 0) {
		failures.push({ number: '(index)', kind: 'index', detail: index.error.message });
	}
	const ms = Math.round(performance.now() - started);
	return { id, index: index.data, records, failures, listed: numbers.length, ms };
}

// Windows refuses to rename a folder onto an existing one, so the old folder goes first and the
// complete new one follows; a failure at any step removes the temp folder.
function writeCapture(out, capture) {
	const temp = join(out, `${TEMP_PREFIX}${capture.id}-${process.pid}`);
	const target = join(out, capture.id);
	let step = 'create the temp folder';
	try {
		rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
		mkdirSync(join(temp, 'records'), { recursive: true });
		step = 'write index.json';
		writeFileSync(join(temp, 'index.json'), JSON.stringify(capture.index));
		step = 'write the notice records';
		for (const record of capture.records) {
			writeFileSync(join(temp, 'records', `${record.noticeNumber}.json`), JSON.stringify(record));
		}
		step = `remove the old ${capture.id} folder`;
		rmSync(target, { recursive: true, force: true, maxRetries: 5 });
		step = `move the new ${capture.id} folder into place`;
		renameSync(temp, target);
	} catch (error) {
		rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
		const concurrent = step.startsWith('move')
			? '; another records build may have written the same folder at the same moment, so run this one again once it ends'
			: '';
		throw new Error(`records: ${capture.id}: could not ${step}: ${error.message}${concurrent}`);
	}
}

// A folder left from a capture that is gone from examples/ would still be served, so it goes too.
function pruneStale(out, ids) {
	if (!existsSync(out)) return;
	for (const entry of readdirSync(out, { withFileTypes: true })) {
		if (!entry.isDirectory() || !CAPTURE_ID.test(entry.name) || ids.includes(entry.name)) continue;
		rmSync(join(out, entry.name), { recursive: true, force: true, maxRetries: 5 });
	}
}

async function main() {
	const { examples, out } = parseArgs(process.argv.slice(2));
	const ids = captureIds(examples);
	if (ids.length === 0) throw new UsageError(`no capture folder with a notices.json under ${examples}`);
	const captures = [];
	for (const id of ids) captures.push(await buildCapture(examples, id));
	const failed = captures.filter((capture) => capture.failures.length > 0);
	for (const capture of failed) {
		for (const { number, kind, detail } of capture.failures) {
			console.error(`records: ${capture.id}: ${number}: ${kind}: ${detail}`);
		}
		console.error(
			`records: ${capture.id}: ${capture.failures.length} problems among ${capture.listed} listed notices; nothing was written`
		);
	}
	if (failed.length > 0) return 1;
	mkdirSync(out, { recursive: true });
	for (const capture of captures) {
		writeCapture(out, capture);
		console.log(`records: ${capture.id}: ${capture.records.length} notices in ${capture.ms} ms`);
	}
	pruneStale(out, ids);
	return 0;
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(error instanceof UsageError ? `records: ${error.message}` : error.message);
		process.exit(error instanceof UsageError ? 2 : 1);
	}
);

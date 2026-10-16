// A test that spawns scripts/capture.mjs runs the child outside the suite's outbound guard, so the
// child loads a preload that replaces fetch, the command's only network path, with a function that
// throws: a regression in a refusal then fails the test instead of calling TED. One module for every
// test file that spawns the command, so the guard cannot drift between copies.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FETCH_BLOCKED = 'FETCH_BLOCKED_BY_THE_CAPTURE_TEST';

export interface BlockedNode {
	// Runs plain node with the preload. Without env the child inherits this process's environment.
	run(args: readonly string[], env?: Readonly<Record<string, string>>): SpawnSyncReturns<string>;
	// Runs a probe that awaits fetch(url) under the preload: the control that the preload blocks it.
	probe(url: string): SpawnSyncReturns<string>;
	remove(): void;
}

export function createBlockedNode(): BlockedNode {
	const folder = mkdtempSync(join(tmpdir(), 'pagefifty-capture-preload-'));
	const preload = join(folder, 'block-fetch.mjs');
	writeFileSync(
		preload,
		[
			'globalThis.captureTestPreloadLoaded = true;',
			`globalThis.fetch = () => { throw new Error('${FETCH_BLOCKED}'); };`,
			''
		].join('\n')
	);
	writeFileSync(
		join(folder, 'probe.mjs'),
		[
			"if (!globalThis.captureTestPreloadLoaded) { console.error('the preload did not load'); process.exit(3); }",
			'await fetch(process.argv[2]);',
			"console.log('fetch returned');",
			''
		].join('\n')
	);
	const run: BlockedNode['run'] = (args, env) =>
		spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, ...args], {
			encoding: 'utf8',
			...(env === undefined ? {} : { env: { ...env } })
		});
	return {
		run,
		probe: (url) => run([join(folder, 'probe.mjs'), url]),
		remove: () => rmSync(folder, { recursive: true, force: true, maxRetries: 5 })
	};
}

// What a child node needs to start and to run git (scripts/capture.mjs reads HEAD first), and
// nothing else of this process's environment: spawnSync's env replaces the child's environment
// (on Windows the runtime adds back only system variables such as SYSTEMROOT and TEMP, measured
// 2026-10-16), so a variable set in the test runner's shell cannot reach the command.
export function commandEnv(extra: Readonly<Record<string, string>>): Record<string, string> {
	const env: Record<string, string> = {};
	for (const name of ['PATH', 'SystemRoot']) {
		const value = process.env[name];
		if (value !== undefined) env[name] = value;
	}
	return { ...env, ...extra };
}

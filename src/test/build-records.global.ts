// Vitest globalSetup: the generated records are gitignored, so every test run builds them from the
// tracked capture first, the same way predev and prebuild do. A capture that cannot be read stops
// the run here, naming the notice.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../scripts/build-records.mjs', import.meta.url));
// The build takes about two seconds; a hung one would otherwise hold the whole test run.
const BUILD_TIMEOUT_MS = 120_000;

// A run that could not start or was stopped has no exit code, and Node leaves its output null.
type BuildRun = Pick<SpawnSyncReturns<string>, 'status' | 'signal' | 'error'> & {
	stdout: string | null;
	stderr: string | null;
};

export function describeFailedBuild(run: BuildRun): string {
	const how = run.error
		? `did not complete (${run.error.message})`
		: run.signal
			? `was stopped by ${run.signal}`
			: `exited ${run.status}`;
	return `build-records ${how}:\n${run.stdout ?? ''}${run.stderr ?? ''}`;
}

// Vitest calls this once for the root and once more for each project that extends it, each time
// from a fresh module instance in the same main process, so the flag lives on globalThis. spawnSync
// blocks, so the calls never overlap.
const BUILT = Symbol.for('pagefifty.records.built');

export default function buildRecords(): void {
	const scope = globalThis as { [BUILT]?: boolean };
	if (scope[BUILT]) return;
	const run = spawnSync(process.execPath, [SCRIPT], {
		encoding: 'utf8',
		windowsHide: true,
		timeout: BUILD_TIMEOUT_MS
	});
	if (run.error || run.status !== 0) throw new Error(describeFailedBuild(run));
	scope[BUILT] = true;
	process.stdout.write(run.stdout);
}

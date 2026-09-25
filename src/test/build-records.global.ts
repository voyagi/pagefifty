// Vitest globalSetup: the generated records are gitignored, so every test run builds them from the
// tracked capture first, the same way predev and prebuild do. A capture that cannot be read stops
// the run here, naming the notice.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../scripts/build-records.mjs', import.meta.url));

// Vitest calls this once for the root and once more for each project that extends it, each time
// from a fresh module instance in the same main process, so the flag lives on globalThis. spawnSync
// blocks, so the calls never overlap.
const BUILT = Symbol.for('pagefifty.records.built');

export default function buildRecords(): void {
	const scope = globalThis as { [BUILT]?: boolean };
	if (scope[BUILT]) return;
	const run = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', windowsHide: true });
	if (run.status !== 0) {
		throw new Error(`build-records exited ${run.status}:\n${run.stdout}${run.stderr}`);
	}
	scope[BUILT] = true;
	process.stdout.write(run.stdout);
}

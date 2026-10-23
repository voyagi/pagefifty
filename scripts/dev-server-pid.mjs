// dev-server-pid.mjs - loaded through NODE_OPTIONS (devServerEnv in harness.mjs) by every Node
// process of a dev server that harness.mjs or preview.mjs starts: wrangler's launcher, the CLI it
// spawns, which holds Miniflare, and any Node process below them. Each adds its PID to server.pids
// in its temp folder, so a start keeps that folder while any of them runs, even once its starter and
// wrangler's launcher were ended alone.

import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

// Only a process whose temp folder is a dev-server one records itself, under the file name
// devTempInUse in harness.mjs reads. One that set a temp folder of its own writes nothing.
const folder = tmpdir();
if (basename(dirname(folder)) === 'dev-temp') {
	appendFileSync(join(folder, 'server.pids'), `${process.pid}\n`);
}

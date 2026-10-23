#!/usr/bin/env node
// preview.mjs - npm run preview: serves the built Worker with wrangler dev on 127.0.0.1:4173 the way
// the browser runs do, so a preview never hands the Worker the provider keys of the root env file.
//
// wrangler dev reads a .dev.vars file beside the config unless it is given an env file, then the
// dotenv files beside the config unless CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV is false, and the whole
// shell environment when CLOUDFLARE_INCLUDE_PROCESS_ENV is true. Naming the tracked empty env file
// and setting both variables to false closes all three.
//
// Miniflare's temp folders go under .wrangler/dev-temp, not the OS temp folder, because a forced end
// leaves them behind: devServerTemp in harness.mjs.
//
// Usage:  node scripts/preview.mjs   (after npm run build)
// Exit codes: the exit code of wrangler dev,
//             1 the built Worker is missing, or wrangler dev ended on a signal.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devServerTemp, recordDevServer, tempVariables, wranglerDevArgs } from './harness.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repository);

if (!existsSync(join(repository, '.svelte-kit', 'cloudflare', '_worker.js'))) {
	console.error('preview: .svelte-kit/cloudflare/_worker.js is missing; run npm run build first');
	process.exit(1);
}

const args = wranglerDevArgs({ port: 4173, envFile: join(repository, 'env/no-keys.env') });
const temp = devServerTemp(repository);
const child = spawn(process.execPath, args, {
	env: {
		...process.env,
		...tempVariables(temp),
		WRANGLER_SEND_METRICS: 'false',
		CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
		CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false'
	},
	stdio: 'inherit'
});
recordDevServer(temp, child.pid);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
// npm passes a SIGINT or a SIGTERM it receives on to this process (npm's run-script signal
// manager), and a SIGHUP can reach it alone. Ending here would leave wrangler dev serving the port,
// so off Windows each is passed on and this process exits when wrangler does. A terminal's Ctrl+C
// reaches wrangler directly as well, so it gets two; its exit hooks (signal-exit) end it on either.
// Windows sends console events to every process attached to the console.
if (process.platform !== 'win32') {
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
		process.on(signal, () => child.kill(signal));
}

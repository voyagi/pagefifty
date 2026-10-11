#!/usr/bin/env node
// preview.mjs - npm run preview: serves the built Worker with wrangler dev on 127.0.0.1:4173 the way
// the browser runs do, so a preview never hands the Worker the provider keys of the root env file.
//
// wrangler dev reads a .dev.vars file beside the config unless it is given an env file, then the
// dotenv files beside the config unless CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV is false, and the whole
// shell environment when CLOUDFLARE_INCLUDE_PROCESS_ENV is true. Naming the tracked empty env file
// and setting both variables to false closes all three.
//
// Usage:  node scripts/preview.mjs   (after npm run build)
// Exit codes: the exit code of wrangler dev,
//             1 the built Worker is missing.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wranglerDevArgs } from './harness.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repository);

if (!existsSync(join(repository, '.svelte-kit', 'cloudflare', '_worker.js'))) {
	console.error('preview: .svelte-kit/cloudflare/_worker.js is missing; run npm run build first');
	process.exit(1);
}

const args = wranglerDevArgs({ port: 4173, envFile: join(repository, 'env/no-keys.env') });
const child = spawn(process.execPath, args, {
	env: {
		...process.env,
		WRANGLER_SEND_METRICS: 'false',
		CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
		CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false'
	},
	stdio: 'inherit'
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

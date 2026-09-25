import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

// The bindings wrangler.jsonc declares. The test pool adds its own, all named
// __VITEST_POOL_WORKERS_*. Any other name reached the tests from a .dev.vars or dotenv file beside
// the config, or from the shell, and tests never see a provider key.
const DECLARED = ['ASSETS'];
const POOL_PREFIX = '__VITEST_POOL_WORKERS_';

describe('bindings in the workerd project', () => {
	it('holds only the bindings wrangler.jsonc declares', () => {
		const names = Object.keys(env).filter((name) => !name.startsWith(POOL_PREFIX));
		expect(names.sort()).toEqual(DECLARED);
	});
});

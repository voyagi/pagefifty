import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadProviderKeys } from './keys.ts';

const NEBIUS = 'pf-canary-nebius-5d1e';
const TAVILY = 'pf-canary-tavily-8b07';

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

// Every key file lives in its own temp root, written here at run time; the repository's own key file
// is never read.
function keyFile(text: string): string {
	const root = mkdtempSync(join(tmpdir(), 'pagefifty-keys-'));
	roots.push(root);
	const path = join(root, '.env');
	writeFileSync(path, text);
	return path;
}

const readText = (path: string) => readFileSync(path, 'utf8');

function thrownBy(load: () => unknown): Error {
	try {
		load();
	} catch (error) {
		if (error instanceof Error) return error;
		throw new Error(`expected an Error, got ${typeof error}`);
	}
	throw new Error('expected the loader to throw');
}

const envValues = () => Object.values(process.env).join('\n');

describe('loadProviderKeys', () => {
	it('returns both keys, frozen, from a file holding both', () => {
		const path = keyFile(`NEBIUS_API_KEY=${NEBIUS}\nTAVILY_API_KEY=${TAVILY}\n`);
		const keys = loadProviderKeys(path, readText);
		expect(keys).toEqual({ NEBIUS_API_KEY: NEBIUS, TAVILY_API_KEY: TAVILY });
		expect(Object.isFrozen(keys)).toBe(true);
	});

	it('reads the file at the path it is given, once', () => {
		const path = keyFile(`NEBIUS_API_KEY=${NEBIUS}\nTAVILY_API_KEY=${TAVILY}\n`);
		const asked: string[] = [];
		loadProviderKeys(path, (file) => {
			asked.push(file);
			return readText(file);
		});
		expect(asked).toEqual([path]);
	});

	it('loads both keys from a file that also holds other names, and copies none of them', () => {
		const path = keyFile(
			[
				'# provider keys',
				`NEBIUS_API_KEY=${NEBIUS}`,
				'PAGEFIFTY_LIVE=1',
				`TAVILY_API_KEY=${TAVILY}`,
				'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=true',
				'PF_KEYS_TEST_OTHER=pf-canary-other-41c9',
				''
			].join('\n')
		);
		const live = process.env.PAGEFIFTY_LIVE;
		const keys = loadProviderKeys(path, readText);
		expect(Object.keys(keys)).toEqual(['NEBIUS_API_KEY', 'TAVILY_API_KEY']);
		expect(process.env.PAGEFIFTY_LIVE).toBe(live);
		expect(process.env.PF_KEYS_TEST_OTHER).toBeUndefined();
		expect(envValues()).not.toContain('pf-canary-other-41c9');
	});

	it('leaves process.env without either key after the call', () => {
		const path = keyFile(`NEBIUS_API_KEY=${NEBIUS}\nTAVILY_API_KEY=${TAVILY}\n`);
		loadProviderKeys(path, readText);
		expect(Object.keys(process.env)).not.toContain('NEBIUS_API_KEY');
		expect(Object.keys(process.env)).not.toContain('TAVILY_API_KEY');
		expect(envValues()).not.toContain(NEBIUS);
		expect(envValues()).not.toContain(TAVILY);
	});

	it('keeps a # inside a quoted key, which an unquoted value would lose as a comment', () => {
		const path = keyFile(`NEBIUS_API_KEY="${NEBIUS}#2"\nTAVILY_API_KEY=${TAVILY}\n`);
		expect(loadProviderKeys(path, readText).NEBIUS_API_KEY).toBe(`${NEBIUS}#2`);
	});

	it('throws naming the path and the missing key only, never a value from the file', () => {
		const path = keyFile(`NEBIUS_API_KEY=${NEBIUS}\nPAGEFIFTY_LIVE=1\n`);
		const error = thrownBy(() => loadProviderKeys(path, readText));
		expect(error.message).toContain(path);
		expect(error.message).toContain('TAVILY_API_KEY');
		expect(error.message).not.toContain('NEBIUS_API_KEY');
		expect(error.message).not.toContain(NEBIUS);
	});

	it('throws naming a key that is present but empty', () => {
		const path = keyFile(`NEBIUS_API_KEY=\nTAVILY_API_KEY=${TAVILY}\n`);
		const error = thrownBy(() => loadProviderKeys(path, readText));
		expect(error.message).toContain('NEBIUS_API_KEY');
		expect(error.message).not.toContain('TAVILY_API_KEY');
		expect(error.message).not.toContain(TAVILY);
	});

	it('throws naming both keys when the file holds neither', () => {
		const path = keyFile('PAGEFIFTY_LIVE=1\n');
		const error = thrownBy(() => loadProviderKeys(path, readText));
		expect(error.message).toContain('NEBIUS_API_KEY');
		expect(error.message).toContain('TAVILY_API_KEY');
	});

	it('names the path but never the text of an error the read throws', () => {
		const path = join(tmpdir(), 'pagefifty-keys-unreadable', '.env');
		const error = thrownBy(() =>
			loadProviderKeys(path, () => {
				throw new Error(`NEBIUS_API_KEY=${NEBIUS}`);
			})
		);
		expect(error.message).toContain(path);
		expect(error.message).not.toContain(NEBIUS);
	});

	it("names the read error's code when it has one", () => {
		const path = join(tmpdir(), 'pagefifty-keys-missing', '.env');
		const error = thrownBy(() => loadProviderKeys(path, readText));
		expect(error.message).toContain(path);
		expect(error.message).toContain('ENOENT');
	});
});

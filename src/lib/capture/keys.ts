// The provider keys a live capture run hands to the metered gate (D-27). Read only from the file
// at the path given, never from process.env. Imported under Node type stripping: erasable syntax only.
import { parseEnv } from 'node:util';
import { z } from 'zod';

const KEY_NAMES = ['NEBIUS_API_KEY', 'TAVILY_API_KEY'] as const;

const ProviderKeysSchema = z.strictObject({
	NEBIUS_API_KEY: z.string().min(1),
	TAVILY_API_KEY: z.string().min(1)
});

export type ProviderKeys = Readonly<z.infer<typeof ProviderKeysSchema>>;

// A read error can quote the bytes it choked on, so only its code is passed on.
function readKeyFile(path: string, readText: (path: string) => string): string {
	try {
		return readText(path);
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		const why = typeof code === 'string' ? code : 'unreadable';
		throw new Error(`${path} could not be read (${why}); a live run reads its provider keys there`);
	}
}

export function loadProviderKeys(path: string, readText: (path: string) => string): ProviderKeys {
	// parseEnv returns a plain object and leaves process.env alone, unlike process.loadEnvFile, so
	// no library that reads process.env can find a key. Only the two names are picked from it.
	const parsed = parseEnv(readKeyFile(path, readText));
	const result = ProviderKeysSchema.safeParse({
		NEBIUS_API_KEY: parsed.NEBIUS_API_KEY,
		TAVILY_API_KEY: parsed.TAVILY_API_KEY
	});
	if (!result.success) {
		// Key names only: an issue's message or input could carry a value from the file.
		const failing = new Set(result.error.issues.map((issue) => issue.path[0]));
		const names = KEY_NAMES.filter((name) => failing.has(name));
		const verb = names.length === 1 ? 'is' : 'are';
		throw new Error(`${names.join(' and ')} ${verb} missing or empty in ${path}`);
	}
	return Object.freeze(result.data);
}

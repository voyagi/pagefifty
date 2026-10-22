// The one gate every metered call (Token Factory, Tavily) passes through, and the only counter of
// them (D-23, D-24). A provider client calls attempt once per request it would send, retries
// included, and reaches the provider only through send. Phase 1.1 has no metered caller of its own;
// phase 2's model read and Tavily search are the first. Imported under Node type stripping:
// erasable syntax only.
import type { Modes } from '../server/transport-mode.ts';

export type MeteredProvider = 'tokenFactory' | 'tavily';

// usage is kept exactly as the provider sent it: a figure summed as floats would record a cost
// nobody was billed (0.1 + 0.2 is 0.30000000000000004).
export interface MeteredResponse<T> {
	id: string;
	usage: unknown;
	value: T;
}

type MeteredKeys = Readonly<Record<MeteredProvider, string>>;

type Attempt<T> =
	| { kind: 'dry-run' }
	| { kind: 'refused'; reason: string }
	| { kind: 'sent'; id: string; value: T };

interface Refusal {
	provider: MeteredProvider;
	operation: string;
	reason: string;
}

interface ResponseRecord {
	provider: MeteredProvider;
	operation: string;
	id: string;
	usage: unknown;
}

export interface MeteredRecord {
	cap: number | null;
	attempts: number;
	perProvider: Record<MeteredProvider, number>;
	refusals: Refusal[];
	responses: ResponseRecord[];
}

export interface MeteredGate {
	attempt<T>(
		provider: MeteredProvider,
		operation: string,
		send: (key: string) => Promise<MeteredResponse<T>>
	): Promise<Attempt<T>>;
	record(): MeteredRecord;
}

interface GateOptions {
	modes: Modes;
	cap: number | null;
	log: (line: string) => void;
	// Held here, never in a step's context, so a provider call that skips the gate has no key to send.
	keys?: MeteredKeys;
}

export function createMeteredGate({ modes, cap, log, keys }: GateOptions): MeteredGate {
	let attempts = 0;
	const perProvider: Record<MeteredProvider, number> = { tokenFactory: 0, tavily: 0 };
	const refusals: Refusal[] = [];
	const responses: ResponseRecord[] = [];

	// A live run without a cap or a key can only come from a caller that skipped the argument
	// checks or the key loader, so it is refused rather than trusted.
	function refusalOf(key: string): string | undefined {
		if (cap === null) return 'no cap was set';
		// NaN or Infinity would make the comparison below never refuse, and 1.5 would allow 2.
		if (!Number.isSafeInteger(cap) || cap < 0) return `the cap ${cap} is not a whole number`;
		if (key === '') return 'no key loaded';
		if (attempts >= cap) return `the cap of ${cap} attempts is reached`;
		return undefined;
	}

	return {
		async attempt(provider, operation, send) {
			if (modes[provider] !== 'live') {
				log(`capture: (dry-run) WOULD call ${provider} ${operation}`);
				return { kind: 'dry-run' };
			}
			const key = keys?.[provider] ?? '';
			const reason = refusalOf(key);
			if (reason !== undefined) {
				refusals.push({ provider, operation, reason });
				log(`capture: refused ${provider} ${operation}: ${reason}`);
				return { kind: 'refused', reason };
			}
			// Counted before send: a vendor bills an attempt whether or not its answer arrives.
			attempts += 1;
			perProvider[provider] += 1;
			const response = await send(key);
			responses.push({ provider, operation, id: response.id, usage: response.usage });
			return { kind: 'sent', id: response.id, value: response.value };
		},
		record: () => ({
			cap,
			attempts,
			perProvider: { ...perProvider },
			refusals: refusals.map((refusal) => ({ ...refusal })),
			responses: responses.map((response) => ({ ...response }))
		})
	};
}

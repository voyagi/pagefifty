import { z } from 'zod';

export type TransportMode = 'live' | 'snapshot';

const LiveSwitch = z.object({ PAGEFIFTY_LIVE: z.string().optional() }).loose();

// Metered providers (Token Factory, Tavily) bill per call, so anything short of the exact
// value "1" replays recorded snapshots. A typo, "true" or a stray space never goes live.
export function resolveTransportMode(env: unknown): TransportMode {
	const parsed = LiveSwitch.safeParse(env);
	return parsed.success && parsed.data.PAGEFIFTY_LIVE === '1' ? 'live' : 'snapshot';
}

// The capture command's modes, one per upstream. TED is free and unmetered, so it is always live.
// Frozen, and flat, so Object.freeze's shallow freeze covers every value.
export interface Modes {
	readonly ted: 'live';
	readonly tokenFactory: TransportMode;
	readonly tavily: TransportMode;
}

// Two keys: a variable left set in a shell would otherwise turn a routine TED capture into a
// metered run, so PAGEFIFTY_LIVE counts only beside the command's own --live flag.
export function resolveModes(live: boolean, env: unknown): Modes {
	const metered: TransportMode = live && resolveTransportMode(env) === 'live' ? 'live' : 'snapshot';
	return Object.freeze({ ted: 'live', tokenFactory: metered, tavily: metered });
}

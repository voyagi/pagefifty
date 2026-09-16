import { z } from 'zod';

export type TransportMode = 'live' | 'snapshot';

const LiveSwitch = z.object({ PAGEFIFTY_LIVE: z.string().optional() }).loose();

// Metered providers (Token Factory, Tavily) bill per call, so anything short of the exact
// value "1" replays recorded snapshots. A typo, "true" or a stray space never goes live.
export function resolveTransportMode(env: unknown): TransportMode {
	const parsed = LiveSwitch.safeParse(env);
	return parsed.success && parsed.data.PAGEFIFTY_LIVE === '1' ? 'live' : 'snapshot';
}

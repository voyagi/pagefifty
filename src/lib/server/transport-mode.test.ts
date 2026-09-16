import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { resolveTransportMode } from './transport-mode';

describe('resolveTransportMode', () => {
	it('replays snapshots when the switch is absent', () => {
		expect(resolveTransportMode({})).toBe('snapshot');
		expect(resolveTransportMode(undefined)).toBe('snapshot');
		expect(resolveTransportMode(null)).toBe('snapshot');
	});

	it.each(['', '0', 'true', 'TRUE', 'yes', ' 1', '1 ', '01'])(
		'replays snapshots for PAGEFIFTY_LIVE=%j',
		(value) => {
			expect(resolveTransportMode({ PAGEFIFTY_LIVE: value })).toBe('snapshot');
		}
	);

	it('replays snapshots when the switch is not a string', () => {
		expect(resolveTransportMode({ PAGEFIFTY_LIVE: 1 })).toBe('snapshot');
		expect(resolveTransportMode({ PAGEFIFTY_LIVE: true })).toBe('snapshot');
	});

	it('goes live only for the exact value 1', () => {
		expect(resolveTransportMode({ PAGEFIFTY_LIVE: '1', OTHER: 'x' })).toBe('live');
	});

	test.prop([fc.string().filter((value) => value !== '1')])(
		'never goes live for any other string',
		(value) => {
			expect(resolveTransportMode({ PAGEFIFTY_LIVE: value })).toBe('snapshot');
		}
	);

	it('resolves to snapshot under the committed Wrangler config', () => {
		const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8')) as {
			vars?: Record<string, unknown>;
		};
		expect(resolveTransportMode(config.vars ?? {})).toBe('snapshot');
	});
});

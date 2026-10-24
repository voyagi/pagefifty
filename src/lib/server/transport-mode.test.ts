import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { resolveModes, resolveTransportMode } from './transport-mode';

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

	// wrangler.jsonc may carry comments, which JSON.parse refuses and TypeScript's parser reads.
	it('resolves to snapshot under the committed Wrangler config', () => {
		const { config, error } = ts.parseConfigFileTextToJson(
			'wrangler.jsonc',
			readFileSync('wrangler.jsonc', 'utf8')
		);
		expect(error).toBeUndefined();
		const vars = (config as { vars?: Record<string, unknown> }).vars;
		expect(resolveTransportMode(vars ?? {})).toBe('snapshot');
	});
});

describe('resolveModes', () => {
	const SNAPSHOT = { ted: 'live', tokenFactory: 'snapshot', tavily: 'snapshot' };
	const LIVE = { ted: 'live', tokenFactory: 'live', tavily: 'live' };

	it('the default configuration resolves Token Factory and Tavily to snapshot', () => {
		const withoutSwitch = { ...process.env };
		delete withoutSwitch.PAGEFIFTY_LIVE;
		for (const env of [{}, undefined, withoutSwitch, { PATH: '/usr/bin', HOME: '/home/owner' }]) {
			const modes = resolveModes(false, env);
			expect(modes).toEqual(SNAPSHOT);
			expect(Object.isFrozen(modes)).toBe(true);
			// Every metered upstream the object names, so one added later is held to the same rule.
			for (const [upstream, mode] of Object.entries(modes)) {
				if (upstream !== 'ted') expect(mode, upstream).toBe('snapshot');
			}
		}
	});

	it('goes live for both metered upstreams only with --live and PAGEFIFTY_LIVE exactly 1', () => {
		const modes = resolveModes(true, { PAGEFIFTY_LIVE: '1' });
		expect(modes).toEqual(LIVE);
		expect(Object.isFrozen(modes)).toBe(true);
	});

	it('stays snapshot when PAGEFIFTY_LIVE is 1 but --live was not given', () => {
		expect(resolveModes(false, { PAGEFIFTY_LIVE: '1' })).toEqual(SNAPSHOT);
	});

	it.each([undefined, '0', 'true', ' 1', '1 ', '01'])(
		'stays snapshot with --live when PAGEFIFTY_LIVE is %j',
		(value) => {
			expect(resolveModes(true, value === undefined ? {} : { PAGEFIFTY_LIVE: value })).toEqual(
				SNAPSHOT
			);
		}
	);
});

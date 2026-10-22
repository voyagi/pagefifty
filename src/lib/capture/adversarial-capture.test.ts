// Hostile inputs at the capture command's money and key boundaries: the go-live switch, the flag
// parser, the metered gate's cap and the key file reader. Nothing here reaches a network.
import { describe, expect, it } from 'vitest';
import { resolveModes, resolveTransportMode } from '../server/transport-mode';
import { parseCaptureArgs } from './args';
import { createMeteredGate } from './metered';

const LIVE = Object.freeze({ ted: 'live', tokenFactory: 'live', tavily: 'live' } as const);
const KEYS = { tokenFactory: 'nb-key', tavily: 'tvly-key' };
const quiet = () => {};

function countingSend() {
	let sends = 0;
	const send = async () => {
		sends += 1;
		return { id: `r${sends}`, usage: null, value: sends };
	};
	return { send, sent: () => sends };
}

describe('the go-live switch', () => {
	it.each([['1 '], [' 1'], ['true'], ['01'], ['yes'], [''], ['1\n']])(
		'PAGEFIFTY_LIVE %j never goes live',
		(value) => {
			expect(resolveTransportMode({ PAGEFIFTY_LIVE: value })).toBe('snapshot');
		}
	);

	it.each([[1], [true], [null], [['1']], [{ toString: () => '1' }]])(
		'a PAGEFIFTY_LIVE that is not a string (%j) never goes live',
		(value) => {
			expect(resolveTransportMode({ PAGEFIFTY_LIVE: value })).toBe('snapshot');
		}
	);

	it('only the exact value beside the --live flag goes live', () => {
		expect(resolveModes(true, { PAGEFIFTY_LIVE: '1' }).tokenFactory).toBe('live');
		expect(resolveModes(false, { PAGEFIFTY_LIVE: '1' }).tokenFactory).toBe('snapshot');
		expect(resolveModes(true, {}).tavily).toBe('snapshot');
		expect(resolveModes(true, null).tavily).toBe('snapshot');
	});
});

describe('the flag parser', () => {
	const DAY = '2026-10-22';
	it.each([
		[['--live']],
		[['--live', '--cap']],
		[['--live', '--cap', '']],
		[['--live', '--cap', '-1']],
		[['--live', '--cap', '1001']],
		[['--live', '--cap', '1e3']],
		[['--live', '--cap', '0x10']],
		[['--live', '--cap', ' 3']],
		[['--live', '--cap', '٣']],
		[['--live', '--cap=5']],
		[['--live', '--live', '--cap', '5']],
		[['--live', '--cap', '5', '--cap', '6']]
	])('%j is refused', (argv) => {
		expect(parseCaptureArgs(argv, DAY).ok).toBe(false);
	});

	it('a live run with a cap in range parses', () => {
		expect(parseCaptureArgs(['--live', '--cap', '0'], DAY)).toMatchObject({ ok: true, cap: 0 });
		expect(parseCaptureArgs(['--cap', '1000', '--live'], DAY)).toMatchObject({
			ok: true,
			live: true,
			cap: 1000
		});
	});
});

describe('the metered gate cap', () => {
	// A gate built by a caller that skipped the flag checks: the gate must still hold a limit.
	it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [-1], [1.5]])(
		'a cap of %s never lets a live attempt through unbounded',
		async (cap) => {
			const gate = createMeteredGate({ modes: LIVE, cap, log: quiet, keys: KEYS });
			const { send, sent } = countingSend();
			for (let index = 0; index < 5; index += 1) await gate.attempt('tavily', 'search', send);
			expect(sent()).toBe(0);
		}
	);

	it('concurrent attempts never pass the cap', async () => {
		const gate = createMeteredGate({ modes: LIVE, cap: 3, log: quiet, keys: KEYS });
		const { send, sent } = countingSend();
		const results = await Promise.all(
			Array.from({ length: 8 }, () => gate.attempt('tokenFactory', 'chat', send))
		);
		expect(sent()).toBe(3);
		expect(results.filter((each) => each.kind === 'refused')).toHaveLength(5);
		expect(gate.record().attempts).toBe(3);
	});

	it('a send that throws still counts against the cap', async () => {
		const gate = createMeteredGate({ modes: LIVE, cap: 1, log: quiet, keys: KEYS });
		await expect(
			gate.attempt('tavily', 'search', async () => {
				throw new Error('socket hang up');
			})
		).rejects.toThrow('socket hang up');
		const { send, sent } = countingSend();
		expect((await gate.attempt('tavily', 'search', send)).kind).toBe('refused');
		expect(sent()).toBe(0);
	});
});

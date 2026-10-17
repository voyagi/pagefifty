import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveModes } from '../server/transport-mode.ts';
import { writeJsonFile } from './capture-folder.ts';
import { createMeteredGate, type MeteredProvider, type MeteredResponse } from './metered.ts';
import { buildRunRecord } from './run-record.ts';

const OFF = resolveModes(false, {});
const ON = resolveModes(true, { PAGEFIFTY_LIVE: '1' });
const KEYS = Object.freeze({ tokenFactory: 'tf-stub-key-7a1c', tavily: 'tv-stub-key-93be' });

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
});

// A stand-in provider: records every key it was handed, answers with a fresh id and usage.
function stubProvider(usages: readonly unknown[] = []) {
	const keys: string[] = [];
	const send = async (key: string): Promise<MeteredResponse<number>> => {
		keys.push(key);
		const index = keys.length;
		return { id: `response-${index}`, usage: usages[index - 1] ?? { tokens: index }, value: index };
	};
	return { keys, send };
}

function gateWith(options: { live: boolean; cap: number | null; keys?: typeof KEYS }) {
	const lines: string[] = [];
	const gate = createMeteredGate({
		modes: options.live ? ON : OFF,
		cap: options.cap,
		log: (line) => lines.push(line),
		keys: options.keys
	});
	return { gate, lines };
}

async function attemptTimes(
	gate: ReturnType<typeof createMeteredGate>,
	times: number,
	send: (key: string) => Promise<MeteredResponse<number>>,
	provider: MeteredProvider = 'tokenFactory'
) {
	const results = [];
	for (let call = 1; call <= times; call += 1) {
		results.push(await gate.attempt(provider, `read notice ${call}`, send));
	}
	return results;
}

describe('createMeteredGate in snapshot mode', () => {
	it('logs a dry-run line instead of calling, and counts nothing', async () => {
		const { gate, lines } = gateWith({ live: false, cap: 5, keys: KEYS });
		const provider = stubProvider();
		const result = await gate.attempt('tokenFactory', 'read criteria', provider.send);
		expect(result).toEqual({ kind: 'dry-run' });
		expect(lines).toEqual(['capture: (dry-run) WOULD call tokenFactory read criteria']);
		expect(provider.keys).toEqual([]);
		expect(gate.record()).toEqual({
			cap: 5,
			attempts: 0,
			perProvider: { tokenFactory: 0, tavily: 0 },
			refusals: [],
			responses: []
		});
	});

	it('logs every call as a dry run whatever the cap, with no cap at all too', async () => {
		for (const cap of [0, null]) {
			const { gate, lines } = gateWith({ live: false, cap });
			const provider = stubProvider();
			await attemptTimes(gate, 3, provider.send, 'tavily');
			expect(lines).toEqual([
				'capture: (dry-run) WOULD call tavily read notice 1',
				'capture: (dry-run) WOULD call tavily read notice 2',
				'capture: (dry-run) WOULD call tavily read notice 3'
			]);
			expect(provider.keys).toEqual([]);
			expect(gate.record().attempts).toBe(0);
		}
	});
});

describe('createMeteredGate in live mode', () => {
	it('a cap of N allows N attempts and refuses the next', async () => {
		const { gate } = gateWith({ live: true, cap: 3, keys: KEYS });
		const provider = stubProvider();
		const results = await attemptTimes(gate, 5, provider.send);
		expect(provider.keys).toHaveLength(3);
		expect(results.map((result) => result.kind)).toEqual([
			'sent',
			'sent',
			'sent',
			'refused',
			'refused'
		]);
		const record = gate.record();
		expect(record.attempts).toBe(3);
		expect(record.refusals).toEqual([
			{
				provider: 'tokenFactory',
				operation: 'read notice 4',
				reason: 'the cap of 3 attempts is reached'
			},
			{
				provider: 'tokenFactory',
				operation: 'read notice 5',
				reason: 'the cap of 3 attempts is reached'
			}
		]);
	});

	it.each([0, 1, 2, 7])(
		'with a cap of %i, cap + 3 requested calls make cap attempts',
		async (cap) => {
			const { gate } = gateWith({ live: true, cap, keys: KEYS });
			const provider = stubProvider();
			await attemptTimes(gate, cap + 3, provider.send);
			expect(provider.keys).toHaveLength(cap);
			expect(gate.record().attempts).toBe(cap);
			expect(gate.record().refusals).toHaveLength(3);
		}
	);

	it('makes no attempt at all with a cap of 0', async () => {
		const { gate } = gateWith({ live: true, cap: 0, keys: KEYS });
		const provider = stubProvider();
		const results = await attemptTimes(gate, 2, provider.send);
		expect(provider.keys).toEqual([]);
		expect(results.every((result) => result.kind === 'refused')).toBe(true);
		expect(gate.record()).toMatchObject({ cap: 0, attempts: 0 });
	});

	it('counts the attempt before it calls send', async () => {
		const { gate } = gateWith({ live: true, cap: 2, keys: KEYS });
		const seen: number[] = [];
		await gate.attempt('tavily', 'search awards', async () => {
			seen.push(gate.record().attempts);
			return { id: 'r', usage: {}, value: 0 };
		});
		expect(seen).toEqual([1]);
	});

	it('counts a send that throws as an attempt, and passes its error on', async () => {
		const { gate } = gateWith({ live: true, cap: 2, keys: KEYS });
		const failure = new Error('connection reset');
		await expect(
			gate.attempt('tokenFactory', 'read criteria', async () => {
				throw failure;
			})
		).rejects.toBe(failure);
		expect(gate.record()).toMatchObject({ attempts: 1, perProvider: { tokenFactory: 1 } });
	});

	it('counts a retry of one logical call as a second attempt', async () => {
		const { gate } = gateWith({ live: true, cap: 2, keys: KEYS });
		let tries = 0;
		const send = async (): Promise<MeteredResponse<string>> => {
			tries += 1;
			if (tries === 1) throw new Error('status 429');
			return { id: 'after-retry', usage: { tokens: 9 }, value: 'read' };
		};
		const readWithOneRetry = async () => {
			try {
				return await gate.attempt('tokenFactory', 'read criteria', send);
			} catch {
				return gate.attempt('tokenFactory', 'read criteria', send);
			}
		};
		expect(await readWithOneRetry()).toEqual({ kind: 'sent', id: 'after-retry', value: 'read' });
		expect(gate.record()).toMatchObject({ attempts: 2, perProvider: { tokenFactory: 2 } });
		expect(await readWithOneRetry()).toMatchObject({ kind: 'refused' });
	});

	it('holds one cap across both providers and counts each apart', async () => {
		const { gate } = gateWith({ live: true, cap: 3, keys: KEYS });
		const provider = stubProvider();
		for (const name of ['tokenFactory', 'tavily', 'tokenFactory', 'tavily'] as const) {
			await gate.attempt(name, 'call', provider.send);
		}
		const record = gate.record();
		expect(record.attempts).toBe(3);
		expect(record.perProvider).toEqual({ tokenFactory: 2, tavily: 1 });
		expect(record.refusals).toEqual([
			{ provider: 'tavily', operation: 'call', reason: 'the cap of 3 attempts is reached' }
		]);
	});

	it("hands each send only its own provider's key, and never writes a key", async () => {
		const { gate, lines } = gateWith({ live: true, cap: 1, keys: KEYS });
		const tokenFactory = stubProvider();
		const tavily = stubProvider();
		await gate.attempt('tokenFactory', 'read criteria', tokenFactory.send);
		await gate.attempt('tavily', 'search awards', tavily.send);
		expect(tokenFactory.keys).toEqual([KEYS.tokenFactory]);
		expect(tavily.keys).toEqual([]);
		const written = JSON.stringify(gate.record()) + lines.join('\n');
		expect(written).not.toContain(KEYS.tokenFactory);
		expect(written).not.toContain(KEYS.tavily);
	});

	it('refuses a live call with no key loaded, and counts nothing', async () => {
		const { gate, lines } = gateWith({ live: true, cap: 5 });
		const provider = stubProvider();
		const result = await gate.attempt('tavily', 'search awards', provider.send);
		expect(result).toEqual({ kind: 'refused', reason: 'no key loaded' });
		expect(provider.keys).toEqual([]);
		expect(gate.record()).toMatchObject({
			attempts: 0,
			refusals: [{ provider: 'tavily', operation: 'search awards', reason: 'no key loaded' }]
		});
		expect(lines).toEqual(['capture: refused tavily search awards: no key loaded']);
	});

	it('refuses every live call when no cap was set', async () => {
		const { gate } = gateWith({ live: true, cap: null, keys: KEYS });
		const provider = stubProvider();
		const result = await gate.attempt('tokenFactory', 'read criteria', provider.send);
		expect(result).toEqual({ kind: 'refused', reason: 'no cap was set' });
		expect(provider.keys).toEqual([]);
	});
});

describe('the usage a provider reports', () => {
	it('is stored exactly as sent, never summed, in the gate record and in run.json', async () => {
		const usages = [{ cost: 0.1 }, { cost: 0.2 }];
		const { gate } = gateWith({ live: true, cap: 2, keys: KEYS });
		const provider = stubProvider(usages);
		await attemptTimes(gate, 2, provider.send);
		const { responses } = gate.record();
		expect(responses).toEqual([
			{
				provider: 'tokenFactory',
				operation: 'read notice 1',
				id: 'response-1',
				usage: { cost: 0.1 }
			},
			{
				provider: 'tokenFactory',
				operation: 'read notice 2',
				id: 'response-2',
				usage: { cost: 0.2 }
			}
		]);
		expect(responses[0].usage).toBe(usages[0]);
		expect(responses[1].usage).toBe(usages[1]);

		const root = mkdtempSync(join(tmpdir(), 'pagefifty-metered-'));
		roots.push(root);
		const path = join(root, 'run.json');
		writeJsonFile(path, buildRunRecord(runRecordParts(gate.record())));
		const text = readFileSync(path, 'utf8');
		const written = JSON.parse(text);
		expect(Object.keys(written.metered)).toEqual([
			'cap',
			'attempts',
			'perProvider',
			'refusals',
			'responses'
		]);
		expect(written.metered.responses.map((response: { usage: unknown }) => response.usage)).toEqual(
			usages
		);
		expect(text).not.toContain('0.30000000000000004');
		expect(text).not.toMatch(/"total/i);
	});
});

function runRecordParts(metered: ReturnType<ReturnType<typeof createMeteredGate>['record']>) {
	return {
		startedAt: '2026-10-11T08:00:00.000Z',
		finishedAt: '2026-10-11T08:00:01.000Z',
		captureDate: '2026-10-11',
		outcome: 'written' as const,
		reason: null,
		command: 'node scripts/capture.mjs --live --cap 2',
		head: '0123456789abcdef0123456789abcdef01234567',
		modes: ON,
		query: { query: 'q', fields: [], scope: 'ACTIVE', onlyLatestVersions: true, since: '20260927' },
		ted: {
			searchPages: 1,
			xmlRequests: 0,
			cacheHits: 0,
			status429: 0,
			waited429Ms: 0,
			retries502: 0,
			failures: 0
		},
		notices: { listed: 0, written: 0, leftOut: [], failed: [], sameProcedure: [] },
		metered
	};
}

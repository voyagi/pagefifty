import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { createFakeClock, createScriptedTed } from '../../test/ted-stub.ts';
import { MAX_NOTICE_BYTES } from '../ingest/read-notice.ts';
import { tedNoticeXmlUrl } from '../snapshot/transport.ts';
import {
	BACKOFF_MS,
	createTedClient,
	MAX_429_WAITS,
	readCapped,
	RETRIES_502,
	RETRY_AFTER_CEILING_MS,
	retryAfterMs
} from './ted-client.ts';
import { MAX_SEARCH_PAGE_BYTES } from './ted-search.ts';

const START = Date.parse('2026-10-11T08:00:00Z');
const NOTICE = '600457-2026';
const URL_A = tedNoticeXmlUrl(NOTICE);
const CHUNK = 64 * 1024;

type Script = NonNullable<Parameters<typeof createScriptedTed>[0]['script']>[string];

function rig(answers: Script = [], start = START) {
	const clock = createFakeClock(start);
	const ted = createScriptedTed({ clock, notices: [NOTICE], script: { [URL_A]: answers } });
	const client = createTedClient({ transport: ted, clock });
	const send = () => client.send('xml', () => new Request(URL_A), { id: NOTICE }, MAX_NOTICE_BYTES);
	const starts = () => ted.calls().map(({ at }) => at);
	return { clock, ted, client, send, starts };
}

const gaps = (starts: readonly number[]) => starts.slice(1).map((at, index) => at - starts[index]);

// A body that counts what it handed out and whether it was cancelled, so a test can tell a read that
// stopped at the cap from one that buffered everything.
function countedBody(total: number) {
	const seen = { bytes: 0, cancelled: false };
	let left = total;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (left <= 0) {
				controller.close();
				return;
			}
			const size = Math.min(CHUNK, left);
			left -= size;
			seen.bytes += size;
			controller.enqueue(new Uint8Array(size).fill(0x3c));
		},
		cancel() {
			seen.cancelled = true;
		}
	});
	return { stream, seen };
}

describe('the limits the client works to', () => {
	it('backs off 5, 10, 20, 40, 60 and 60 seconds, waits at most 6 times, retries a 502 once', () => {
		expect(BACKOFF_MS).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
		expect(MAX_429_WAITS).toBe(6);
		expect(RETRIES_502).toBe(1);
		expect(RETRY_AFTER_CEILING_MS).toBe(300_000);
	});

	it('caps a notice at 2 MiB and a search page at 20 MB', () => {
		expect(MAX_NOTICE_BYTES).toBe(2 * 1024 * 1024);
		expect(MAX_SEARCH_PAGE_BYTES).toBe(20 * 1024 * 1024);
	});
});

describe('pacing', () => {
	it('consecutive request starts are at least 1000 ms apart and never overlap', async () => {
		const { clock, ted, send, starts } = rig();
		for (let index = 0; index < 10; index += 1) {
			expect((await send()).ok).toBe(true);
		}
		expect(gaps(starts())).toEqual(Array.from({ length: 9 }, () => 1000));
		expect(ted.maxInFlight()).toBe(1);
		const sleepsBefore = clock.sleeps().length;
		await clock.sleep(1500);
		expect((await send()).ok).toBe(true);
		expect(gaps(starts()).at(-1)).toBe(1500);
		expect(clock.sleeps().slice(sleepsBefore)).toEqual([1500]);
	});
});

describe('429 answers', () => {
	it('a 429 waits at least its Retry-After seconds', async () => {
		const three = rig([{ status: 429, headers: { 'retry-after': '3' } }]);
		expect((await three.send()).ok).toBe(true);
		expect(gaps(three.starts())[0]).toBeGreaterThanOrEqual(3000);
		const eight = rig([{ status: 429, headers: { 'retry-after': '8' } }]);
		expect((await eight.send()).ok).toBe(true);
		const [wait] = gaps(eight.starts());
		expect(wait).toBeGreaterThanOrEqual(8000);
		expect(wait).toBeLessThan(9000);
	});

	it('waits at least until a Retry-After given as an HTTP date', async () => {
		const date = new Date(START + 7000).toUTCString();
		expect(retryAfterMs(date, START)).toBe(7000);
		const { send, starts } = rig([{ status: 429, headers: { 'retry-after': date } }]);
		expect((await send()).ok).toBe(true);
		expect(gaps(starts())[0]).toBeGreaterThanOrEqual(7000);
	});

	it('never waits less than the gap, even for an HTTP date under a second ahead', async () => {
		const date = new Date(START).toUTCString();
		expect(retryAfterMs(date, START - 600)).toBe(600);
		const { clock, send } = rig([{ status: 429, headers: { 'retry-after': date } }], START - 600);
		expect((await send()).ok).toBe(true);
		expect(clock.sleeps()).toEqual([1000]);
	});

	it.each(['0', 'soon', '-5', '2030-01-01', ''])(
		'backs off 5000 ms when Retry-After is %j',
		async (value) => {
			const headers: Record<string, string> = value === '' ? {} : { 'retry-after': value };
			const { send, starts } = rig([{ status: 429, headers }]);
			expect((await send()).ok).toBe(true);
			expect(gaps(starts())).toEqual([5000]);
		}
	);

	test.prop([fc.integer({ min: 1, max: 300 })])(
		'waits at least the stated whole seconds and never under the gap',
		async (seconds) => {
			const { send, starts } = rig([{ status: 429, headers: { 'retry-after': String(seconds) } }]);
			expect((await send()).ok).toBe(true);
			expect(gaps(starts())[0]).toBeGreaterThanOrEqual(Math.max(1000, seconds * 1000));
		}
	);

	it('after 6 waits on 429 the request fails, and not before', async () => {
		const { clock, client, send, ted } = rig([
			...Array.from({ length: 7 }, () => ({ status: 429 })),
			{ status: 200, body: '<served-on-the-eighth-attempt/>' }
		]);
		const result = await send();
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.reason).toMatch(/429.*6 waits/);
		expect(ted.calls()).toHaveLength(7);
		expect(clock.sleeps()).toEqual([5000, 10000, 20000, 40000, 60000, 60000]);
		expect(client.stats()).toMatchObject({ status429: 7, waited429Ms: 195000, failures: 1 });
	});

	it('fails at once on a Retry-After over 300 seconds, naming it', async () => {
		const { clock, send, ted } = rig([
			{ status: 429, headers: { 'retry-after': '301' } },
			{ status: 200, body: '<never-asked-for/>' }
		]);
		const result = await send();
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.reason).toContain('301 s');
		expect(ted.calls()).toHaveLength(1);
		expect(clock.sleeps()).toEqual([]);
	});

	it('waits a Retry-After of exactly 300 seconds', async () => {
		const { clock, send } = rig([{ status: 429, headers: { 'retry-after': '300' } }]);
		expect((await send()).ok).toBe(true);
		expect(clock.sleeps()).toEqual([300_000]);
	});
});

describe('502 answers and thrown calls', () => {
	it('a 502 is retried exactly once, then the request fails', async () => {
		const once = rig([{ status: 502 }]);
		expect((await once.send()).ok).toBe(true);
		expect(once.ted.calls()).toHaveLength(2);
		const twice = rig([{ status: 502 }, { status: 502 }, { status: 200, body: '<third/>' }]);
		const result = await twice.send();
		expect(result).toMatchObject({ ok: false, status: 502 });
		expect(twice.ted.calls()).toHaveLength(2);
		expect(gaps(twice.starts())).toEqual([1000]);
	});

	it('retries a thrown call once on the same budget, logging it as status 0', async () => {
		const once = rig([{ throws: new Error('socket hang up') }]);
		expect((await once.send()).ok).toBe(true);
		expect(once.client.log().map(({ attempt, status }) => [attempt, status])).toEqual([
			[0, 0],
			[1, 200]
		]);
		const twice = rig([
			{ throws: new Error('socket hang up') },
			{ throws: new Error('getaddrinfo ENOTFOUND') },
			{ status: 200, body: '<third/>' }
		]);
		const result = await twice.send();
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.reason).toContain('ENOTFOUND');
		expect(twice.ted.calls()).toHaveLength(2);
	});

	it('retries a body that breaks off while streaming on the same budget', async () => {
		const broken = () =>
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(16));
					controller.error(new Error('ECONNRESET'));
				}
			});
		const once = rig([{ status: 200, body: broken() }]);
		expect((await once.send()).ok).toBe(true);
		expect(once.ted.calls()).toHaveLength(2);
		const twice = rig([{ status: 502 }, { status: 200, body: broken() }]);
		const result = await twice.send();
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.reason).toContain('ECONNRESET');
		expect(twice.ted.calls()).toHaveLength(2);
	});

	it('ends the request when the clock refuses a 429 wait, and asks nothing more', async () => {
		const ted = createScriptedTed({
			clock: { now: () => START },
			notices: [NOTICE],
			script: { [URL_A]: [{ status: 429 }] }
		});
		let refused = false;
		const clock = {
			now: () => START,
			sleep() {
				if (refused) return Promise.resolve();
				refused = true;
				return Promise.reject(new Error('interrupted'));
			}
		};
		const client = createTedClient({ transport: ted, clock });
		await expect(
			client.send('xml', () => new Request(URL_A), { id: NOTICE }, MAX_NOTICE_BYTES)
		).rejects.toThrow('interrupted');
		expect(ted.calls()).toHaveLength(1);
	});

	it('applies each rule once when a 429 and a 502 meet on one request', async () => {
		const mixed = rig([{ status: 429 }, { status: 502 }]);
		expect((await mixed.send()).ok).toBe(true);
		expect(mixed.ted.calls()).toHaveLength(3);
		expect(mixed.clock.sleeps()).toEqual([5000, 1000]);
		expect(mixed.client.stats()).toMatchObject({ status429: 1, retries502: 1, failures: 0 });
		const spent = rig([
			{ status: 502 },
			{ status: 429 },
			{ status: 502 },
			{ status: 200, body: '<fourth/>' }
		]);
		expect(await spent.send()).toMatchObject({ ok: false, status: 502 });
		expect(spent.ted.calls()).toHaveLength(3);
	});

	it.each([404, 500, 503, 301])('fails at once on status %i', async (status) => {
		const { send, ted } = rig([{ status }, { status: 200, body: '<second/>' }]);
		const result = await send();
		expect(result).toMatchObject({ ok: false, status, reason: `status ${status}` });
		expect(ted.calls()).toHaveLength(1);
	});
});

describe('body caps', () => {
	it('refuses a body whose content-length is over the cap without reading it', async () => {
		const { stream, seen } = countedBody(MAX_NOTICE_BYTES * 4);
		const { send } = rig([
			{ status: 200, headers: { 'content-length': String(MAX_NOTICE_BYTES + 1) }, body: stream }
		]);
		const result = await send();
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.reason).toContain(String(MAX_NOTICE_BYTES + 1));
		expect(seen.cancelled).toBe(true);
		expect(seen.bytes).toBeLessThanOrEqual(2 * CHUNK);
	});

	it('stops reading a body with no content-length at the cap, and cancels it', async () => {
		const { stream, seen } = countedBody(MAX_NOTICE_BYTES * 4);
		const { send } = rig([{ status: 200, body: stream }]);
		const result = await send();
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.reason).toContain(`${MAX_NOTICE_BYTES} byte cap`);
		expect(seen.cancelled).toBe(true);
		expect(seen.bytes).toBeLessThanOrEqual(MAX_NOTICE_BYTES + 2 * CHUNK);
	});

	it('accepts a body of exactly the cap, with or without content-length', async () => {
		const bare = countedBody(MAX_NOTICE_BYTES);
		const stated = countedBody(MAX_NOTICE_BYTES);
		const { send } = rig([
			{ status: 200, body: bare.stream },
			{ status: 200, headers: { 'content-length': String(MAX_NOTICE_BYTES) }, body: stated.stream }
		]);
		for (const result of [await send(), await send()]) {
			expect(result.ok).toBe(true);
			expect(result.ok ? result.body.byteLength : 0).toBe(MAX_NOTICE_BYTES);
		}
	});

	it('reads a body one byte over the cap as refused', async () => {
		const read = await readCapped(new Response(new Uint8Array(11)), 10);
		expect(read).toEqual({ ok: false, reason: 'over the 10 byte cap' });
		expect(await readCapped(new Response(new Uint8Array(10)), 10)).toMatchObject({ ok: true });
	});
});

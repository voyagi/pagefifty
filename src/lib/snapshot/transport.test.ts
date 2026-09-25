import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePath } from '../../test/fixtures/node';
import { createSnapshotTransport, requestKey, tedNoticeXmlUrl } from './transport';

const NOTICE = '609955-2026';

async function transportFor(notices: string[]) {
	const entries = new Map<string, string>();
	for (const notice of notices) {
		entries.set(await requestKey(new Request(tedNoticeXmlUrl(notice))), capturePath(notice));
	}
	return createSnapshotTransport(entries, async (path) => new Uint8Array(readFileSync(path)));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('tedNoticeXmlUrl', () => {
	it('builds the notice XML address the capture was fetched from', () => {
		expect(tedNoticeXmlUrl(NOTICE)).toBe('https://ted.europa.eu/en/notice/609955-2026/xml');
	});
});

describe('requestKey', () => {
	const url = tedNoticeXmlUrl(NOTICE);

	it('is equal for the same request built twice', async () => {
		expect(await requestKey(new Request(url))).toBe(await requestKey(new Request(url)));
	});

	it('differs for two methods', async () => {
		expect(await requestKey(new Request(url))).not.toBe(
			await requestKey(new Request(url, { method: 'POST' }))
		);
	});

	it('differs for two URLs', async () => {
		expect(await requestKey(new Request(url))).not.toBe(
			await requestKey(new Request(tedNoticeXmlUrl('609956-2026')))
		);
	});

	it('differs for two bodies', async () => {
		const post = (body: string) => new Request(url, { method: 'POST', body });
		expect(await requestKey(post('{"page":1}'))).not.toBe(await requestKey(post('{"page":2}')));
	});

	it('reads the same URL written with another host case and the default port as one key', async () => {
		expect(
			await requestKey(new Request('https://TED.europa.eu:443/en/notice/609955-2026/xml'))
		).toBe(await requestKey(new Request(url)));
	});

	it('leaves the request body readable for the caller', async () => {
		const request = new Request(url, { method: 'POST', body: 'kept' });
		await requestKey(request);
		expect(await request.text()).toBe('kept');
	});
});

describe('createSnapshotTransport', () => {
	it('answers a recorded request with the recorded bytes', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const transport = await transportFor([NOTICE]);
		const response = await transport(new Request(tedNoticeXmlUrl(NOTICE)));
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array(readFileSync(capturePath(NOTICE)))
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('answers any other request with 599 naming the missing key, and never fetches', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const transport = await transportFor([NOTICE]);
		const missing = new Request(tedNoticeXmlUrl('609956-2026'));
		const key = await requestKey(missing);
		const response = await transport(missing);
		expect(response.status).toBe(599);
		expect(await response.text()).toContain(key);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('answers a recorded URL asked with another method as a miss', async () => {
		const transport = await transportFor([NOTICE]);
		const response = await transport(new Request(tedNoticeXmlUrl(NOTICE), { method: 'POST' }));
		expect(response.status).toBe(599);
	});
});

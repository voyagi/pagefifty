import { createHash } from 'node:crypto';
import http, { createServer, type Server } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALLOWED_HOSTS, isAllowedHost } from './outbound-host';

const REFUSED_URL = 'http://outbound-guard.invalid/';

describe('outbound guard in the node project', () => {
	let server: Server;
	let origin: string;

	beforeAll(async () => {
		const redirects: Record<string, [number, string]> = {
			'/redirect': [302, REFUSED_URL],
			'/relative': [302, '/'],
			'/see-other': [303, '/echo'],
			'/found': [302, '/echo'],
			'/moved': [301, '/echo'],
			'/temporary': [307, '/echo'],
			'/see-other-type': [303, '/echo-type'],
			'/temporary-type': [307, '/echo-type'],
			'/loop': [302, '/loop']
		};
		server = createServer((request, response) => {
			const hopsLeft = /^\/chain\/(\d+)$/.exec(request.url ?? '');
			if (hopsLeft) {
				const left = Number(hopsLeft[1]);
				if (left === 0) response.end('end of chain');
				else response.writeHead(302, { location: `/chain/${left - 1}` }).end();
				return;
			}
			if (request.url === '/no-location') {
				response.writeHead(302).end('no location');
				return;
			}
			const redirect = redirects[request.url ?? ''];
			if (redirect) {
				response.writeHead(redirect[0], { location: redirect[1] }).end();
				return;
			}
			if (request.url === '/echo-type') {
				response.writeHead(200).end(request.headers['content-type'] ?? 'none');
				return;
			}
			if (request.url === '/echo') {
				let body = '';
				request.on('data', (chunk: Buffer) => (body += chunk.toString()));
				request.on('end', () =>
					response.writeHead(200, { 'x-method': request.method }).end(`${request.method} ${body}`)
				);
				return;
			}
			response.writeHead(200, { 'content-type': 'text/plain' }).end('local');
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	});

	it('refuses fetch to a non-local host with OutboundGuardError', async () => {
		await expect(fetch(REFUSED_URL)).rejects.toMatchObject({ name: 'OutboundGuardError' });
	});

	it('names the refused host and the way out in its message', async () => {
		await expect(fetch(REFUSED_URL)).rejects.toThrow(
			/"outbound-guard\.invalid" refused: .*local fixture on 127\.0\.0\.1 or use the snapshot transport/
		);
	});

	it('refuses a socket to a non-local host with OutboundGuardError', () => {
		expect(() => net.connect(80, 'outbound-guard.invalid')).toThrow(
			expect.objectContaining({ name: 'OutboundGuardError' })
		);
	});

	// The setup file says http, https and tls go through the patched socket too. A client may throw
	// at once or report the refusal as an error event, so either counts.
	it.each([
		['a TLS socket', () => tls.connect(443, 'outbound-guard.invalid')],
		['an https request', () => https.get('https://outbound-guard.invalid/')],
		['an http request', () => http.get('http://outbound-guard.invalid/')]
	])('refuses %s to a non-local host with OutboundGuardError', async (_client, open) => {
		const refusal = await new Promise<unknown>((resolve) => {
			try {
				open().once('error', resolve);
			} catch (error) {
				resolve(error);
			}
		});
		expect(refusal).toMatchObject({ name: 'OutboundGuardError' });
	});

	it('lets fetch reach a server on 127.0.0.1', async () => {
		const response = await fetch(`${origin}/`);
		expect(await response.text()).toBe('local');
	});

	// The first hop is the caller's own request, so an option the guard never names still applies.
	it.each([
		['refuses', 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', false],
		['accepts', `sha256-${createHash('sha256').update('local').digest('base64')}`, true]
	])('%s a response against the caller integrity hash', async (_verdict, integrity, passes) => {
		const request = fetch(`${origin}/`, { integrity });
		if (passes) expect(await (await request).text()).toBe('local');
		else await expect(request).rejects.toThrow();
	});

	it('refuses a redirect from 127.0.0.1 to a non-local host', async () => {
		await expect(fetch(`${origin}/redirect`)).rejects.toMatchObject({
			name: 'OutboundGuardError'
		});
	});

	it('refuses a non-local host when the caller handles redirects itself', async () => {
		await expect(fetch(REFUSED_URL, { redirect: 'manual' })).rejects.toMatchObject({
			name: 'OutboundGuardError'
		});
	});

	it('hands a manual caller the redirect itself instead of following it', async () => {
		const response = await fetch(`${origin}/redirect`, { redirect: 'manual' });
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(REFUSED_URL);
	});

	it('follows a relative redirect on the same local server', async () => {
		expect(await (await fetch(`${origin}/relative`)).text()).toBe('local');
	});

	it.each([
		['POST', '/see-other', 'GET '],
		['POST', '/found', 'GET '],
		['POST', '/moved', 'GET '],
		['POST', '/temporary', 'POST hello'],
		['PUT', '/found', 'PUT hello'],
		['PUT', '/see-other', 'GET ']
	])('after a %s to %s the next hop sends %j', async (method, route, echoed) => {
		const response = await fetch(`${origin}${route}`, { method, body: 'hello' });
		expect(await response.text()).toBe(echoed);
	});

	// fetch drops the headers that describe a body together with the body.
	it.each([
		['/see-other-type', 'none'],
		['/temporary-type', 'text/plain;charset=UTF-8']
	])('after a POST to %s the next hop carries content type %j', async (route, expected) => {
		const response = await fetch(`${origin}${route}`, { method: 'POST', body: 'hello' });
		expect(await response.text()).toBe(expected);
	});

	it('keeps a HEAD a HEAD through a 303', async () => {
		const response = await fetch(`${origin}/see-other`, { method: 'HEAD' });
		expect(response.headers.get('x-method')).toBe('HEAD');
	});

	it('follows five redirects and gives up on the sixth', async () => {
		expect(await (await fetch(`${origin}/chain/5`)).text()).toBe('end of chain');
		await expect(fetch(`${origin}/chain/6`)).rejects.toThrow(/more than 5 redirects/);
		await expect(fetch(`${origin}/loop`)).rejects.toThrow(/more than 5 redirects/);
	});

	it('returns a redirect status that names no location instead of following it', async () => {
		const response = await fetch(`${origin}/no-location`);
		expect(response.status).toBe(302);
		expect(await response.text()).toBe('no location');
	});

	it.each([
		['a port and a host', (socket: net.Socket) => socket.connect(80, 'outbound-guard.invalid')],
		[
			'a port string and a host',
			(socket: net.Socket) => socket.connect('80' as never, 'outbound-guard.invalid')
		],
		[
			'an options object',
			(socket: net.Socket) => socket.connect({ port: 80, host: 'outbound-guard.invalid' })
		]
	])('refuses a socket given %s directly', (_shape, open) => {
		const socket = new net.Socket();
		expect(() => open(socket)).toThrow(expect.objectContaining({ name: 'OutboundGuardError' }));
		socket.destroy();
	});

	// A call that names no host means localhost to Node, which the guard must allow.
	it.each([
		['a port and an address', (port: number) => net.connect(port, '127.0.0.1')],
		[
			'a port string and an address',
			(port: number) => net.connect(String(port) as never, '127.0.0.1')
		],
		['a port alone', (port: number) => net.connect(port)],
		['a port alone on a new socket', (port: number) => new net.Socket().connect(port)],
		['an options object with no host', (port: number) => net.connect({ port })]
	])('lets a socket reach the local server given %s', async (_shape, open) => {
		const port = Number(new URL(origin).port);
		const socket = open(port);
		await new Promise<void>((resolve, reject) => {
			socket.once('connect', resolve);
			socket.once('error', reject);
		});
		expect(socket.remotePort).toBe(port);
		socket.destroy();
	});

	// Node connects to the pipe and ignores anything that looks like a host, so the guard must not
	// judge one. The names end or start with digits because only a name of digits alone is a port.
	it.each([
		[
			'options naming a host',
			(socket: net.Socket) =>
				socket.connect({
					path: String.raw`\\.\pipe\pagefifty-guard-none`,
					host: 'outbound-guard.invalid'
				} as never)
		],
		[
			'a name ending in digits and a host',
			(socket: net.Socket) =>
				socket.connect(
					String.raw`\\.\pipe\pagefifty-guard-1` as never,
					'outbound-guard.invalid' as never
				)
		],
		[
			'a name starting with digits and a host',
			(socket: net.Socket) =>
				socket.connect('1-pagefifty-guard' as never, 'outbound-guard.invalid' as never)
		]
	])('leaves a local pipe alone given %s', async (_shape, open) => {
		const socket = new net.Socket();
		const failed = new Promise<NodeJS.ErrnoException>((resolve) => socket.once('error', resolve));
		expect(() => open(socket)).not.toThrow();
		expect((await failed).code).toBe('ENOENT');
		socket.destroy();
	});

	it('allows exactly localhost, 127.0.0.1 and ::1 in both its forms', () => {
		expect([...ALLOWED_HOSTS].sort()).toEqual(['127.0.0.1', '::1', '[::1]', 'localhost']);
	});

	it.each([...ALLOWED_HOSTS, 'LOCALHOST'])('allows %s', (host) => {
		expect(isAllowedHost(host)).toBe(true);
	});

	it.each(['localhost.example.com', '127.0.0.1.nip.io', 'example.com', 'localhost.', ''])(
		'refuses %j',
		(host) => {
			expect(isAllowedHost(host)).toBe(false);
		}
	);
});

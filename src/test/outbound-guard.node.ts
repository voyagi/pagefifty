// Setup file for the node and jsdom projects. fetch is wrapped so a refused host fails with the
// named error, and net.Socket#connect is patched underneath it for http, https, tls and anything
// else that opens a socket without going through fetch. UDP, the DNS resolver, child processes
// and worker threads are not patched; the fetch-only-network rule in .dependency-cruiser.cjs keeps
// app code off those modules.
import net from 'node:net';
import { OutboundGuardError, guardFetch, isAllowedHost } from './outbound-host';

// net.connect hands Socket#connect its arguments pre-normalised as a single [options, callback]
// array, while direct callers pass (options), (port, host) or (path).
function targetHost(args: unknown[]): string | undefined {
	const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
	if (typeof first === 'object' && first !== null) {
		const options = first as { host?: unknown; path?: unknown };
		if (typeof options.path === 'string') return undefined;
		return typeof options.host === 'string' ? options.host : 'localhost';
	}
	if (typeof first === 'string' && !/^\d+$/.test(first)) return undefined;
	return typeof second === 'string' ? second : 'localhost';
}

function installGuard(): void {
	const realConnect = net.Socket.prototype.connect;
	net.Socket.prototype.connect = function guardedConnect(this: net.Socket, ...args: unknown[]) {
		const host = targetHost(args);
		if (host !== undefined && !isAllowedHost(host)) throw new OutboundGuardError(host);
		return Reflect.apply(realConnect, this, args) as net.Socket;
	} as typeof realConnect;
	globalThis.fetch = guardFetch(globalThis.fetch);
}

installGuard();

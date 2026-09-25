// Setup file for the workerd project. Only fetch is guarded here: cloudflare:sockets connect()
// and the WebSocket constructor are not. The fetch-only-network rule in .dependency-cruiser.cjs
// fails any app module that imports cloudflare:sockets.
import { guardFetch } from './outbound-host';

function installGuard(): void {
	globalThis.fetch = guardFetch(globalThis.fetch);
}

installGuard();

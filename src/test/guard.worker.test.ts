import { describe, expect, it } from 'vitest';
import wranglerConfig from '../../wrangler.jsonc?raw';
import { isAllowedHost } from './outbound-host';

describe('outbound guard in the workerd project', () => {
	it('runs inside the Workers runtime', () => {
		expect(navigator.userAgent).toBe('Cloudflare-Workers');
	});

	it('refuses fetch to a non-local host with OutboundGuardError', async () => {
		await expect(fetch('http://outbound-guard.invalid/')).rejects.toMatchObject({
			name: 'OutboundGuardError'
		});
	});

	it.each(['localhost', '127.0.0.1'])('allows %s', (host) => {
		expect(isAllowedHost(host)).toBe(true);
	});

	it.each(['localhost.example.com', '127.0.0.1.nip.io', 'example.com'])('refuses %s', (host) => {
		expect(isAllowedHost(host)).toBe(false);
	});

	it('reads repository files through a ?raw import', () => {
		expect(wranglerConfig).toContain('"compatibility_date"');
	});
});

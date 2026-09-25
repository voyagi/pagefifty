import { describe, expect, it } from 'vitest';
import { isAllowedHost } from './outbound-host';

describe('outbound guard in the jsdom project', () => {
	it('runs under jsdom', () => {
		expect(typeof document.createElement).toBe('function');
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
});

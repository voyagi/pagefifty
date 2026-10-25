import { readFileSync } from 'node:fs';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { handle } from '../../hooks.server';
import { SECURITY_HEADERS, withSecurityHeaders } from './security-headers';

// Mozilla's web security guideline lists these three referrer policies as unsafe.
const UNSAFE_REFERRER = ['unsafe-url', 'no-referrer-when-downgrade', 'origin-when-cross-origin'];
const SIX_MONTHS = 15_768_000;

function securityHeadersOf(headers: Headers): Record<string, string | null> {
	return Object.fromEntries(Object.keys(SECURITY_HEADERS).map((name) => [name, headers.get(name)]));
}

// Cloudflare's _headers format: a URL pattern at the start of a line, then its indented
// "Name: value" lines. Comments start with #.
function rulesFor(text: string, pattern: string): Record<string, string> {
	const rules: Record<string, string> = {};
	let inRule = false;
	for (const line of text.split(/\r?\n/)) {
		if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
		if (!/^\s/.test(line)) {
			inRule = line.trim() === pattern;
			continue;
		}
		if (!inRule) continue;
		const colon = line.indexOf(':');
		rules[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
	}
	return rules;
}

describe('the security headers', () => {
	it('hold HSTS to six months or more, nosniff, and a referrer policy Mozilla calls safe', () => {
		const maxAge = /max-age=(\d+)/.exec(SECURITY_HEADERS['Strict-Transport-Security']);
		expect(Number(maxAge?.[1])).toBeGreaterThanOrEqual(SIX_MONTHS);
		expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
		expect(UNSAFE_REFERRER).not.toContain(SECURITY_HEADERS['Referrer-Policy']);
	});

	it('are set on the response itself when its headers can change', () => {
		const response = new Response('page', {
			status: 404,
			headers: { 'content-type': 'text/html' }
		});
		const result = withSecurityHeaders(response);
		expect(result).toBe(response);
		expect(result.headers.get('content-type')).toBe('text/html');
		expect(securityHeadersOf(result.headers)).toEqual(SECURITY_HEADERS);
	});

	it('are set on a copy when the headers are immutable, keeping status and location', () => {
		const redirect = Response.redirect('https://example.org/next', 302);
		expect(() => redirect.headers.set('x-probe', '1')).toThrow(TypeError);
		const result = withSecurityHeaders(redirect);
		expect(result).not.toBe(redirect);
		expect(result.status).toBe(302);
		expect(result.headers.get('location')).toBe('https://example.org/next');
		expect(securityHeadersOf(result.headers)).toEqual(SECURITY_HEADERS);
	});

	it('rethrow an error that is not the immutable-headers TypeError', () => {
		const failing = {
			headers: {
				set() {
					throw new RangeError('not immutable');
				}
			}
		} as unknown as Response;
		expect(() => withSecurityHeaders(failing)).toThrow(RangeError);
	});

	it('are added by the page hook to what SvelteKit resolved', async () => {
		const response = await handle({
			event: {} as RequestEvent,
			resolve: async () => new Response('page')
		});
		expect(securityHeadersOf(response.headers)).toEqual(SECURITY_HEADERS);
	});

	it('match the root _headers file, which static files get instead of the hook', () => {
		expect(rulesFor(readFileSync('_headers', 'utf8'), '/*')).toEqual(SECURITY_HEADERS);
	});
});

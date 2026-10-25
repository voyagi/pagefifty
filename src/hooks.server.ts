import type { Handle } from '@sveltejs/kit';
import { withSecurityHeaders } from '$lib/server/security-headers';

export const handle: Handle = async ({ event, resolve }) =>
	withSecurityHeaders(await resolve(event));

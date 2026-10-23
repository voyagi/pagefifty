import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_PROFILE } from '../profile/demo-firm';
import { lotVerdict } from './verdict-view';

// read() needs the adapter's implementation, which only a built app provides. The stand-in reads the
// generated file from disk, as the server's own tests do.
const read = vi.hoisted(() =>
	vi.fn(
		(url: string) => new Response(readFileSync(url.replace(/^\//, '').replace(/\?.*$/, ''), 'utf8'))
	)
);
vi.mock('$app/server', () => ({ read }));

const { FEATURED_NOTICE, loadExamplePage } = await import('../server/tenders');

// The example opens the featured notice first because it is a near miss for the demo firm. The server
// tests check that it is opened; whether it is a near miss needs the profile, which no server module
// may reach, so it is asked here.
describe('the featured example notice', () => {
	it('reads Not met alone on its first decided lot for the demo firm', async () => {
		const { tender } = await loadExamplePage({ notice: FEATURED_NOTICE });
		const verdicts = tender.lots.map(
			(lot) => lotVerdict(lot, DEMO_PROFILE, tender.now, tender.documents)?.decision.verdict
		);
		expect(verdicts.find((verdict) => verdict !== undefined)).toBe('PARTNER NEEDED');
	});
});

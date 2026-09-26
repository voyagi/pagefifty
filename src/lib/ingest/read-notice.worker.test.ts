import { describe, expect, it } from 'vitest';
import largest from '../../../examples/2026-09-15/xml/600457-2026.xml?raw';
import oneLot from '../../../examples/2026-09-15/xml/609955-2026.xml?raw';
import { FIXTURE_ROLES, buildSynthetic } from '../../test/fixtures/roles';
import { MAX_NOTICE_BYTES, readNotice } from './read-notice';

const encode = (text: string) => new TextEncoder().encode(text);

// The same reader the build runs, inside workerd. Deployed Workers do not advance timers during
// CPU work, so a local reading of 0 ms says the timer stood still, not that parsing took no time;
// the milliseconds are logged for the plan summary and never held to a bound here.
describe('readNotice under workerd', () => {
	it('reads the largest capture notice with its 17 lots and logs the parse time', () => {
		expect(FIXTURE_ROLES.largest.notices.map((ref) => ref.notice)).toEqual(['600457-2026']);
		const bytes = encode(largest);
		expect(bytes.byteLength).toBeGreaterThan(350_000);
		expect(bytes.byteLength).toBeLessThan(MAX_NOTICE_BYTES);
		const started = performance.now();
		const result = readNotice(bytes, { noticeNumber: '600457-2026' });
		const ms = performance.now() - started;
		const advanced = ms > 0 ? '' : ' (the timer did not advance)';
		console.log(`parse 600457-2026: ${ms.toFixed(1)} ms in workerd${advanced}`);
		expect(result.ok && result.record.lots).toHaveLength(17);
	});

	it('refuses a DOCTYPE declaring an entity with the doctype kind', () => {
		expect(FIXTURE_ROLES['doctype-entity'].derivedFrom).toBe('609955-2026');
		const text = buildSynthetic('doctype-entity', oneLot);
		const result = readNotice(encode(text), { noticeNumber: '609955-2026' });
		expect(result.ok ? undefined : result.kind).toBe('doctype');
	});

	it('reads the one-lot notice to the same criteria it has in node', () => {
		const result = readNotice(encode(oneLot), { noticeNumber: '609955-2026' });
		const codes = result.ok
			? result.record.lots[0].criteria.map((criterion) => criterion.code)
			: [];
		expect(codes).toEqual([
			'slc-stand-other',
			'slc-suit-reg-trade',
			'slc-suit-reg-prof',
			'slc-stand-to-gen',
			'slc-stand-ins',
			'slc-stand-other'
		]);
	});
});

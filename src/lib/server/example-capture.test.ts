import { readdirSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { CAPTURE_ID } from '../snapshot/capture-id';

vi.mock('$app/server', () => ({ read: vi.fn() }));

// No tracked capture holds an openAfter yet, so the real rule answers 2026-09-15 and a records.ts
// that wrote the day in by hand would read the same. A rule that answers another day tells them apart.
const exampleCaptureOf = vi.hoisted(() =>
	vi.fn((lines: Iterable<readonly [string, { readonly id?: string }]>) => {
		void lines;
		return '2026-11-02';
	})
);
vi.mock('../snapshot/capture-id', async (importOriginal) => ({
	...(await importOriginal<typeof import('../snapshot/capture-id')>()),
	exampleCaptureOf
}));

const { EXAMPLE_CAPTURE } = await import('./records');

it('records.ts takes the example from exampleCaptureOf over every built capture line', () => {
	expect(EXAMPLE_CAPTURE).toBe('2026-11-02');
	expect(exampleCaptureOf).toHaveBeenCalledTimes(1);
	const built = readdirSync('src/lib/snapshot/generated')
		.filter((name) => CAPTURE_ID.test(name))
		.sort();
	const [lines] = exampleCaptureOf.mock.calls[0];
	const handed = [...lines].map(([id, line]) => [id, line.id]);
	expect(handed.sort()).toEqual(built.map((id) => [id, id]));
});

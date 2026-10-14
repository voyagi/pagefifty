import { describe, expect, it } from 'vitest';
import { parseCaptureArgs } from './args.ts';

const DAY = '2026-10-11';

function refusal(argv: readonly string[]): string {
	const parsed = parseCaptureArgs(argv, DAY);
	if (parsed.ok) throw new Error(`expected ${JSON.stringify(argv)} to be refused`);
	return parsed.message;
}

describe('parseCaptureArgs', () => {
	it('opens the window 14 days before the capture day when no flag is given', () => {
		expect(parseCaptureArgs([], DAY)).toEqual({ ok: true, since: '20260927' });
	});

	it('takes --since as the first publication day', () => {
		expect(parseCaptureArgs(['--since', '20260920'], DAY)).toEqual({
			ok: true,
			since: '20260920'
		});
	});

	it('takes --since on the capture day itself and on a leap day', () => {
		expect(parseCaptureArgs(['--since', '20261011'], DAY)).toEqual({
			ok: true,
			since: '20261011'
		});
		expect(parseCaptureArgs(['--since', '20240229'], DAY)).toEqual({
			ok: true,
			since: '20240229'
		});
	});

	it('refuses an unknown flag, naming it', () => {
		const message = refusal(['--folder', 'x']);
		expect(message).toContain('"--folder"');
		expect(message).toContain('--since <YYYYMMDD>');
	});

	it('refuses a word that is not a flag, and the --since=value spelling, naming each', () => {
		expect(refusal(['x'])).toContain('"x"');
		expect(refusal(['--since=20260920'])).toContain('"--since=20260920"');
	});

	it('refuses --since with no value', () => {
		expect(refusal(['--since'])).toBe(
			'--since needs a date written YYYYMMDD, for example 20260920'
		);
		expect(refusal(['--since', '--since'])).toContain('"--since"');
	});

	it('refuses a --since that is not 8 digits', () => {
		expect(refusal(['--since', '2026092'])).toBe(
			'--since "2026092" is not a date written YYYYMMDD, for example 20260920'
		);
		expect(refusal(['--since', '2026-09-20'])).toContain('"2026-09-20"');
		// Arabic-Indic digits for 20260920: digits, but not the ASCII ones a date is written in.
		const arabicIndic = String.fromCodePoint(...[2, 0, 2, 6, 0, 9, 2, 0].map((d) => 0x0660 + d));
		expect(refusal(['--since', arabicIndic])).toContain('is not a date written YYYYMMDD');
	});

	it('refuses 8 digits that form no real date', () => {
		expect(refusal(['--since', '20260931'])).toBe(
			'--since "20260931" is not a real date; write a day that exists, as YYYYMMDD'
		);
		expect(refusal(['--since', '20260229'])).toContain('not a real date');
		expect(refusal(['--since', '20261301'])).toContain('not a real date');
	});

	it('refuses a --since after the capture day', () => {
		expect(refusal(['--since', '20261012'])).toBe(
			'--since "20261012" is after the capture day 2026-10-11; the window must start on or before it'
		);
	});

	it('refuses --since given twice', () => {
		expect(refusal(['--since', '20260920', '--since', '20260921'])).toBe(
			'--since is given twice; give it once'
		);
	});
});

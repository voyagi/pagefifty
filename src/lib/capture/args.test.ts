import { describe, expect, it } from 'vitest';
import { MAX_CAP, parseCaptureArgs } from './args.ts';

const DAY = '2026-10-11';
const PLAIN = { live: false, cap: null };

function refusal(argv: readonly string[]): string {
	const parsed = parseCaptureArgs(argv, DAY);
	if (parsed.ok) throw new Error(`expected ${JSON.stringify(argv)} to be refused`);
	return parsed.message;
}

describe('parseCaptureArgs', () => {
	it('opens the window 14 days before the capture day when no flag is given', () => {
		expect(parseCaptureArgs([], DAY)).toEqual({ ok: true, since: '20260927', ...PLAIN });
	});

	it('takes --since as the first publication day', () => {
		expect(parseCaptureArgs(['--since', '20260920'], DAY)).toEqual({
			ok: true,
			since: '20260920',
			...PLAIN
		});
	});

	it('takes --since on the capture day itself and on a leap day', () => {
		expect(parseCaptureArgs(['--since', '20261011'], DAY)).toEqual({
			ok: true,
			since: '20261011',
			...PLAIN
		});
		expect(parseCaptureArgs(['--since', '20240229'], DAY)).toEqual({
			ok: true,
			since: '20240229',
			...PLAIN
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

describe('parseCaptureArgs: --live and --cap', () => {
	it('takes --live with --cap, in either order and beside --since', () => {
		expect(parseCaptureArgs(['--live', '--cap', '5'], DAY)).toEqual({
			ok: true,
			since: '20260927',
			live: true,
			cap: 5
		});
		expect(parseCaptureArgs(['--cap', '7', '--since', '20260920', '--live'], DAY)).toEqual({
			ok: true,
			since: '20260920',
			live: true,
			cap: 7
		});
	});

	it('refuses --live without --cap', () => {
		expect(refusal(['--live'])).toContain('--live needs --cap');
		expect(refusal(['--since', '20260920', '--live'])).toContain('--live needs --cap');
	});

	it('takes --cap without --live, for a dry run', () => {
		expect(parseCaptureArgs(['--cap', '3'], DAY)).toEqual({
			ok: true,
			since: '20260927',
			live: false,
			cap: 3
		});
	});

	it.each(['0', '7', '1000'])('takes --cap %j', (value) => {
		expect(parseCaptureArgs(['--live', '--cap', value], DAY)).toMatchObject({
			ok: true,
			cap: Number(value)
		});
	});

	it('caps at 1000', () => {
		expect(MAX_CAP).toBe(1000);
	});

	it.each(['-1', '1001', '1.5', '1e3', ' 3', '03x', ''])('refuses --cap %j, naming it', (value) => {
		const message = refusal(['--live', '--cap', value]);
		expect(message).toContain(`--cap ${JSON.stringify(value)}`);
		expect(message).toContain('0 to 1000');
	});

	it('refuses --cap with no value, naming the range', () => {
		expect(refusal(['--cap'])).toContain('--cap needs a whole number from 0 to 1000');
		expect(refusal(['--cap', '--live'])).toContain('"--live"');
	});

	it('refuses --live or --cap given twice', () => {
		expect(refusal(['--live', '--live', '--cap', '1'])).toBe('--live is given twice; give it once');
		expect(refusal(['--live', '--cap', '1', '--cap', '2'])).toBe(
			'--cap is given twice; give it once'
		);
	});

	it('names every flag when it refuses an unknown one', () => {
		const message = refusal(['--dry-run']);
		expect(message).toContain('"--dry-run"');
		expect(message).toContain('--live');
		expect(message).toContain('--cap <n>');
	});
});

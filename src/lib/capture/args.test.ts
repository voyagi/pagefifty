import { describe, expect, it } from 'vitest';
import { MAX_CAP, parseCaptureArgs } from './args.ts';

const DAY = '2026-10-11';
const PLAIN = { live: false, cap: null, openAfter: null };

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
			cap: 5,
			openAfter: null
		});
		expect(parseCaptureArgs(['--cap', '7', '--since', '20260920', '--live'], DAY)).toEqual({
			ok: true,
			since: '20260920',
			live: true,
			cap: 7,
			openAfter: null
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
			cap: 3,
			openAfter: null
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
		expect(message).toContain('--open-after <instant>');
	});
});

describe('parseCaptureArgs: --open-after', () => {
	it.each([
		['2026-10-30T17:00:00Z', '2026-10-30T17:00:00.000Z'],
		['2026-10-30T18:00:00+01:00', '2026-10-30T17:00:00.000Z'],
		['2026-10-30T19:00:00+02:00', '2026-10-30T17:00:00.000Z'],
		['2026-10-30T16:59:59.999Z', '2026-10-30T16:59:59.999Z'],
		['2024-02-29T00:00:00-05:00', '2024-02-29T05:00:00.000Z']
	])('takes --open-after %j as the instant %j', (value, instant) => {
		expect(parseCaptureArgs(['--open-after', value], DAY)).toEqual({
			ok: true,
			since: '20260927',
			live: false,
			cap: null,
			openAfter: instant
		});
	});

	it.each([
		['a bare date', '2026-10-30'],
		['a local time with no zone', '2026-10-30T17:00:00'],
		['a leading space', ' 2026-10-30T17:00:00Z'],
		['an offset without its colon', '2026-10-30T17:00:00+0100'],
		['hour 24', '2026-10-30T24:00:00Z'],
		['minutes without seconds', '2026-10-30T17:00Z'],
		['lower-case letters', '2026-10-30t17:00:00z'],
		['an expanded year', '+002026-10-30T17:00:00Z']
	])('--open-after refuses what is not an instant: %s', (_label, value) => {
		expect(refusal(['--open-after', value])).toBe(
			`--open-after ${JSON.stringify(value)} is not an instant written YYYY-MM-DDTHH:MM:SS with Z or an offset such as +01:00`
		);
	});

	it.each([
		'2026-13-01T00:00:00Z',
		'2026-02-30T00:00:00Z',
		'2026-04-31T12:00:00+02:00',
		'2025-02-29T00:00:00Z'
	])('refuses --open-after %j, a day that does not exist', (value) => {
		expect(refusal(['--open-after', value])).toBe(
			`--open-after ${JSON.stringify(value)} is not a real date; write a day that exists`
		);
	});

	it('refuses --open-after with no value, naming the form', () => {
		expect(refusal(['--open-after'])).toBe(
			'--open-after needs an instant written YYYY-MM-DDTHH:MM:SS with Z or an offset such as +01:00, for example 2026-10-30T17:00:00Z'
		);
		expect(refusal(['--open-after', '--live'])).toContain('not "--live"');
	});

	it('refuses --open-after given twice', () => {
		expect(
			refusal(['--open-after', '2026-10-30T17:00:00Z', '--open-after', '2026-10-31T17:00:00Z'])
		).toBe('--open-after is given twice; give it once');
	});
});

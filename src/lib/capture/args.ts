// The capture command's flags (D-02, D-05). No flag names the folder: its date always comes from
// the clock. Plan 01.1-08 adds --live and --cap here. Imported under Node type stripping: erasable
// syntax only.
import { defaultSince } from './capture-folder.ts';

type ParsedArgs = { ok: true; since: string } | { ok: false; message: string };

const DATE_DIGITS = /^[0-9]{8}$/;
const WRITTEN_AS = 'a date written YYYYMMDD';

// 20260931 is eight digits but no day: Date.UTC rolls it into October, so the round trip must give
// back the same year, month and day.
function isRealDay(digits: string): boolean {
	const [year, month, day] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6)].map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function checkSince(value: string | undefined, captureDay: string): ParsedArgs {
	if (value === undefined || value.startsWith('--')) {
		const found = value === undefined ? 'for example 20260920' : `not ${JSON.stringify(value)}`;
		return { ok: false, message: `--since needs ${WRITTEN_AS}, ${found}` };
	}
	const quoted = JSON.stringify(value);
	if (!DATE_DIGITS.test(value)) {
		return { ok: false, message: `--since ${quoted} is not ${WRITTEN_AS}, for example 20260920` };
	}
	if (!isRealDay(value)) {
		return {
			ok: false,
			message: `--since ${quoted} is not a real date; write a day that exists, as YYYYMMDD`
		};
	}
	if (value > captureDay.replaceAll('-', '')) {
		return {
			ok: false,
			message: `--since ${quoted} is after the capture day ${captureDay}; the window must start on or before it`
		};
	}
	return { ok: true, since: value };
}

export function parseCaptureArgs(argv: readonly string[], captureDay: string): ParsedArgs {
	let since: string | undefined;
	for (let index = 0; index < argv.length; index += 2) {
		const flag = argv[index];
		if (flag !== '--since') {
			return {
				ok: false,
				message: `unknown argument ${JSON.stringify(flag)}; the only flag is --since <YYYYMMDD>`
			};
		}
		if (since !== undefined) return { ok: false, message: '--since is given twice; give it once' };
		const checked = checkSince(argv[index + 1], captureDay);
		if (!checked.ok) return checked;
		since = checked.since;
	}
	return { ok: true, since: since ?? defaultSince(captureDay) };
}

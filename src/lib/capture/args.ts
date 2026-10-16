// The capture command's flags (D-02, D-05, D-21, D-24). No flag names the folder: its date always
// comes from the clock. Imported under Node type stripping: erasable syntax only.
import { defaultSince } from './capture-folder.ts';

type ParsedArgs =
	{ ok: true; since: string; live: boolean; cap: number | null } | { ok: false; message: string };

type Refusal = { ok: false; message: string };

interface Flags {
	since?: string;
	live: boolean;
	cap: number | null;
}

const DATE_DIGITS = /^[0-9]{8}$/;
const WRITTEN_AS = 'a date written YYYYMMDD';
const CAP_DIGITS = /^[0-9]+$/;
const FLAGS = '--since <YYYYMMDD>, --live and --cap <n>';

// One model read plus one repair retry per notice over a capture of about 363 notices is about 726
// attempts, so 1000 bounds the worst case with headroom (D-24).
export const MAX_CAP = 1000;
const CAP_RANGE = `a whole number from 0 to ${MAX_CAP}`;

const refuse = (message: string): Refusal => ({ ok: false, message });

// 20260931 is eight digits but no day: Date.UTC rolls it into October, so the round trip must give
// back the same year, month and day.
function isRealDay(digits: string): boolean {
	const [year, month, day] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6)].map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function checkSince(value: string | undefined, captureDay: string): string | Refusal {
	if (value === undefined || value.startsWith('--')) {
		const found = value === undefined ? 'for example 20260920' : `not ${JSON.stringify(value)}`;
		return refuse(`--since needs ${WRITTEN_AS}, ${found}`);
	}
	const quoted = JSON.stringify(value);
	if (!DATE_DIGITS.test(value)) {
		return refuse(`--since ${quoted} is not ${WRITTEN_AS}, for example 20260920`);
	}
	if (!isRealDay(value)) {
		return refuse(`--since ${quoted} is not a real date; write a day that exists, as YYYYMMDD`);
	}
	if (value > captureDay.replaceAll('-', '')) {
		return refuse(
			`--since ${quoted} is after the capture day ${captureDay}; the window must start on or before it`
		);
	}
	return value;
}

// Plain ASCII digits only, so " 3", "1e3", "0x10" and "1.5" never pass as a number.
function checkCap(value: string | undefined): number | Refusal {
	if (value === undefined || value.startsWith('--')) {
		const found = value === undefined ? '' : `, not ${JSON.stringify(value)}`;
		return refuse(`--cap needs ${CAP_RANGE}${found}`);
	}
	const cap = CAP_DIGITS.test(value) ? Number(value) : Number.NaN;
	if (!(cap <= MAX_CAP)) {
		return refuse(`--cap ${JSON.stringify(value)} is not ${CAP_RANGE}`);
	}
	return cap;
}

const twice = (flag: string) => refuse(`${flag} is given twice; give it once`);

// Reads the flag at index into flags and returns how many arguments it took, or the refusal.
function readFlag(
	argv: readonly string[],
	index: number,
	flags: Flags,
	captureDay: string
): number | Refusal {
	const flag = argv[index];
	if (flag === '--live') {
		if (flags.live) return twice('--live');
		flags.live = true;
		return 1;
	}
	if (flag === '--since') {
		if (flags.since !== undefined) return twice('--since');
		const since = checkSince(argv[index + 1], captureDay);
		if (typeof since !== 'string') return since;
		flags.since = since;
		return 2;
	}
	if (flag === '--cap') {
		if (flags.cap !== null) return twice('--cap');
		const cap = checkCap(argv[index + 1]);
		if (typeof cap !== 'number') return cap;
		flags.cap = cap;
		return 2;
	}
	return refuse(`unknown argument ${JSON.stringify(flag)}; the flags are ${FLAGS}`);
}

export function parseCaptureArgs(argv: readonly string[], captureDay: string): ParsedArgs {
	const flags: Flags = { live: false, cap: null };
	for (let index = 0; index < argv.length;) {
		const taken = readFlag(argv, index, flags, captureDay);
		if (typeof taken !== 'number') return taken;
		index += taken;
	}
	// A forgotten cap must never mean an unlimited live run.
	if (flags.live && flags.cap === null) {
		return refuse(
			`--live needs --cap <n>, the most metered calls the run may attempt (0 to ${MAX_CAP})`
		);
	}
	return {
		ok: true,
		since: flags.since ?? defaultSince(captureDay),
		live: flags.live,
		cap: flags.cap
	};
}

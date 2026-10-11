import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Cloudflare's compatibility-flags docs: from this compatibility date Node compat is on by default
// unless no_nodejs_compat is set, and the installed miniflare carries the same constant
// (NODEJS_COMPAT_DEFAULT_ON_DATE). With Node compat on, process.env holds every text binding,
// secrets included, unless the do-not flag is set.
const NODE_COMPAT_DEFAULT_ON = '2026-08-04';
const DO_NOT = 'nodejs_compat_do_not_populate_process_env';

function nodeCompatOn(date: string, flags: readonly string[]): boolean {
	const byFlag = flags.some((flag) => flag.startsWith('nodejs_compat') && flag !== DO_NOT);
	const byDate = date >= NODE_COMPAT_DEFAULT_ON && !flags.includes('no_nodejs_compat');
	return byFlag || byDate;
}

// Stricter than the runtime on purpose: disallow_importable_env or a date before process.env
// population began also keep it empty, but neither is accepted here, so the one flag is the rule.
function configProblem(date: string | undefined, flags: readonly string[]): string | undefined {
	if (date === undefined) return 'no compatibility_date';
	if (nodeCompatOn(date, flags) && !flags.includes(DO_NOT)) {
		return `Node compat is on (date ${date}, flags ${JSON.stringify(flags)}) without ${DO_NOT}`;
	}
	return undefined;
}

// TypeScript's parser reads comments, trailing commas and a // inside a string, where a regex
// stripper breaks on the $schema path.
function readJsonc(name: string, text: string): unknown {
	const { config, error } = ts.parseConfigFileTextToJson(name, text);
	if (error) throw new Error(`${name}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`);
	return config;
}

interface CompatSettings {
	compatibility_date?: string;
	compatibility_flags?: string[];
}

interface WranglerConfig extends CompatSettings {
	env?: Record<string, CompatSettings>;
}

function configProblems(name: string, text: string): string[] {
	if (name.endsWith('.toml')) {
		return [`${name}: a TOML Wrangler config, which this check cannot read`];
	}
	const config = readJsonc(name, text) as WranglerConfig;
	const date = config.compatibility_date;
	const flags = config.compatibility_flags ?? [];
	const problems: string[] = [];
	const top = configProblem(date, flags);
	if (top) problems.push(`${name}: ${top}`);
	for (const [envName, block] of Object.entries(config.env ?? {})) {
		if (block.compatibility_date === undefined && block.compatibility_flags === undefined) continue;
		const problem = configProblem(
			block.compatibility_date ?? date,
			block.compatibility_flags ?? flags
		);
		if (problem) problems.push(`${name} env.${envName}: ${problem}`);
	}
	return problems;
}

function trackedProblems(paths: readonly string[], read: (path: string) => string): string[] {
	if (paths.length === 0) return ['no Wrangler config tracked'];
	return paths.flatMap((path) => configProblems(path, read(path)));
}

const CONFIG_NAMES = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'];

// Tracked files are what deploys, at any depth.
function trackedConfigs(): string[] {
	const patterns = CONFIG_NAMES.flatMap((name) => [name, `**/${name}`]);
	return execFileSync('git', ['ls-files', '--', ...patterns], { encoding: 'utf8' })
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

interface Row {
	label: string;
	date: string;
	flags: string[];
	populates: boolean;
}

const FLAG_SETS: { label: string; flags: string[] }[] = [
	{ label: 'both flags', flags: ['nodejs_compat', DO_NOT] },
	{ label: 'nodejs_compat alone', flags: ['nodejs_compat'] },
	{ label: 'the do-not flag alone', flags: [DO_NOT] },
	{ label: 'neither flag', flags: [] }
];

const POPULATES: Record<string, boolean> = {
	'both flags 2026-08-03': false,
	'both flags 2026-09-16': false,
	'nodejs_compat alone 2026-08-03': true,
	'nodejs_compat alone 2026-09-16': true,
	'the do-not flag alone 2026-08-03': false,
	'the do-not flag alone 2026-09-16': false,
	'neither flag 2026-08-03': false,
	'neither flag 2026-09-16': true,
	'no_nodejs_compat alone 2026-09-16': false
};

const ROWS: Row[] = [
	...FLAG_SETS.flatMap(({ label, flags }) =>
		['2026-08-03', '2026-09-16'].map((date) => ({
			label: `${label} ${date}`,
			date,
			flags,
			populates: POPULATES[`${label} ${date}`]
		}))
	),
	{
		label: 'no_nodejs_compat alone 2026-09-16',
		date: '2026-09-16',
		flags: ['no_nodejs_compat'],
		populates: POPULATES['no_nodejs_compat alone 2026-09-16']
	}
];

describe('the Node compat rule', () => {
	it('has a row for every flag set at both dates plus no_nodejs_compat', () => {
		expect(ROWS.map((row) => row.label).sort()).toEqual(Object.keys(POPULATES).sort());
	});

	it.each(ROWS)('$label: a problem exactly when process.env is populated', (row) => {
		expect(configProblem(row.date, row.flags) !== undefined).toBe(row.populates);
	});

	it('names the date, the flags and the missing flag', () => {
		expect(configProblem('2026-09-16', ['nodejs_als'])).toBe(
			`Node compat is on (date 2026-09-16, flags ["nodejs_als"]) without ${DO_NOT}`
		);
	});

	it('accepts neither disallow_importable_env nor an old date in place of the flag', () => {
		expect(configProblem('2026-09-16', ['nodejs_compat', 'disallow_importable_env'])).toMatch(
			DO_NOT
		);
		expect(configProblem('2025-03-31', ['nodejs_compat'])).toMatch(DO_NOT);
	});

	it('refuses a config with no compatibility date', () => {
		expect(configProblem(undefined, [DO_NOT])).toBe('no compatibility_date');
	});
});

describe('the tracked config scan', () => {
	const read = (texts: Record<string, string>) => (path: string) => texts[path];

	it('fails when no config is tracked', () => {
		expect(trackedProblems([], read({}))).toEqual(['no Wrangler config tracked']);
	});

	it('fails on a tracked TOML config, naming it', () => {
		expect(trackedProblems(['worker/wrangler.toml'], read({ 'worker/wrangler.toml': '' }))).toEqual(
			['worker/wrangler.toml: a TOML Wrangler config, which this check cannot read']
		);
	});

	it('fails on a planted config with nodejs_compat and no do-not flag', () => {
		const planted =
			'{\n\t// a comment\n\t"$schema": "https://example.org/x",\n\t"compatibility_date": "2026-09-16",\n\t"compatibility_flags": ["nodejs_compat"],\n}\n';
		expect(trackedProblems(['wrangler.jsonc'], read({ 'wrangler.jsonc': planted }))).toEqual([
			`wrangler.jsonc: Node compat is on (date 2026-09-16, flags ["nodejs_compat"]) without ${DO_NOT}`
		]);
	});

	it('checks each env block that sets a date or flags, inheriting what it leaves out', () => {
		const config = JSON.stringify({
			compatibility_date: '2026-08-03',
			compatibility_flags: [DO_NOT],
			env: {
				staging: { compatibility_date: '2026-09-16' },
				old: { compatibility_flags: ['nodejs_compat'] },
				quiet: { vars: {} }
			}
		});
		expect(trackedProblems(['wrangler.json'], read({ 'wrangler.json': config }))).toEqual([
			`wrangler.json env.old: Node compat is on (date 2026-08-03, flags ["nodejs_compat"]) without ${DO_NOT}`
		]);
	});

	it('finds no problem in the tracked Wrangler configs', () => {
		const paths = trackedConfigs();
		expect(paths).toContain('wrangler.jsonc');
		expect(trackedProblems(paths, (path) => readFileSync(path, 'utf8'))).toEqual([]);
	});
});

const WRANGLER = resolve('node_modules', 'wrangler', 'bin', 'wrangler.js');
const WRANGLER_VERSION = (
	JSON.parse(readFileSync(resolve('node_modules', 'wrangler', 'package.json'), 'utf8')) as {
		version: string;
	}
).version;

function wranglerDeclaresProcessEnv(date: string, flags: readonly string[]): boolean {
	const folder = mkdtempSync(join(tmpdir(), 'pagefifty-wrangler-oracle-'));
	try {
		const config = {
			name: 'probe',
			compatibility_date: date,
			compatibility_flags: flags,
			vars: { PROBE_TEXT: 'x' }
		};
		writeFileSync(join(folder, 'wrangler.jsonc'), JSON.stringify(config));
		writeFileSync(join(folder, 'empty.env'), '');
		const run = spawnSync(
			process.execPath,
			[WRANGLER, 'types', 'probe.d.ts', '--config', 'wrangler.jsonc', '--env-file', 'empty.env'],
			{
				cwd: folder,
				encoding: 'utf8',
				// The banner's update check is the one network call wrangler types makes.
				env: {
					...process.env,
					WRANGLER_SEND_METRICS: 'false',
					WRANGLER_HIDE_BANNER: 'true',
					CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false'
				}
			}
		);
		if (run.status !== 0) {
			// A run that never started or ended on a signal has no status; say which.
			const how = run.error
				? `could not run (${run.error.message})`
				: run.signal
					? `ended on ${run.signal}`
					: `exited ${run.status}`;
			throw new Error(`wrangler ${WRANGLER_VERSION} types ${how}: ${run.stderr}`);
		}
		return readFileSync(join(folder, 'probe.d.ts'), 'utf8').includes('interface ProcessEnv');
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

describe('the rule against the installed wrangler', { timeout: 120_000 }, () => {
	it.each(ROWS)('$label: wrangler types agrees with the rule', (row) => {
		const expected = nodeCompatOn(row.date, row.flags) && !row.flags.includes(DO_NOT);
		expect(
			wranglerDeclaresProcessEnv(row.date, row.flags),
			`the rule and wrangler ${WRANGLER_VERSION} disagree on ${row.label}`
		).toBe(expected);
		expect(expected).toBe(row.populates);
	});
});

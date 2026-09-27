#!/usr/bin/env node
// svelte-state.mutants.mjs - prove the tests of the two rune modules are NON-VACUOUS, rule by rule.
//
// stryker.config.json leaves every src/lib/**/*.svelte.ts file out of its mutate list, so the profile
// store and the theme controller get their planted defects here instead. Each mutation disables ONE
// rule of src/lib/profile/store.svelte.ts or src/lib/theme/theme.svelte.ts, and the test it NAMES
// must then fail. The verdict is read from vitest's JSON report, test by test, for the reason
// verdict.mutants.mjs gives: a non-zero exit alone also comes from a mutant that no longer compiles.
//
// The working tree is never touched. Each mutation runs the jsdom project through a vitest config
// written to its own folder under .stryker-tmp/svelte-mutants/<run id>/<mutation>/ (gitignored). That
// config is the repo's own vite.config.ts plus one plugin that serves the mutated source in place of
// the module file, so the Svelte compiler, the setup files and the test run exactly as in npm test.
// The plugin leaves a marker when it serves the module, and a run without that marker is no verdict:
// a mutation that never reached the test asked nothing. The run folder is removed at the end.
//
// Usage:  node scripts/svelte-state.mutants.mjs [--only <substring>]
// Exit codes: 0 every mutation failed its named test, 1 a mutation escaped or asked no question,
// 2 a broken setup (baseline not green, a stale anchor, an unknown named test, bad arguments).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

// A lowercase drive letter in the working folder makes vitest fail every suite, so the root always
// carries an uppercase one, whatever case the script was started with.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..').replace(/^[a-z]:/, (drive) =>
  drive.toUpperCase(),
);
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const BASE_CONFIG = join(ROOT, 'vite.config.ts');
const WORK = join(ROOT, '.stryker-tmp', 'svelte-mutants');

const MODULES = {
  store: { source: 'src/lib/profile/store.svelte.ts', test: 'src/lib/profile/store.svelte.test.ts' },
  theme: { source: 'src/lib/theme/theme.svelte.ts', test: 'src/lib/theme/theme.svelte.test.ts' },
};

// A Windows checkout with core.autocrlf materialises CRLF, and the anchors below carry bare \n.
const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// `find` must occur exactly once in its module and `repl` disables one rule. `expect` is the full name
// of the test that must fail (its describe titles, then its own), and it is the point of each entry.
const MUTATIONS = [
  {
    module: 'store',
    name: 'active firm from another tab ignored',
    expect: 'listen follows the active firm another tab picked, unknown values reading as own',
    find: 'activeFirm = readFirm(readKey(storage, key));',
    repl: 'void key;',
  },
  {
    module: 'store',
    name: 'an active firm event taken at its word instead of read again',
    expect: 'listen keeps the firm this page switched to when the event for an earlier pick arrives after it',
    find: 'activeFirm = readFirm(readKey(storage, key));',
    repl: 'activeFirm = readFirm((event as StorageEvent).newValue);',
  },
  {
    module: 'store',
    name: 'a profile event taken at its word instead of read again',
    expect: 'listen keeps its own later save when the event for an earlier write from another tab arrives after it',
    find: 'const read = parseStored(readKey(storage, key));',
    repl: 'const read = parseStored((event as StorageEvent).newValue);',
  },
  {
    module: 'store',
    name: 'save allowed while the demo is shown',
    expect: 'the demo firm slot never writes the own profile from a save made while the demo firm is active',
    find: "(change: (current: Profile) => Profile, now: Date): SaveResult {\n\t\tif (activeFirm === 'demo') return 'unchanged';",
    repl: '(change: (current: Profile) => Profile, now: Date): SaveResult {',
  },
  {
    module: 'store',
    name: 'export stamp allowed while the demo is shown',
    expect: 'markExported does nothing while the demo firm is active',
    find: "function markExported(now: Date): SaveResult {\n\t\tif (activeFirm === 'demo') return 'unchanged';",
    repl: 'function markExported(now: Date): SaveResult {',
  },
  {
    module: 'store',
    name: 'persist asked every time',
    expect: 'requestPersistOnce asks for persistent storage exactly once, after the first successful save',
    find: 'persistRequested = true;',
    repl: '',
  },
  {
    module: 'store',
    name: 'persist asked before anything is stored',
    expect: 'requestPersistOnce does not ask after a save that failed',
    find: 'persistRequested || !hasSaved ||',
    repl: 'persistRequested ||',
  },
  {
    module: 'store',
    name: 'newer version from another tab ignored',
    expect: 'listen notes a newer schema version another tab stored, keeping the profile it has',
    find: "} else if (read.kind === 'newer') {\n\t\t\tnewerVersion = read.version;\n\t\t}",
    repl: '}',
  },
  {
    module: 'store',
    name: 'newer note kept after another tab stores a readable profile',
    expect: 'listen drops the newer-version note once another tab stores a profile this page reads',
    find: 'stored = read.stored;\n\t\t\tnewerVersion = null;',
    repl: 'stored = read.stored;',
  },
  {
    module: 'store',
    name: 'newer note never cleared by a read',
    expect: 'createProfileStore saves again once the newer profile is gone from storage',
    find: "newerVersion = current.kind === 'newer' ? current.version : null;",
    repl: "if (current.kind === 'newer') newerVersion = current.version;",
  },
  {
    module: 'store',
    name: 'a save never counts as stored',
    expect: 'requestPersistOnce asks for persistent storage exactly once, after the first successful save',
    find: 'hasSaved = true;',
    repl: '',
  },
  {
    module: 'store',
    name: 'export stamp with nothing stored',
    expect: 'markExported does nothing when no profile is saved',
    find: "if (current.kind === 'none') return 'unchanged';",
    repl: '',
  },
  {
    module: 'store',
    name: 'active firm never stored',
    expect: 'the demo firm slot writes only the active-firm key, and the own profile keeps its bytes through a demo and back',
    find: 'storage.setItem(ACTIVE_FIRM_KEY, firm);',
    repl: '',
  },
  {
    module: 'store',
    name: 'active firm not read on load',
    expect: 'the demo firm slot reads the stored active firm on load',
    find: 'activeFirm = readFirm(readKey(storage, ACTIVE_FIRM_KEY));',
    repl: '',
  },
  {
    module: 'store',
    name: "a change applied to this page's copy instead of storage",
    expect: "createProfileStore applies a one-field change to what storage holds now, keeping another tab's newer field",
    find: "const base = current.kind === 'read' ? current.stored.profile : emptyProfile();",
    repl: 'const base = stored?.profile ?? emptyProfile();',
  },
  {
    module: 'store',
    name: 'unchanged judged against this page copy',
    expect: 'createProfileStore compares a save with what storage holds now, not with what this page last wrote',
    find: "stored = current.kind === 'read' ? current.stored : null;",
    repl: '',
  },
  {
    module: 'store',
    name: 'a schema refusal answered as a refused write',
    expect: 'createProfileStore refuses a one-field change that breaks the schema, writing nothing',
    find: "if (!parsed.success) return 'invalid';",
    repl: "if (!parsed.success) return 'failed';",
  },
  {
    module: 'store',
    name: 'an import written over a newer profile',
    expect: 'replaceFromImport never writes over a profile saved by a newer schema version',
    find: "if (readCurrent().kind === 'newer') return 'newer-version';",
    repl: '',
  },
  {
    module: 'store',
    name: 'an import stored without the schema check',
    expect: 'replaceFromImport refuses a value that is not a valid stored profile and writes nothing',
    find: "if (!valid.success) return 'invalid';",
    repl: '',
  },
  {
    module: 'store',
    name: 'an import refused while the demo is shown',
    expect: 'replaceFromImport still replaces the own profile when the read ends after a switch to the demo, keeping the demo shown',
    find: 'function replaceFromImport(next: StoredProfile): SaveResult {',
    repl: "function replaceFromImport(next: StoredProfile): SaveResult {\n\t\tif (activeFirm === 'demo') return 'unchanged';",
  },
  {
    module: 'store',
    name: 'a storage event for another key taken as the profile',
    expect: 'listen ignores an event for another key, and a cleared storage',
    find: 'if (key !== PROFILE_KEY) return;',
    repl: '',
  },
  // Left out as equivalent: dropping the "choice === 'device'" test in onScheme. An explicit Light or
  // Dark resolves to itself whatever the OS says, so applying it again on a scheme change paints the
  // same theme and no test can tell the two apart.
  {
    module: 'theme',
    name: 'restore follows storage that did not change',
    expect: 'theme controller keeps a forced ?theme= through a restore when nothing new was picked',
    find: 'if (now === seen) return;',
    repl: '',
  },
  {
    module: 'theme',
    name: 'own pick not remembered as seen',
    expect: 'theme controller follows another tab back to the value this page stored before its own click',
    find: 'seen = readStored(win).value;\n\t\t\tapply();',
    repl: 'apply();',
  },
  {
    module: 'theme',
    name: 'a pageshow that is not a restore followed',
    expect: 'theme controller follows a pick made while the page was away once it is restored',
    find: 'if (!event.persisted) return;',
    repl: '',
  },
  {
    module: 'theme',
    name: 'pageshow listener left after destroy',
    expect: 'theme controller stops listening once destroyed',
    find: "win.removeEventListener('pageshow', onPageShow);",
    repl: '',
  },
  {
    module: 'theme',
    name: 'scheme listener left after destroy',
    expect: 'theme controller stops listening once destroyed',
    find: "media.removeEventListener('change', onScheme);",
    repl: '',
  },
  {
    module: 'theme',
    name: 'junk pick accepted',
    expect: 'theme controller ignores a switch value other than light, dark and device',
    find: 'const picked = knownChoice(value);\n\t\t\tif (!picked) return;',
    repl: 'const picked = value as ThemeChoice;',
  },
  {
    module: 'theme',
    name: "another tab's pick ignored",
    expect: 'theme controller follows a pick made in another tab, and ignores junk, removals and other keys',
    find: 'if (picked) choice = picked;',
    repl: '',
  },
  {
    module: 'theme',
    name: 'a clicked choice never stored',
    expect: 'theme controller stores a clicked choice and applies it',
    find: 'win.localStorage.setItem(THEME_KEY, picked);',
    repl: '',
  },
];

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Every run has its own folder and config, so they are independent. Three at a time keeps the whole
// roster near a minute, and the results are printed in list order whatever order they finish in.
const LANES = 3;

async function inLanes(items, work) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LANES, items.length) }, lane));
  return results;
}
const idOf = (path) => path.split('?')[0].replaceAll('\\', '/').toLowerCase();

function configText({ target, served, marker, report }) {
  return `import { readFileSync, writeFileSync } from 'node:fs';
import base from ${JSON.stringify(pathToFileURL(BASE_CONFIG).href)};

const TARGET = ${JSON.stringify(idOf(target))};
const SOURCE = readFileSync(${JSON.stringify(served)}, 'utf8');

export default async (env) => {
  const config = typeof base === 'function' ? await base(env) : base;
  return {
    ...config,
    root: ${JSON.stringify(ROOT)},
    plugins: [
      {
        name: 'svelte-state-mutant',
        enforce: 'pre',
        load(id) {
          if (id.split('?')[0].replaceAll('\\\\', '/').toLowerCase() !== TARGET) return null;
          writeFileSync(${JSON.stringify(marker)}, id);
          return SOURCE;
        },
      },
      ...(config.plugins ?? []),
    ],
    // Neither module reads a built record, so the records build the root config starts with is
    // skipped: it costs most of each run.
    test: {
      ...config.test,
      globalSetup: [],
      reporters: ['json'],
      outputFile: ${JSON.stringify(report)},
    },
  };
};
`;
}

// Returns the parsed JSON report, or null with the reason when the run produced no answer. A run that
// was killed, wrote no report or never loaded the module under test must not read as "a test failed".
async function runServed(folder, module, source) {
  mkdirSync(folder, { recursive: true });
  const served = join(folder, 'served.ts');
  const marker = join(folder, 'served.marker');
  const report = join(folder, 'report.json');
  writeFileSync(served, source);
  const config = join(folder, 'vitest.config.mjs');
  writeFileSync(config, configText({ target: join(ROOT, module.source), served, marker, report }));
  let code = 0;
  let output = '';
  try {
    const run = await execFileAsync(
      process.execPath,
      [VITEST, 'run', '--config', config, '--project', 'jsdom', module.test],
      { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 300000, maxBuffer: 32 * 1024 * 1024 },
    );
    output = run.stdout + run.stderr;
  } catch (error) {
    if (error.killed || error.signal) return { code: null, report: null, why: `run killed (${error.signal || 'timeout'})` };
    code = typeof error.code === 'number' ? error.code : -1;
    output = String(error.stdout || '') + String(error.stderr || '');
  }
  const tail = () => output.trim().split('\n').slice(-3).join(' | ');
  if (!existsSync(marker)) return { code, report: null, why: `the module was never served (exit ${code}): ${tail()}` };
  if (!existsSync(report)) return { code, report: null, why: `no JSON report written (exit ${code}): ${tail()}` };
  try {
    return { code, report: JSON.parse(readFileSync(report, 'utf8')), why: null };
  } catch (error) {
    return { code, report: null, why: `the JSON report could not be read (exit ${code}): ${error.message}` };
  }
}

function statusesByName(report) {
  const statuses = new Map();
  for (const file of report.testResults) {
    for (const assertion of file.assertionResults) {
      const name = [...assertion.ancestorTitles, assertion.title].join(' ');
      statuses.set(name, [...(statuses.get(name) || []), assertion.status]);
    }
  }
  return statuses;
}

function parseArgs(argv) {
  const onlyAt = argv.indexOf('--only');
  const only = onlyAt === -1 ? null : argv[onlyAt + 1];
  if (onlyAt !== -1 && !only) return { error: '--only needs a substring to match mutation names against.' };
  const unknown = argv.filter((arg, index) => arg !== '--only' && index !== onlyAt + 1);
  if (onlyAt === -1 && argv.length) return { error: `unknown argument(s): ${argv.join(' ')}` };
  if (onlyAt !== -1 && unknown.length) return { error: `unknown argument(s): ${unknown.join(' ')}` };
  return { only };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`[svelte-mutants] ${args.error}`);
    return 2;
  }
  if (!existsSync(VITEST)) {
    console.error(`[svelte-mutants] vitest not found at ${VITEST}; run npm ci first.`);
    return 2;
  }
  const sources = Object.fromEntries(
    Object.entries(MODULES).map(([key, module]) => [key, read(join(ROOT, module.source))]),
  );

  const stale = MUTATIONS.map((m) => ({ m, hits: sources[m.module].split(m.find).length - 1 })).filter(
    ({ hits }) => hits !== 1,
  );
  if (stale.length) {
    for (const { m, hits } of stale) {
      console.error(`[svelte-mutants] STALE  ${m.name}: its target occurs ${hits} time(s) in ${MODULES[m.module].source}, need exactly 1`);
    }
    console.error('[svelte-mutants] A refactor moved the code a mutation plants its defect in; update the anchor.');
    return 2;
  }

  const selected = args.only ? MUTATIONS.filter((m) => m.name.includes(args.only) || m.expect.includes(args.only)) : MUTATIONS;
  if (!selected.length) {
    console.error(`[svelte-mutants] --only ${args.only} matched no mutation.`);
    return 2;
  }

  const runDir = join(WORK, `${Date.now().toString(36)}-${process.pid}-${randomBytes(3).toString('hex')}`);
  try {
    const baselines = {};
    const keys = [...new Set(selected.map((m) => m.module))];
    const baseRuns = await inLanes(keys, (key) => runServed(join(runDir, `baseline-${key}`), MODULES[key], sources[key]));
    for (const [index, key] of keys.entries()) {
      const base = baseRuns[index];
      if (!base.report) {
        console.error(`[svelte-mutants] ${key} baseline produced no verdict: ${base.why}`);
        return 2;
      }
      const statuses = statusesByName(base.report);
      const failing = [...statuses].filter(([, list]) => list.some((s) => s !== 'passed'));
      if (base.code !== 0 || base.report.numTotalTests === 0 || failing.length) {
        console.error(`[svelte-mutants] ${key} baseline is NOT green (exit ${base.code}, ${base.report.numTotalTests} tests); fix the tests first.`);
        for (const [name, list] of failing) console.error(`  ${list.join(',')}  ${name}`);
        return 2;
      }
      baselines[key] = { statuses, total: base.report.numTotalTests };
    }
    const unnamed = selected.filter((m) => (baselines[m.module].statuses.get(m.expect) || []).length !== 1);
    if (unnamed.length) {
      console.error('[svelte-mutants] each named test must exist exactly once in its test file:');
      for (const m of unnamed) {
        const found = (baselines[m.module].statuses.get(m.expect) || []).length;
        console.error(`  ${m.name}  ->  "${m.expect}" found ${found} time(s)`);
      }
      return 2;
    }
    const totals = Object.entries(baselines).map(([key, base]) => `${key} ${base.total}`).join(', ');
    console.log(`[svelte-mutants] baselines green (${totals} tests). ${selected.length} mutation(s) follow.`);

    const escaped = [];
    const runs = await inLanes(selected, (m) =>
      runServed(join(runDir, slug(m.name)), MODULES[m.module], sources[m.module].replace(m.find, m.repl)),
    );
    for (const [index, m] of selected.entries()) {
      const run = runs[index];
      if (!run.report) {
        escaped.push(m.name);
        console.error(`  NO VERDICT  ${m.name}: ${run.why}`);
        continue;
      }
      const statuses = statusesByName(run.report);
      const named = statuses.get(m.expect) || [];
      const failed = run.report.numFailedTests;
      if (run.code !== 0 && named.length === 1 && named[0] === 'failed') {
        console.log(`  caught      ${m.name}  caught by "${m.expect}" (exit ${run.code}, ${failed} of ${run.report.numTotalTests} failed)`);
        continue;
      }
      escaped.push(m.name);
      const state = named.length ? named.join(',') : 'not run';
      const others = [...statuses].filter(([, list]) => list.includes('failed')).map(([name]) => `"${name}"`);
      console.error(`  ESCAPED     ${m.name}: "${m.expect}" was ${state} (exit ${run.code}, ${failed} of ${run.report.numTotalTests} failed)`);
      if (others.length) console.error(`              failed instead: ${others.join('; ')}`);
    }
    if (escaped.length) {
      console.error(`[svelte-mutants] ${escaped.length} mutation(s) did not fail their named test: ${escaped.join('; ')}`);
      return 1;
    }
    console.log(`[svelte-mutants] all ${selected.length} mutation(s) caught, each by the test it names.`);
    return 0;
  } finally {
    // A vitest child can still hold a file for a moment on Windows. A folder that cannot be removed
    // is reported, and the verdict above keeps its exit code.
    try {
      rmSync(runDir, { recursive: true, force: true, maxRetries: 5 });
    } catch (error) {
      console.error(`[svelte-mutants] could not remove ${runDir}: ${error.message}`);
    }
  }
}

process.exit(await main());

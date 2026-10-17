#!/usr/bin/env node
// verdict.mutants.mjs - prove the verdict tests are NON-VACUOUS, rule by rule.
//
// Each mutation disables exactly ONE rule of src/lib/core/verdict.ts, and the test it NAMES in
// src/lib/core/verdict.test.ts must then fail. The verdict is read from vitest's JSON report, test
// by test. A non-zero exit alone proves nothing: a mutant that no longer parses also exits
// non-zero having asserted nothing, and the exhaustive enumeration test goes red on almost any
// change, so "some test failed" would score every rule as covered even if its named test had been
// deleted.
//
// Mutations run on COPIES. Each one gets its own folder under
// .stryker-tmp/verdict-mutants/<run id>/<mutation>/ (gitignored), holding a copy of the module, a
// copy of its test and a vitest config for that folder alone, so the working tree is never
// touched and two runs in the same checkout never share a folder. The run folder is removed at the
// end whatever happens.
//
// Usage:  node scripts/verdict.mutants.mjs [--only <substring>]
// Exit codes: 0 every mutation failed its named test, 1 a mutation escaped or asked no question,
// 2 a broken setup (baseline not green, a stale anchor, an unknown named test, bad arguments).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'src', 'lib', 'core', 'verdict.ts');
const TESTS = join(ROOT, 'src', 'lib', 'core', 'verdict.test.ts');
const GUARD = join(ROOT, 'src', 'test', 'outbound-guard.node.ts');
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const WORK = join(ROOT, '.stryker-tmp', 'verdict-mutants');

// A Windows checkout with core.autocrlf materialises CRLF, and the two-line anchor below carries a
// bare \n, so the source is normalised before any anchor is searched for.
const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// `find` must occur exactly once in verdict.ts and `repl` disables one rule. `expect` is the full
// title of the test that must fail; it is the point, not documentation (see the header).
const MUTATIONS = [
  {
    name: 'swap two severities',
    expect: 'NO-GO wins over PARTNER NEEDED',
    find: "\tif (has('SHORT_FIXED')) return { verdict: 'NO-GO' };\n\tif (has('SHORT_BORROWABLE')) return { verdict: 'PARTNER NEEDED' };",
    repl: "\tif (has('SHORT_BORROWABLE')) return { verdict: 'PARTNER NEEDED' };\n\tif (has('SHORT_FIXED')) return { verdict: 'NO-GO' };",
  },
  {
    name: 'drop SHORT_FIXED',
    expect: 'any SHORT_FIXED gives NO-GO',
    find: "\tif (has('SHORT_FIXED')) return { verdict: 'NO-GO' };\n",
    repl: '',
  },
  {
    name: 'INFO counts as a shortfall',
    expect: 'INFO never makes a lot worse than GO',
    find: "if (has('SHORT_BORROWABLE'))",
    repl: "if (has('SHORT_BORROWABLE') || has('INFO'))",
  },
  {
    name: 'empty lot is GO',
    expect: 'an empty lot with BT-821 notice is ASK FIRST, no criteria in the notice',
    find: ' || lot.states.length === 0',
    repl: '',
  },
  {
    name: 'ignore SOURCE_UNREAD',
    expect: 'SOURCE_UNREAD blocks GO',
    find: "lot.facts.includes('SOURCE_UNREAD') || ",
    repl: '',
  },
  {
    name: 'ignore the document pointer',
    expect: 'a criterion pointing to the documents blocks GO',
    find: ' || lot.pointsToDocuments',
    repl: '',
  },
  {
    name: 'drop the cancel-intent overlay',
    expect: 'every lot of a cancel-intent notice reads ASK FIRST cancel-intent, NO-GO included',
    find: "\tif (lot.cancelIntent === true) return { verdict: 'ASK FIRST', reason: 'cancel-intent' };\n",
    repl: '',
  },
  {
    name: 'not-compared never applies',
    expect: 'a not-compared criterion blocks GO',
    find: "'not-compared': (lot) => lot.notCompared === true,",
    repl: "'not-compared': () => false,",
  },
];

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Returns the parsed JSON report, or null with the reason when the run produced none. A run that
// was killed or wrote no report never answered, and that must not be read as "a test failed".
async function runCopy(folder, source, tests) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'verdict.ts'), source);
  writeFileSync(join(folder, 'verdict.test.ts'), tests);
  const reportFile = join(folder, 'report.json');
  const config = {
    test: {
      include: ['verdict.test.ts'],
      environment: 'node',
      setupFiles: [GUARD],
      reporters: ['json'],
      outputFile: reportFile,
      watch: false,
    },
  };
  const configFile = join(folder, 'vitest.config.mjs');
  writeFileSync(configFile, `export default ${JSON.stringify(config, null, 2)};\n`);
  let code = 0;
  let output = '';
  try {
    const run = await execFileAsync(process.execPath, [VITEST, 'run', '--config', configFile], {
      cwd: folder,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 300000,
      maxBuffer: 32 * 1024 * 1024,
    });
    output = run.stdout + run.stderr;
  } catch (error) {
    if (error.killed || error.signal) return { code: null, report: null, why: `run killed (${error.signal || 'timeout'})` };
    code = typeof error.code === 'number' ? error.code : -1;
    output = String(error.stdout || '') + String(error.stderr || '');
  }
  if (!existsSync(reportFile)) {
    return { code, report: null, why: `no JSON report written (exit ${code}): ${output.trim().split('\n').slice(-3).join(' | ')}` };
  }
  // A report cut short by a killed run is no answer either, never a crash that exits 1 and so
  // reads as an escaped mutation.
  try {
    return { code, report: JSON.parse(readFileSync(reportFile, 'utf8')), why: null };
  } catch (error) {
    return { code, report: null, why: `the JSON report could not be read (exit ${code}): ${error.message}` };
  }
}

function statusesByTitle(report) {
  const statuses = new Map();
  for (const file of report.testResults) {
    for (const assertion of file.assertionResults) {
      const seen = statuses.get(assertion.title);
      statuses.set(assertion.title, seen ? [...seen, assertion.status] : [assertion.status]);
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
    console.error(`[verdict-mutants] ${args.error}`);
    return 2;
  }
  if (!existsSync(VITEST)) {
    console.error(`[verdict-mutants] vitest not found at ${VITEST}; run npm ci first.`);
    return 2;
  }
  const source = read(MODULE);
  const tests = read(TESTS);

  const stale = MUTATIONS.map((m) => ({ m, hits: source.split(m.find).length - 1 })).filter(({ hits }) => hits !== 1);
  if (stale.length) {
    for (const { m, hits } of stale) {
      console.error(`[verdict-mutants] STALE  ${m.name}: its target occurs ${hits} time(s) in verdict.ts, need exactly 1`);
    }
    console.error('[verdict-mutants] A refactor moved the code a mutation plants its defect in; update the anchor.');
    return 2;
  }

  const selected = args.only ? MUTATIONS.filter((m) => m.name.includes(args.only) || m.expect.includes(args.only)) : MUTATIONS;
  if (!selected.length) {
    console.error(`[verdict-mutants] --only ${args.only} matched no mutation.`);
    return 2;
  }

  const runDir = join(WORK, `${Date.now().toString(36)}-${process.pid}-${randomBytes(3).toString('hex')}`);
  try {
    const base = await runCopy(join(runDir, 'baseline'), source, tests);
    if (!base.report) {
      console.error(`[verdict-mutants] baseline produced no verdict: ${base.why}`);
      return 2;
    }
    const baseStatuses = statusesByTitle(base.report);
    const failing = [...baseStatuses].filter(([, list]) => list.some((s) => s !== 'passed'));
    if (base.code !== 0 || base.report.numTotalTests === 0 || failing.length) {
      console.error(`[verdict-mutants] baseline is NOT green (exit ${base.code}, ${base.report.numTotalTests} tests); fix the tests first.`);
      for (const [title, list] of failing) console.error(`  ${list.join(',')}  ${title}`);
      return 2;
    }
    const unnamed = selected.filter((m) => (baseStatuses.get(m.expect) || []).length !== 1);
    if (unnamed.length) {
      console.error('[verdict-mutants] each named test must exist exactly once in verdict.test.ts:');
      for (const m of unnamed) console.error(`  ${m.name}  ->  "${m.expect}" found ${(baseStatuses.get(m.expect) || []).length} time(s)`);
      return 2;
    }
    console.log(`[verdict-mutants] baseline green: ${base.report.numTotalTests} tests. ${selected.length} mutation(s) follow.`);

    const escaped = [];
    for (const m of selected) {
      const run = await runCopy(join(runDir, slug(m.name)), source.replace(m.find, m.repl), tests);
      if (!run.report) {
        escaped.push(m.name);
        console.error(`  NO VERDICT  ${m.name}: ${run.why}`);
        continue;
      }
      const statuses = statusesByTitle(run.report);
      const named = statuses.get(m.expect) || [];
      const failed = run.report.numFailedTests;
      if (run.code !== 0 && named.length === 1 && named[0] === 'failed') {
        console.log(`  caught      ${m.name}  caught by "${m.expect}" (exit ${run.code}, ${failed} of ${run.report.numTotalTests} failed)`);
        continue;
      }
      escaped.push(m.name);
      const state = named.length ? named.join(',') : 'not run';
      console.error(`  ESCAPED     ${m.name}: "${m.expect}" was ${state} (exit ${run.code}, ${failed} of ${run.report.numTotalTests} failed)`);
    }
    if (escaped.length) {
      console.error(`[verdict-mutants] ${escaped.length} mutation(s) did not fail their named test: ${escaped.join('; ')}`);
      return 1;
    }
    console.log(`[verdict-mutants] all ${selected.length} mutation(s) caught, each by the test it names.`);
    return 0;
  } finally {
    // A vitest child can still hold a file for a moment on Windows. A folder that cannot be removed
    // is reported, and the verdict above keeps its exit code.
    try {
      rmSync(runDir, { recursive: true, force: true, maxRetries: 5 });
    } catch (error) {
      console.error(`[verdict-mutants] could not remove ${runDir}: ${error.message}`);
    }
  }
}

process.exit(await main());

#!/usr/bin/env node
// check-judged-artifacts.mutants.mjs - proves check-judged-artifacts.mjs --selftest can actually
// FAIL, one rule at a time.
//
// WHY THIS SHIPS beside the gate. A selftest that passes says nothing about whether its controls
// can go red: a control that passes whether or not its rule works is worse than none, because it
// reads as coverage. Each mutant below disables exactly ONE decision in the gate and asserts that
// --selftest exits non-zero WITH a named control failing. An ESCAPE means that rule has no control
// that can fail. A NO VERDICT means the mutant died before or outside the suite, which proves
// nothing either way and is never counted as a catch.
//
// Its own file, because the anchors are verbatim lines of the gate: kept inside the gate they
// would occur twice and every mutation would be ambiguous.
//
// MUTANTS RUN CONCURRENTLY. The selftest builds a git repository per control, so one mutant costs
// about two minutes and a serial sweep of the list took about two hours (measured 2026-09-13).
// Every mutant writes its own temp directories and shares nothing, so a small worker pool cuts
// that to the length of the longest few. The verdict logic is unchanged; only the order the lines
// print in is now the order mutants finish.
//
// Usage: node scripts/check-judged-artifacts.mutants.mjs [--only <substring of a mutation name>]
//        [--jobs <n>]
// Exit codes: 0 every mutation caught, 1 at least one escaped, was skipped, or gave no verdict.
// --only re-proves one rule after fixing it; the denominator it prints is what it selected, never
// the whole list.

import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'check-judged-artifacts.mjs');
// Line endings are folded before any anchor is matched: a fresh checkout under core.autocrlf holds
// CRLF, and an anchor with an embedded newline then finds nothing and the mutation is skipped.
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

// One entry per DECISION in the gate. Every anchor must be unique: an ambiguous one mutates a line
// other than the rule it is named after and then reports an escape for a control that is fine.
const MUTATIONS = [
  // Where the lane file is looked for, and what an unreadable one means.
  ['the lane file location', "const lanePath = join(root, LANE);", "const lanePath = join(root, 'never-there.json');"],
  ['an unreadable lane file is UNKNOWN', "return { unknown: true, reason: `${LANE} is not valid JSON: ${(e && e.message) || 'parse error'}`, root };", 'return { skipped: true, root };'],
  ['a lane file that is not an object is UNKNOWN', "if (!lane || typeof lane !== 'object' || Array.isArray(lane)) return { unknown: true, reason: `${LANE} is not a JSON object`, root };", 'if (false) return { unknown: true, root };'],
  ['the repo root resolution', "root = git(['rev-parse', '--show-toplevel'], cwd);", 'root = cwd;'],
  // The lane file as a process file.
  ['the tracked lane-file check', 'if (tracked.has(LANE)) {', 'if (false) {'],
  ['the unignored lane-file check', 'if (ignored === false) add(', 'if (false) add('],
  ['the build-lane presence check', 'if (!existsSync(join(root, BUILD_LANE))) add(', 'if (false) add('],
  // Intake. Two lines for the loop, because the selftest builds its per-field controls with the
  // same loop head; the second line only exists in the gate's own loop.
  ['the intake field loop', 'for (const field of INTAKE_FIELDS) {\n    const v = lane[field];', 'for (const field of []) {\n    const v = lane[field];'],
  ['the rulesUrl shape', 'if (lane.rulesUrl !== undefined && !isHttp(lane.rulesUrl)) add(', 'if (false) add('],
  ['the deadline parse', "if (Number.isNaN(Date.parse(lane.deadline))) add('deadline does not parse as a date');", "if (false) add('deadline does not parse as a date');"],
  ['the deadline timezone', 'else if (!/(Z|[+-]\\d{2}:?\\d{2})$/.test(lane.deadline)) add(', 'else if (false) add('],
  ['criteria non-empty', "if (!Array.isArray(lane.criteria) || lane.criteria.length === 0) add('criteria is not a non-empty list');", "if (false) add('criteria is not a non-empty list');"],
  ['the criterion weight', 'else if (!isNum(c.weight)) add(', 'else if (false) add('],
  ['the bonus scoresHere flag', "else if (typeof b.scoresHere !== 'boolean') add(", 'else if (false) add('],
  ['the prize claim action', "else if (typeof p.claim !== 'string' || p.claim === '') add(", 'else if (false) add('],
  ['the dossier existence', 'if (!existsSync(dossierPath)) add(', 'if (false) add('],
  ['the day-shaped dates', 'if (lane[day] !== undefined && !isDay(lane[day])) add(', 'if (false) add('],
  // Artifacts, shared by three stages.
  ['an artifact must be recorded', "if (typeof rel !== 'string' || rel === '') { add(", 'if (false) { add('],
  ['an artifact lives under examples/', "if (!norm.startsWith('examples/')) add(", 'if (false) add('],
  ['a transcript is markdown', 'if (opts.markdown && !/\\.md$/i.test(norm)) add(', 'if (false) add('],
  ['an artifact exists on disk', 'if (!existsSync(join(root, norm))) add(`artifacts.${key} does not exist on disk: ${norm}`);', 'if (false) add(`artifacts.${key} does not exist on disk: ${norm}`);'],
  ['an artifact is tracked', 'else if (!tracked.has(norm)) add(', 'else if (false) add('],
  // Stage gating and the per-stage rules.
  ['the prove stage', 'if (level >= 1) {', 'if (false) {'],
  ['a run recorded at prove', "if (runs.length < 1) add('no live run recorded in runs[]');", "if (false) add('no live run recorded in runs[]');"],
  ['README names examples/', "if (!readmeHead.includes('examples/')) add(", 'if (false) add('],
  ['the attack stage', 'if (level >= 2) {', 'if (false) {'],
  ['the refine stage', 'if (level >= 3) {', 'if (false) {'],
  ['the card is recorded', "if (typeof card !== 'string' || card === '') add('artifacts.card not recorded (the 1600x900 card)');", "if (false) add('artifacts.card not recorded (the 1600x900 card)');"],
  ['the card exists', 'if (!existsSync(cardPath)) add(`artifacts.card does not exist: ${card}`);', 'if (false) add(`artifacts.card does not exist: ${card}`);'],
  ['the card dimensions', 'else if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) add(', 'else if (false) add('],
  ['the title is recorded', "if (typeof title !== 'string' || title.trim() === '') add('video.title not recorded (the title is the finding)');", "if (false) add('video.title not recorded (the title is the finding)');"],
  ['the demo-shaped title', 'else if (/\\bdemo\\s*$/i.test(title.trim())) add(', 'else if (false) add('],
  ['the signoff stage', 'if (level >= 4) {', 'if (false) {'],
  ['three live runs', 'if (runs.length < MIN_RUNS_SIGNOFF) add(', 'if (false) add('],
  ['the artifact rounds', 'if (!Number.isInteger(n) || n < 1) add(', 'if (false) add('],
  ['predicted scores present', "if (!predicted) add('predictedScores not recorded (pre-register the scores so the result measures the playbook)');", "if (false) add('predictedScores not recorded');"],
  ['a predicted score per criterion', 'if (predicted) for (const c of criteria) if (!isNum(predicted[c.name])) add(', 'if (predicted) for (const c of criteria) if (false) add('],
  ['a draft simulation exists', "if (drafts.length === 0) add('no dated judge simulation on the draft recorded in simulations[]');", "if (false) add('no dated judge simulation on the draft recorded in simulations[]');"],
  ['the criterion floor', 'if (!isNum(s) || s < FLOOR_CORE) add(', 'if (false) add('],
  ['the bonus floor', 'if (!isNum(s) || s < FLOOR_BONUS) add(', 'if (false) add('],
  ['the contribution URL where a bonus scores', "if (!isHttp(contribution.url)) add('contribution.url not recorded while a bonus scores here (filed and linked is the whole of it)');", "if (false) add('contribution.url not recorded');"],
  ['the video URL', 'if (!isHttp(lane.video && lane.video.url)) add(', 'if (false) add('],
  ['the judged exact process paths', 'if (JUDGED_EXACT.has(lower)) { add(', 'if (false) { add('],
  ['the judged process-file shapes', 'for (const [re, what] of JUDGED_SHAPES) if (re.test(p)) add(', 'for (const [re, what] of []) if (re.test(p)) add('],
  // THE EXIT-CODE LAYER. Everything above changes what scan() decides; these change what a hook
  // reads, and without them the gate could print every finding and still exit 0.
  ['the exit code for findings', 'return res.ok ? 0 : 1;', 'return 0;'],
  ['the exit code for a required skip', 'if (res.skipped) return require ? 2 : 0;', 'if (res.skipped) return 0;'],
  ['the exit code for UNKNOWN', 'if (res.unknown) return 2;', 'if (res.unknown) return 0;'],
  // THE LOUD SKIP. A quiet skip reads exactly like nothing being wrong.
  ['the SKIPPED line', 'const line = `[judged-artifacts] SKIPPED: no ${LANE} at ${res.root}.', 'const line = `[judged-artifacts] no ${LANE} at ${res.root}.'],
];

const argAfter = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] || '').trim();
};
const ONLY = (() => {
  const v = argAfter('--only');
  if (v === null) return null;
  if (!v) { console.error('--only needs a substring of a mutation name'); process.exit(2); }
  return v.toLowerCase();
})();
// One fewer than the machine's cores, at most six: each mutant is a node process spawning git
// dozens of times, and the point is to finish, not to starve the session that is waiting on it.
const JOBS = (() => {
  const v = argAfter('--jobs');
  if (v !== null && v !== '') return Math.max(1, Number(v) || 1);
  return Math.max(1, Math.min(6, availableParallelism() - 1));
})();

const dir = mkdtempSync(join(tmpdir(), 'judged-mutants-'));

function runMutant(i, name, find, repl) {
  return new Promise((resolve) => {
    const hits = src.split(find).length - 1;
    if (hits !== 1) {
      resolve({ name, verdict: hits === 0 ? 'SKIP' : 'AMBIGUOUS', detail: `anchor occurs ${hits} times, fix this harness, not the gate` });
      return;
    }
    const file = join(dir, `m${i}.mjs`);
    writeFileSync(file, src.replace(find, repl), 'utf8');
    // A mutant that does not PARSE is not a mutation test: node exits non-zero on a SyntaxError
    // exactly as it does on a caught mutation, so the parse is checked first.
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe', windowsHide: true });
    } catch (e) {
      const why = String((e && e.stderr) || '').split('\n').find((l) => /Error/.test(l)) || 'parse failed';
      resolve({ name, verdict: 'UNPARSEABLE', detail: `${why.trim()}, rewrite the mutation to produce valid code` });
      return;
    }
    execFile(process.execPath, [file, '--selftest'], { encoding: 'utf8', windowsHide: true, timeout: 300000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      // stderr too: controls fail through console.error, so a stdout-only read counts zero.
      const both = String(stdout || '') + String(stderr || '');
      if (err && (err.killed || err.signal)) {
        resolve({ name, verdict: 'NO VERDICT', detail: err.signal ? `killed by ${err.signal}` : 'timed out' });
        return;
      }
      const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
      if (code === 0) { resolve({ name, verdict: 'ESCAPED' }); return; }
      // A non-zero exit counts only when a NAMED control failed. `SELFTEST FAIL: ` with the colon,
      // so the summary line can never be counted as one.
      const failed = (both.match(/SELFTEST FAIL: /g) || []).length;
      if (failed === 0) {
        resolve({ name, verdict: 'NO VERDICT', detail: `exited ${code} without failing a control, so it died before or outside the suite` });
        return;
      }
      resolve({ name, verdict: 'CAUGHT', detail: `${failed} control(s) failed` });
    });
  });
}

const queue = MUTATIONS.map((m, i) => [i, ...m]).filter(([, name]) => !ONLY || name.toLowerCase().includes(ONLY));
const selected = queue.length;
const results = [];
async function worker() {
  while (queue.length) {
    const [i, name, find, repl] = queue.shift();
    const r = await runMutant(i, name, find, repl);
    results.push(r);
    console.log(`  ${r.verdict.padEnd(11)} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  }
}
try {
  await Promise.all(Array.from({ length: Math.min(JOBS, Math.max(1, selected)) }, worker));
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* a busy temp handle is not a verdict */ }
}

const escaped = results.filter((r) => r.verdict === 'ESCAPED').length;
const skipped = results.filter((r) => r.verdict === 'SKIP' || r.verdict === 'AMBIGUOUS' || r.verdict === 'UNPARSEABLE').length;
const inconclusive = results.filter((r) => r.verdict === 'NO VERDICT').length;
const total = selected - skipped - inconclusive;
if (ONLY) console.log(`\n(--only "${ONLY}": ${selected} of ${MUTATIONS.length} mutation(s) selected)`);
if (selected === 0) {
  console.log(`\nNO MUTATION MATCHED --only "${ONLY}". Nothing ran, so nothing was proven.`);
} else if (total <= 0) {
  console.log(`\nNO MUTATION PRODUCED A VERDICT: ${selected} attempted, ${skipped} skipped, ${inconclusive} inconclusive.`);
  console.log('This run proves NOTHING about the controls. Do not read it as a pass.');
} else {
  console.log(`\n${total - escaped}/${total} mutations caught (${JOBS} at a time)`
    + (skipped ? ` (${skipped} skipped)` : '')
    + (inconclusive ? ` (${inconclusive} inconclusive, NOT counted as caught)` : ''));
}
if (escaped) console.error('An escaped mutation means that rule has no control that can fail. Fix the selftest.');
if (skipped) console.error('A skipped mutation proved nothing about its rule: fix the MUTATION, not the gate.');
if (inconclusive) console.error('An inconclusive mutation produced no verdict. This run does not prove those controls work.');
process.exit(selected === 0 || escaped || skipped || inconclusive ? 1 : 0);

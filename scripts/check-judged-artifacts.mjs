#!/usr/bin/env node
// check-judged-artifacts.mjs - the judged-entry gate: the artifacts a judged entry ships beside its
// code exist where its lane file says they do, one set per stage.
//
// WHY THIS EXISTS. A hackathon or competition entry is scored on its submission, never on its
// repository. The artifacts that score (a captured real run a judge can replay with nothing
// installed, one artifact where the tool refused, a designed card, a narrated take with its
// transcript, a judge simulation at the floor) were on no checklist a build stage read, and one
// entry with five review rounds on its code and none on its page placed nowhere in a field of six
// hundred. Prose cannot fail a build. This file can.
//
// THE LANE FILE. `.judged-entry.json` sits beside `.build-lane` at the repo root. Intake writes it
// with the judging function copied verbatim (criteria and weights, bonuses, the pass/fail wording,
// the edit policy, the prior-work clause, the dates), and each later stage records the artifact it
// made. It describes the process, so it must EXIST on disk and must NEVER be tracked: it is ignored
// through git's own exclude file, never through a tracked .gitignore, which would republish the
// name in the repo being cleaned.
//
// ABSENCE IS SKIPPED, NEVER CLEAN. A product that is not an entry has no lane file, so the gate
// prints SKIPPED and exits 0 and can sit in every product's gate chain. A stage that knows the
// product IS an entry passes --require, which turns SKIPPED into exit 2: on an entry a missing lane
// file means the gate did not run, and a gate that did not run has proven nothing.
//
// STAGES ARE CUMULATIVE. `--pass signoff` checks everything below it too, so the final stage cannot
// pass while an earlier stage's artifact has gone missing.
//
// Usage:
//   node scripts/check-judged-artifacts.mjs                        the intake fields (default: build)
//   node scripts/check-judged-artifacts.mjs --pass <stage>         build | prove | attack | refine | signoff
//   node scripts/check-judged-artifacts.mjs --require              SKIPPED becomes exit 2
//   node scripts/check-judged-artifacts.mjs --selftest             prove every rule can fail
//
// Exit codes: 0 clean or SKIPPED, 1 findings, 2 could not run (no git, an unreadable lane file, an
// unknown stage name, or --require with no lane file).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, appendFileSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANE = '.judged-entry.json';
export const BUILD_LANE = '.build-lane';
export const STAGES = ['build', 'prove', 'attack', 'refine', 'signoff'];

// Every field intake copies from the event's own pages. Missing means the judging function was
// never read, which is the root cause the whole gate exists to catch.
export const INTAKE_FIELDS = ['event', 'rulesUrl', 'deadline', 'passFail', 'criteria', 'bonuses', 'prizes',
  'editPolicy', 'priorWorkClause', 'dossier', 'takeDate', 'freezeDate'];
// The judged artifacts get counted review rounds like the code does. Zero rounds on any of them at
// sign-off is the effort split that lost.
export const ROUND_KEYS = ['description', 'images', 'video', 'readme'];
// The floor the reconstructed panel separated winners with: no core criterion below 3, a scored
// bonus at 2 or more. Necessary, not sufficient.
export const FLOOR_CORE = 3;
export const FLOOR_BONUS = 2;
// No number reaches a judged surface before the live path has run this many times.
export const MIN_RUNS_SIGNOFF = 3;
// One card serves six surfaces; the platforms crop anything else.
export const CARD_WIDTH = 1600;
export const CARD_HEIGHT = 900;

// The judged process files a stranger must never meet at the root: exact paths and name shapes.
// The general artifact gate covers the assistant trees and the reports; this is the submission
// half, judged here at sign-off so it fails before the flip rather than at it.
const JUDGED_EXACT = new Set([
  'human-todo.md', 'docs/submission.md', 'docs/devpost.md', 'docs/shot-list.md', 'docs/demo-video.md',
  'docs/demo-script.md', 'docs/video-script.md', 'docs/screenshots/devpost-thumbnail.png',
]);
const JUDGED_SHAPES = [
  [/(^|\/)[^/]*shot-?list[^/]*\.md$/i, 'a shot list'],
  [/(^|\/)[^/]*(devpost|submission)[-_]?(copy|text|draft)[^/]*\.md$/i, 'submission copy'],
];

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function trackedPaths(root) {
  return new Set(git(['ls-files', '-z'], root).split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/')));
}

// true ignored, false not ignored, null when git could not decide (a broken exclude file, no repo).
// `check-ignore -q` exits 1 for "not ignored", which is a verdict rather than an error.
function isIgnored(root, rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: root, windowsHide: true, stdio: 'ignore' });
    return true;
  } catch (e) {
    return e && e.status === 1 ? false : null;
  }
}

// Width and height from the IHDR chunk, which every PNG carries at a fixed offset. null when the
// file is not a PNG at all, so a card saved as JPEG is reported as unmeasured rather than as 0x0.
export function pngSize(path) {
  let head;
  try {
    const fd = openSync(path, 'r');
    head = Buffer.alloc(24);
    const n = readSync(fd, head, 0, 24, 0);
    closeSync(fd);
    if (n < 24) return null;
  } catch (e) {
    return null;
  }
  if (head.toString('latin1', 1, 4) !== 'PNG' || head.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const isHttp = (v) => typeof v === 'string' && /^https?:\/\/\S+$/.test(v);
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Judge one repository at one stage. Pure enough for the selftest to call directly: every verdict
 * comes back as data and the CLI turns it into an exit code in exitCodeFor().
 */
export function scan(cwd, stage) {
  if (!STAGES.includes(stage)) return { unknown: true, reason: `unknown stage "${stage}"; one of ${STAGES.join(', ')}` };
  const level = STAGES.indexOf(stage);
  let root;
  try {
    root = git(['rev-parse', '--show-toplevel'], cwd);
  } catch (e) {
    return { unknown: true, reason: `not a git repository at ${cwd}` };
  }
  const lanePath = join(root, LANE);
  if (!existsSync(lanePath)) return { skipped: true, root };

  let lane;
  try {
    lane = JSON.parse(readFileSync(lanePath, 'utf8'));
  } catch (e) {
    return { unknown: true, reason: `${LANE} is not valid JSON: ${(e && e.message) || 'parse error'}`, root };
  }
  if (!lane || typeof lane !== 'object' || Array.isArray(lane)) return { unknown: true, reason: `${LANE} is not a JSON object`, root };

  let tracked;
  try {
    tracked = trackedPaths(root);
  } catch (e) {
    return { unknown: true, reason: 'git ls-files failed', root };
  }

  const findings = [];
  const add = (what) => findings.push(what);

  // THE LANE FILE IS A PROCESS FILE. Tracked, it ships the judging notes to every judge who opens
  // the repo; unignored, it is one `git add -A` from being tracked.
  if (tracked.has(LANE)) {
    add(`${LANE} is TRACKED: git rm --cached ${LANE}, then add /${LANE} to the exclude file (never to .gitignore)`);
  } else {
    const ignored = isIgnored(root, LANE);
    if (ignored === false) add(`${LANE} is not ignored: add /${LANE} to git's exclude file, never to a tracked .gitignore`);
    if (ignored === null) return { unknown: true, reason: `git check-ignore could not judge ${LANE}`, root };
  }
  if (!existsSync(join(root, BUILD_LANE))) add(`no ${BUILD_LANE} beside ${LANE}: the lane file belongs to a pipeline build`);

  // INTAKE: the judging function, verbatim.
  for (const field of INTAKE_FIELDS) {
    const v = lane[field];
    if (v === undefined || v === null || v === '') add(`intake field missing: ${field}`);
  }
  if (lane.rulesUrl !== undefined && !isHttp(lane.rulesUrl)) add('rulesUrl is not an http(s) URL');
  if (typeof lane.deadline === 'string') {
    if (Number.isNaN(Date.parse(lane.deadline))) add('deadline does not parse as a date');
    else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(lane.deadline)) add('deadline carries no timezone offset (a cutoff read in the wrong zone is a missed cutoff)');
  }
  if (lane.criteria !== undefined) {
    if (!Array.isArray(lane.criteria) || lane.criteria.length === 0) add('criteria is not a non-empty list');
    else for (const c of lane.criteria) {
      if (!c || typeof c.name !== 'string' || c.name === '') add('a criterion has no name');
      else if (!isNum(c.weight)) add(`criterion "${c.name}" has no numeric weight`);
    }
  }
  if (lane.bonuses !== undefined) {
    if (!Array.isArray(lane.bonuses)) add('bonuses is not a list');
    else for (const b of lane.bonuses) {
      if (!b || typeof b.name !== 'string' || b.name === '') add('a bonus has no name');
      else if (typeof b.scoresHere !== 'boolean') add(`bonus "${b.name}" does not say whether it scores at this event (scoresHere)`);
    }
  }
  if (lane.prizes !== undefined) {
    if (!Array.isArray(lane.prizes)) add('prizes is not a list');
    else for (const p of lane.prizes) {
      if (!p || typeof p.name !== 'string' || p.name === '') add('a prize has no name');
      else if (typeof p.claim !== 'string' || p.claim === '') add(`prize "${p.name}" has no claim action`);
    }
  }
  if (typeof lane.dossier === 'string' && lane.dossier !== '') {
    const dossierPath = isAbsolute(lane.dossier) ? lane.dossier : join(root, lane.dossier);
    if (!existsSync(dossierPath)) add(`dossier does not exist: ${lane.dossier}`);
  }
  for (const day of ['takeDate', 'freezeDate']) {
    if (lane[day] !== undefined && !isDay(lane[day])) add(`${day} is not a YYYY-MM-DD date`);
  }

  const artifacts = (lane.artifacts && typeof lane.artifacts === 'object') ? lane.artifacts : {};
  // A recorded artifact is only evidence when it is inside examples/ (the zero-install path), on
  // disk, and tracked, so a clone carries it. Recorded and untracked is the false clean.
  const checkArtifact = (key, what, opts = {}) => {
    const rel = artifacts[key];
    if (typeof rel !== 'string' || rel === '') { add(`artifacts.${key} not recorded (${what})`); return; }
    // String() rather than rel.replace: with the guard above disabled, an absent path must read
    // as a wrong verdict the mutants twin can see, never as a crash that proves nothing.
    const norm = String(rel ?? '').replace(/\\/g, '/');
    if (!norm.startsWith('examples/')) add(`artifacts.${key} must live under examples/: ${norm}`);
    if (opts.markdown && !/\.md$/i.test(norm)) add(`artifacts.${key} must be a markdown file: ${norm}`);
    if (!existsSync(join(root, norm))) add(`artifacts.${key} does not exist on disk: ${norm}`);
    else if (!tracked.has(norm)) add(`artifacts.${key} is not tracked, so a clone has no ${what}: ${norm}`);
  };
  const runs = Array.isArray(lane.runs) ? lane.runs : [];

  if (level >= 1) {
    checkArtifact('replay', 'captured real run');
    if (runs.length < 1) add('no live run recorded in runs[]');
    let readmeHead = '';
    try { readmeHead = readFileSync(join(root, 'README.md'), 'utf8').split(/\r?\n/).slice(0, 10).join('\n'); } catch (e) { /* absent README reads as empty */ }
    if (!readmeHead.includes('examples/')) add('README.md does not name examples/ in its first ten lines');
  }
  if (level >= 2) {
    checkArtifact('failure', 'refused-or-wrong artifact');
  }
  if (level >= 3) {
    checkArtifact('transcript', 'narration transcript', { markdown: true });
    const card = artifacts.card;
    if (typeof card !== 'string' || card === '') add('artifacts.card not recorded (the 1600x900 card)');
    else {
      // String() for the same reason as in checkArtifact: a disabled guard must misjudge, not crash.
      const cardPath = isAbsolute(String(card ?? '')) ? card : join(root, String(card ?? ''));
      if (!existsSync(cardPath)) add(`artifacts.card does not exist: ${card}`);
      else if (/\.png$/i.test(cardPath)) {
        const size = pngSize(cardPath);
        if (!size) add(`artifacts.card is not a readable PNG: ${card}`);
        else if (size.width !== CARD_WIDTH || size.height !== CARD_HEIGHT) add(`artifacts.card is ${size.width}x${size.height}, not ${CARD_WIDTH}x${CARD_HEIGHT}`);
      }
    }
    const title = lane.video && lane.video.title;
    if (typeof title !== 'string' || title.trim() === '') add('video.title not recorded (the title is the finding)');
    else if (/\bdemo\s*$/i.test(String(title ?? '').trim())) add(`video.title ends in "demo": title it with the finding, never "<name> demo"`);
  }
  if (level >= 4) {
    if (runs.length < MIN_RUNS_SIGNOFF) add(`only ${runs.length} live run(s) recorded; ${MIN_RUNS_SIGNOFF} before any number reaches a judged surface`);
    const rounds = (lane.artifactRounds && typeof lane.artifactRounds === 'object') ? lane.artifactRounds : {};
    for (const key of ROUND_KEYS) {
      const n = rounds[key];
      if (!Number.isInteger(n) || n < 1) add(`artifactRounds.${key} reads ${n === undefined ? 'absent' : String(n)}: the ${key} got no counted review round`);
    }
    const criteria = Array.isArray(lane.criteria) ? lane.criteria.filter((c) => c && typeof c.name === 'string') : [];
    const predicted = (lane.predictedScores && typeof lane.predictedScores === 'object') ? lane.predictedScores : null;
    if (!predicted) add('predictedScores not recorded (pre-register the scores so the result measures the playbook)');
    if (predicted) for (const c of criteria) if (!isNum(predicted[c.name])) add(`predictedScores has no number for "${c.name}"`);
    const bonuses = Array.isArray(lane.bonuses) ? lane.bonuses.filter((b) => b && b.scoresHere === true) : [];
    const sims = Array.isArray(lane.simulations) ? lane.simulations : [];
    const drafts = sims.filter((s) => s && s.on === 'draft' && isDay(s.date) && s.scores && typeof s.scores === 'object');
    if (drafts.length === 0) add('no dated judge simulation on the draft recorded in simulations[]');
    if (drafts.length > 0) {
      const latest = drafts[drafts.length - 1];
      for (const c of criteria) {
        const s = latest.scores[c.name];
        if (!isNum(s) || s < FLOOR_CORE) add(`draft simulation of ${latest.date} scores "${c.name}" at ${isNum(s) ? s : 'nothing'}, below the floor of ${FLOOR_CORE}`);
      }
      for (const b of bonuses) {
        const s = latest.scores[b.name];
        if (!isNum(s) || s < FLOOR_BONUS) add(`draft simulation of ${latest.date} scores bonus "${b.name}" at ${isNum(s) ? s : 'nothing'}, below ${FLOOR_BONUS}`);
      }
    }
    if (bonuses.length > 0) {
      const contribution = (lane.contribution && typeof lane.contribution === 'object') ? lane.contribution : {};
      if (!isHttp(contribution.url)) add('contribution.url not recorded while a bonus scores here (filed and linked is the whole of it)');
      if (typeof contribution.status !== 'string' || contribution.status === '') add('contribution.status not recorded (merged, open, awaiting review)');
    }
    if (!isHttp(lane.video && lane.video.url)) add('video.url not recorded (the video in three places starts with one URL)');
    for (const p of tracked) {
      const lower = p.toLowerCase();
      if (JUDGED_EXACT.has(lower)) { add(`judged process file tracked: ${p}`); continue; }
      for (const [re, what] of JUDGED_SHAPES) if (re.test(p)) add(`judged process file tracked (${what}): ${p}`);
    }
  }

  return { unknown: false, skipped: false, ok: findings.length === 0, findings, root, stage, event: lane.event };
}

/** The exit code a hook reads. Kept apart from scan() so a mutation of either is observable. */
export function exitCodeFor(res, require) {
  if (res.unknown) return 2;
  if (res.skipped) return require ? 2 : 0;
  return res.ok ? 0 : 1;
}

function report(res, require) {
  if (res.unknown) {
    console.error(`[judged-artifacts] UNKNOWN: ${res.reason}`);
    console.error('[judged-artifacts] Refusing to report clean on a check that did not run.');
    return exitCodeFor(res, require);
  }
  if (res.skipped) {
    const line = `[judged-artifacts] SKIPPED: no ${LANE} at ${res.root}. This product is not a judged entry, or intake never wrote the lane file. Nothing was checked.`;
    if (require) {
      console.error(line);
      console.error('[judged-artifacts] --require: on a judged entry a missing lane file is the gate not running, so this is not a pass.');
    } else console.log(line);
    return exitCodeFor(res, require);
  }
  if (res.ok) {
    console.log(`[judged-artifacts] JUDGED clean at stage ${res.stage} (${res.event})`);
    return exitCodeFor(res, require);
  }
  console.error(`[judged-artifacts] ${res.findings.length} finding(s) at stage ${res.stage}:`);
  for (const f of res.findings) console.error(`  ${f}`);
  return exitCodeFor(res, require);
}

// --- selftest -----------------------------------------------------------------------------------
// EVERY RULE GETS ITS OWN ISOLATED CONTROL, each built from one complete lane with one thing removed
// or broken, so a rule that stops firing turns exactly one control red. The mutants twin beside
// this file breaks each rule in turn and requires that.

function fixtureRepo({ files, untracked, exclude, buildLane }) {
  const root = mkdtempSync(join(tmpdir(), 'judged-st-'));
  git(['init', '-q'], root);
  git(['config', 'user.email', 'selftest@example.invalid'], root);
  git(['config', 'user.name', 'selftest'], root);
  const noHooks = join(root, '.no-hooks');
  mkdirSync(noHooks);
  git(['config', 'core.hooksPath', noHooks], root);
  git(['config', 'commit.gpgsign', 'false'], root);
  const noExcludes = join(root, '.git', 'empty-excludes');
  writeFileSync(noExcludes, '');
  git(['config', 'core.excludesFile', noExcludes.replace(/\\/g, '/')], root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'fixture'], root);
  const staged = git(['ls-files'], root).split('\n').filter(Boolean);
  if (staged.length !== Object.keys(files).length) {
    throw new Error(`fixture staged ${staged.length} of ${Object.keys(files).length} file(s), so this case would assert nothing`);
  }
  if (buildLane) writeFileSync(join(root, BUILD_LANE), 'example-lane\n');
  for (const [rel, body] of Object.entries(untracked)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
  appendFileSync(join(root, '.git', 'info', 'exclude'), exclude.map((e) => `/${e}\n`).join(''));
  return root;
}

// A minimal PNG header is all pngSize() reads, so a control can plant any dimensions in 24 bytes.
function pngHeader(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function selftest() {
  const scratch = mkdtempSync(join(tmpdir(), 'judged-st-side-'));
  const dossier = join(scratch, 'event-dossier.md');
  writeFileSync(dossier, '# Event\n');
  const card = join(scratch, 'card.png');
  writeFileSync(card, pngHeader(CARD_WIDTH, CARD_HEIGHT));
  const cardWrong = join(scratch, 'card-wrong.png');
  writeFileSync(cardWrong, pngHeader(1280, 720));
  const cardJpeg = join(scratch, 'card.jpg');
  writeFileSync(cardJpeg, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

  const CRITERIA = [{ name: 'Use of the platform', weight: 1 }, { name: 'Technical execution', weight: 1 }];
  const goodLane = () => ({
    event: 'Example Agent Hackathon',
    rulesUrl: 'https://example.invalid/rules',
    deadline: '2026-09-14T05:45:00+02:00',
    passFail: 'reasonably fits the theme and applies the required APIs',
    criteria: CRITERIA.map((c) => ({ ...c })),
    bonuses: [{ name: 'Contribution', scoresHere: true }],
    prizes: [{ name: 'Grand prize', claim: 'submit the form' }],
    editPolicy: 'editable until the deadline',
    priorWorkClause: 'new work only',
    dossier,
    takeDate: '2026-09-11',
    freezeDate: '2026-09-14',
    artifacts: {
      replay: 'examples/run-1/output.json',
      failure: 'examples/refused-run/output.json',
      transcript: 'examples/demo-transcript.md',
      card,
    },
    runs: ['2026-09-10', '2026-09-11', '2026-09-12'],
    video: { url: 'https://youtu.be/example', title: 'The line it could not read, it refused to guess' },
    contribution: { url: 'https://github.com/example/repo/issues/1', status: 'open, awaiting review' },
    artifactRounds: { description: 2, images: 1, video: 1, readme: 1 },
    predictedScores: { 'Use of the platform': 4, 'Technical execution': 3 },
    simulations: [{ date: '2026-09-12', on: 'draft', scores: { 'Use of the platform': 4, 'Technical execution': 3, Contribution: 2 } }],
  });
  const goodFiles = () => ({
    'README.md': '# Thing\n\nReplay a real run with `node examples/replay.mjs` (see examples/).\n',
    'PRODUCT.md': '# Product\n',
    'examples/run-1/output.json': '{"assets":35}\n',
    'examples/refused-run/output.json': '{"refused":true}\n',
    'examples/demo-transcript.md': '# Narration\n\nFive beats.\n',
  });

  const cases = [];
  const push = (name, spec) => cases.push({ name, ...spec });
  const withLane = (mutate, extra = {}) => {
    const lane = goodLane();
    mutate(lane);
    return { lane, ...extra };
  };

  // Negative space first: skip, require, and the could-not-run states.
  push('no lane file is SKIPPED, exit 0', { lane: null, stage: 'signoff', expect: 'skip', exit: 0 });
  push('no lane file under --require is exit 2, never clean', { lane: null, stage: 'signoff', require: true, expect: 'skip', exit: 2 });
  push('an unreadable lane file is UNKNOWN, exit 2', { lane: '{ not json', stage: 'build', expect: 'unknown' });
  push('a lane file that is a list is UNKNOWN', { lane: '[]', stage: 'build', expect: 'unknown' });
  push('an unknown stage name is UNKNOWN, exit 2', { lane: goodLane(), stage: 'bogus', expect: 'unknown' });
  push('a complete intake passes at build', { lane: goodLane(), stage: 'build', expect: 'clean' });
  push('a complete entry passes at signoff', { lane: goodLane(), stage: 'signoff', expect: 'clean' });
  push('run from a subdirectory judges the whole repo', { lane: goodLane(), stage: 'signoff', expect: 'clean', cwdSub: 'examples' });

  // The lane file as a process file.
  push('a TRACKED lane file is a finding', { lane: goodLane(), trackLane: true, stage: 'build', expect: 'fail', why: /TRACKED/ });
  push('an unignored lane file is a finding', { lane: goodLane(), exclude: [BUILD_LANE], stage: 'build', expect: 'fail', why: /not ignored/ });
  push('no .build-lane beside the lane file is a finding', { lane: goodLane(), buildLane: false, stage: 'build', expect: 'fail', why: /no \.build-lane/ });

  // Intake, one control per field and per shape rule.
  for (const field of INTAKE_FIELDS) {
    push(`intake field missing: ${field}`, withLane((l) => { delete l[field]; }, { stage: 'build', expect: 'fail', why: new RegExp(`intake field missing: ${field}`) }));
  }
  push('rulesUrl must be http(s)', withLane((l) => { l.rulesUrl = 'the rules page'; }, { stage: 'build', expect: 'fail', why: /rulesUrl/ }));
  push('deadline must parse', withLane((l) => { l.deadline = 'Sunday evening'; }, { stage: 'build', expect: 'fail', why: /deadline does not parse/ }));
  push('deadline must carry a timezone', withLane((l) => { l.deadline = '2026-09-14T05:45:00'; }, { stage: 'build', expect: 'fail', why: /timezone/ }));
  push('criteria must be non-empty', withLane((l) => { l.criteria = []; }, { stage: 'build', expect: 'fail', why: /criteria is not a non-empty list/ }));
  push('a criterion needs a numeric weight', withLane((l) => { l.criteria[0].weight = 'high'; }, { stage: 'build', expect: 'fail', why: /no numeric weight/ }));
  push('a bonus says whether it scores here', withLane((l) => { delete l.bonuses[0].scoresHere; }, { stage: 'build', expect: 'fail', why: /scoresHere/ }));
  push('a prize carries its claim action', withLane((l) => { delete l.prizes[0].claim; }, { stage: 'build', expect: 'fail', why: /no claim action/ }));
  push('the dossier must exist', withLane((l) => { l.dossier = join(scratch, 'missing-dossier.md'); }, { stage: 'build', expect: 'fail', why: /dossier does not exist/ }));
  push('takeDate is a day', withLane((l) => { l.takeDate = 'Thursday'; }, { stage: 'build', expect: 'fail', why: /takeDate/ }));
  push('a broken prove artifact does not fail the build stage', withLane((l) => { delete l.artifacts.replay; }, { stage: 'build', expect: 'clean' }));

  // Prove.
  push('prove: the replay run must be recorded', withLane((l) => { delete l.artifacts.replay; }, { stage: 'prove', expect: 'fail', why: /artifacts\.replay not recorded/ }));
  push('prove: the replay run must be tracked', withLane((l) => { l.artifacts.replay = 'examples/run-2/output.json'; }, { stage: 'prove', expect: 'fail', why: /does not exist|not tracked/, untracked: { 'examples/run-2/output.json': '{}\n' } }));
  push('prove: the replay run lives under examples/', withLane((l) => { l.artifacts.replay = 'README.md'; }, { stage: 'prove', expect: 'fail', why: /must live under examples/ }));
  push('prove: a run date is recorded', withLane((l) => { l.runs = []; }, { stage: 'prove', expect: 'fail', why: /no live run recorded/ }));
  push('prove: README names examples/ in its first ten lines', { lane: goodLane(), stage: 'prove', expect: 'fail', why: /README\.md does not name examples/, files: Object.assign(goodFiles(), { 'README.md': '# Thing\n\nInstall it.\n' }) });
  push('prove: a complete prove stage passes', { lane: goodLane(), stage: 'prove', expect: 'clean' });

  // Attack.
  push('attack: the refused-or-wrong artifact must be recorded', withLane((l) => { delete l.artifacts.failure; }, { stage: 'attack', expect: 'fail', why: /artifacts\.failure not recorded/ }));
  push('attack: the refused-or-wrong artifact must exist', withLane((l) => { l.artifacts.failure = 'examples/never-made.json'; }, { stage: 'attack', expect: 'fail', why: /artifacts\.failure does not exist/ }));

  // Refine.
  push('refine: the transcript must be recorded', withLane((l) => { delete l.artifacts.transcript; }, { stage: 'refine', expect: 'fail', why: /artifacts\.transcript not recorded/ }));
  push('refine: the transcript must be markdown', withLane((l) => { l.artifacts.transcript = 'examples/run-1/output.json'; }, { stage: 'refine', expect: 'fail', why: /must be a markdown file/ }));
  push('refine: the card must be recorded', withLane((l) => { delete l.artifacts.card; }, { stage: 'refine', expect: 'fail', why: /artifacts\.card not recorded/ }));
  push('refine: the card must exist', withLane((l) => { l.artifacts.card = join(scratch, 'no-card.png'); }, { stage: 'refine', expect: 'fail', why: /artifacts\.card does not exist/ }));
  push('refine: a PNG card must be 1600x900', withLane((l) => { l.artifacts.card = cardWrong; }, { stage: 'refine', expect: 'fail', why: /1280x720, not 1600x900/ }));
  push('refine: a card that is not a PNG is left unmeasured', withLane((l) => { l.artifacts.card = cardJpeg; }, { stage: 'refine', expect: 'clean' }));
  push('refine: the video title is recorded', withLane((l) => { delete l.video.title; }, { stage: 'refine', expect: 'fail', why: /video\.title not recorded/ }));
  push('refine: a title ending in demo is a finding', withLane((l) => { l.video.title = 'Blast Radar demo'; }, { stage: 'refine', expect: 'fail', why: /ends in "demo"/ }));

  // Sign-off.
  push('signoff: three live runs', withLane((l) => { l.runs = ['2026-09-10']; }, { stage: 'signoff', expect: 'fail', why: /only 1 live run/ }));
  push('signoff: every artifact round above zero', withLane((l) => { l.artifactRounds.video = 0; }, { stage: 'signoff', expect: 'fail', why: /artifactRounds\.video reads 0/ }));
  push('signoff: predicted scores recorded', withLane((l) => { delete l.predictedScores; }, { stage: 'signoff', expect: 'fail', why: /predictedScores not recorded/ }));
  push('signoff: a predicted score per criterion', withLane((l) => { delete l.predictedScores['Technical execution']; }, { stage: 'signoff', expect: 'fail', why: /predictedScores has no number for "Technical execution"/ }));
  push('signoff: a dated draft simulation exists', withLane((l) => { l.simulations = [{ date: '2026-09-12', on: 'live', scores: {} }]; }, { stage: 'signoff', expect: 'fail', why: /no dated judge simulation on the draft/ }));
  push('signoff: the floor holds for every criterion', withLane((l) => { l.simulations[0].scores['Technical execution'] = 2; }, { stage: 'signoff', expect: 'fail', why: /"Technical execution" at 2, below the floor of 3/ }));
  push('signoff: a scored bonus holds its floor', withLane((l) => { l.simulations[0].scores.Contribution = 1; }, { stage: 'signoff', expect: 'fail', why: /bonus "Contribution" at 1, below 2/ }));
  push('signoff: the contribution is linked where a bonus scores', withLane((l) => { delete l.contribution; }, { stage: 'signoff', expect: 'fail', why: /contribution\.url not recorded/ }));
  push('signoff: no contribution demanded where no bonus scores', withLane((l) => { l.bonuses = [{ name: 'Contribution', scoresHere: false }]; delete l.contribution; delete l.simulations[0].scores.Contribution; }, { stage: 'signoff', expect: 'clean' }));
  push('signoff: the video URL is recorded', withLane((l) => { delete l.video.url; }, { stage: 'signoff', expect: 'fail', why: /video\.url not recorded/ }));
  push('signoff: a tracked HUMAN-TODO.md is a finding', { lane: goodLane(), stage: 'signoff', expect: 'fail', why: /judged process file tracked: HUMAN-TODO\.md/, files: Object.assign(goodFiles(), { 'HUMAN-TODO.md': '- [ ] run it live\n' }) });
  push('signoff: a tracked shot list is a finding', { lane: goodLane(), stage: 'signoff', expect: 'fail', why: /a shot list/, files: Object.assign(goodFiles(), { 'docs/video/shot-list-v2.md': '1. open\n' }) });
  push('signoff: submission copy under any name is a finding', { lane: goodLane(), stage: 'signoff', expect: 'fail', why: /submission copy/, files: Object.assign(goodFiles(), { 'notes/devpost-draft.md': 'tagline\n' }) });
  push('signoff: an ordinary docs file is not a process file', { lane: goodLane(), stage: 'signoff', expect: 'clean', files: Object.assign(goodFiles(), { 'docs/RUNBOOK.md': '# Runbook\n' }) });

  let failed = 0;
  let ran = 0;
  const made = [];
  const ok = (name, cond, detail) => {
    ran++;
    if (cond) console.log(`selftest ok: ${name}`);
    else { failed++; console.error(`SELFTEST FAIL: ${name} -> ${detail}`); }
  };
  try {
    for (const c of cases) {
      const files = c.files || goodFiles();
      if (c.trackLane) files[LANE] = JSON.stringify(c.lane, null, 2);
      const untracked = Object.assign({}, c.untracked || {});
      if (c.lane !== null && !c.trackLane) untracked[LANE] = typeof c.lane === 'string' ? c.lane : c.lane;
      const root = fixtureRepo({ files, untracked, exclude: c.exclude || [LANE, BUILD_LANE], buildLane: c.buildLane !== false });
      made.push(root);
      const cwd = c.cwdSub ? join(root, c.cwdSub) : root;
      const res = scan(cwd, c.stage);
      const code = exitCodeFor(res, Boolean(c.require));
      let good;
      let detail = JSON.stringify({ unknown: res.unknown, skipped: res.skipped, ok: res.ok, findings: res.findings, reason: res.reason, code });
      if (c.expect === 'skip') good = res.skipped === true && code === c.exit;
      else if (c.expect === 'unknown') good = res.unknown === true && code === 2;
      else if (c.expect === 'clean') good = res.unknown !== true && res.skipped !== true && res.ok === true && code === 0;
      else good = res.unknown !== true && res.skipped !== true && res.ok === false && code === 1 && res.findings.some((f) => c.why.test(f));
      ok(c.name, good, detail);
    }

    // The shipped CLI, not only the functions behind it: a build that printed every finding and
    // exited 0 would pass everything above.
    const cliRoot = fixtureRepo({ files: goodFiles(), untracked: { [LANE]: (() => { const l = goodLane(); l.runs = []; return l; })() }, exclude: [LANE, BUILD_LANE], buildLane: true });
    made.push(cliRoot);
    const cli = (args, cwd) => {
      try {
        const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd, encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
        return { status: 0, out };
      } catch (e) {
        return { status: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
      }
    };
    const r1 = cli(['--pass', 'signoff'], cliRoot);
    ok('CLI: findings exit 1 and are printed', r1.status === 1 && /only 0 live run/.test(r1.out), JSON.stringify(r1));
    const r2 = cli([], cliRoot);
    ok('CLI: the default stage is the intake, which passes here', r2.status === 0 && /JUDGED clean at stage build/.test(r2.out), JSON.stringify(r2));
    const r3 = cli(['--pass', 'nowhere'], cliRoot);
    ok('CLI: an unknown stage exits 2', r3.status === 2 && /UNKNOWN/.test(r3.out), JSON.stringify(r3));
    const plainRoot = fixtureRepo({ files: goodFiles(), untracked: {}, exclude: [], buildLane: true });
    made.push(plainRoot);
    const r4 = cli(['--pass', 'signoff'], plainRoot);
    ok('CLI: SKIPPED is loud and exits 0 without --require', r4.status === 0 && /SKIPPED/.test(r4.out), JSON.stringify(r4));
    const r5 = cli(['--pass', 'signoff', '--require'], plainRoot);
    ok('CLI: SKIPPED under --require exits 2', r5.status === 2 && /SKIPPED/.test(r5.out), JSON.stringify(r5));
  } finally {
    for (const d of made) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (e) { /* a busy handle on Windows is not a control failure */ } }
    try { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (e) { /* same */ }
  }
  console.log(failed === 0
    ? `\n[judged-artifacts] selftest OK: ${ran} controls, 0 failed.`
    : `\n[judged-artifacts] SELFTEST FAILED (${failed} of ${ran})`);
  return failed === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) process.exit(selftest());
const passAt = argv.indexOf('--pass');
const stage = passAt === -1 ? 'build' : String(argv[passAt + 1] || '');
const require = argv.includes('--require');
process.exit(report(scan(process.cwd(), stage), require));

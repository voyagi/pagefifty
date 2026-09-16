#!/usr/bin/env node
// check-human-todo.mjs - every HUMAN-TODO.md item read the way the owner-items digest reads it.
//
// WHY. HUMAN-TODO.md is where a build parks the work only the owner can do, and a nightly digest
// reads every such file in the estate. Two misreadings waste it. A CODE CHANGE filed as owner work
// sits for weeks on a person while a session could have closed it (one SSRF fix sat 53 days in
// prose). And a date written down as a record ("the rules page read on 2026-08-28") must not be
// counted as a deadline. The digest classifies both, but a digest nobody opens catches nothing, so
// this gate asks the SAME classifier inside the repo, at verify:ship, where the author still is.
//
// THE CLASSIFIER LIVES OUTSIDE THIS REPO, at ~/.claude/scripts/owner-items-digest.js, the one copy
// the nightly digest runs. Copying its rules in here would make two classifiers that drift apart,
// so this gate calls it instead. That makes it the first scaffold gate whose run depends on a file
// the repo does not hold, and its four states were decided in writing before it was built:
//
//   CLASSIFIER ABSENT    SKIPPED, exit 0. A clone, a fresh machine and a CI runner have no
//                        classifier, and failing all of them would get the gate deleted. FAIL OPEN
//                        on purpose: on the machine where the classifier does exist, a SKIPPED means
//                        the path moved, and that is for the nightly rollup to name.
//   PRESENT, UNRUNNABLE  exit 2, and it blocks. Installed and broken is not never installed. The two
//                        are told apart by an existsSync probe made BEFORE the run, never by the
//                        run's own exit code.
//   FINDINGS             exit 1, each offending item named as file:line.
//   CLEAN                exit 0 with the number of items checked, never a silent success.
//
// A repo with no HUMAN-TODO.md prints its own SKIPPED line and exits 0: no owner work filed is not a
// failure. Dated obligations are PRINTED and never failed. A real deadline is legitimate, and only a
// person can tell one from a date of record, so the gate shows exactly which dates the digest will
// count as due.
//
// Exit codes: 0 clean or skipped (the line says which), 1 findings, 2 could not run.
// Usage: node scripts/check-human-todo.mjs [path-to-HUMAN-TODO.md] [--classifier <path>] [--selftest]
//   --classifier points at another copy of the digest (the selftest's stubs, or a moved install).
//   CHECK_HUMAN_TODO_TIMEOUT_MS overrides the 60 s run timeout, so the hang branch is provable.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CLASSIFIER = join(homedir(), '.claude', 'scripts', 'owner-items-digest.js');
const MARK = 'HUMAN-TODO-CLASSIFY ';

// The child asks the classifier through its exported functions rather than its --classify flag,
// because the flag prints findings but no item count, and CLEAN must say what it checked. It is the
// same path: --classify is a thin print around classifyFile, and classifyFile runs parseHumanTodo.
// The BOM is built with fromCharCode, the digest's own reason: a literal one is invisible in a diff.
const CHILD = [
  "const fs = require('fs');",
  'const c = require(process.argv[1]);',
  'const file = process.argv[2];',
  'const res = c.classifyFile(file);',
  'let items = null;',
  "if (res && res.ok === true) items = c.parseHumanTodo(fs.readFileSync(file, 'utf8').replace(new RegExp('^' + String.fromCharCode(0xFEFF)), ''));",
  'const out = { ok: res ? res.ok : null, reason: res ? res.reason : null, findings: res ? res.findings : null,',
  '  items: Array.isArray(items) ? items.map((i) => ({ line: i.line, state: i.state, deadline: i.deadline })) : null };',
  `process.stdout.write(${JSON.stringify(MARK)} + JSON.stringify(out) + '\\n');`,
].join('\n');

function timeoutMs() {
  const n = Number(process.env.CHECK_HUMAN_TODO_TIMEOUT_MS);
  // A typo must not disable the backstop, so anything but a positive number is the default.
  return Number.isFinite(n) && n > 0 ? n : 60000;
}

function firstLine(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || 'no output';
}

function printDue(name, due) {
  if (due.length === 0) return;
  console.log(`[human-todo] ${due.length} dated obligation(s) the digest will count as due. Check each is a deadline, not a date of record:`);
  for (const d of due) console.log(`  ${name}:${d.line}: due ${d.deadline.date} (read from "${d.deadline.raw}")`);
}

function run(cwd, explicitPath, classifier) {
  // Probe ONE, the classifier, on its own and before anything runs.
  if (!existsSync(classifier)) {
    console.log(`[human-todo] SKIPPED: the classifier at ${classifier} is not on this machine. The HUMAN-TODO classification was NOT checked.`);
    return 0;
  }
  const file = explicitPath ? resolve(cwd, explicitPath) : join(cwd, 'HUMAN-TODO.md');
  if (!existsSync(file)) {
    console.log(`[human-todo] SKIPPED: no HUMAN-TODO.md at ${file}. No owner work is filed here, so there is nothing to classify.`);
    return 0;
  }
  const ms = timeoutMs();
  const r = spawnSync(process.execPath, ['-e', CHILD, classifier, file], {
    cwd, encoding: 'utf8', windowsHide: true, timeout: ms, maxBuffer: 16 * 1024 * 1024,
  });
  const unknown = (why) => {
    console.error(`[human-todo] UNKNOWN: the classifier at ${classifier} is present but could not classify ${file}: ${why}. Installed and broken is not the same as absent, so this blocks.`);
    return 2;
  };
  // A timeout sets BOTH error and signal, so the error is read first or it misreports as a kill.
  if (r.error) return unknown(r.error.code === 'ETIMEDOUT' ? `timed out after ${ms} ms` : `could not start (${r.error.code || r.error.message})`);
  if (r.status !== 0) return unknown(r.status === null ? `killed by signal ${r.signal}` : `exited ${r.status} (${firstLine(r.stderr)})`);
  const line = String(r.stdout || '').split(/\r?\n/).find((l) => l.startsWith(MARK));
  if (!line) return unknown('it printed no verdict');
  let v;
  try { v = JSON.parse(line.slice(MARK.length)); } catch { return unknown('its verdict did not parse'); }
  if (!v || typeof v.ok !== 'boolean') return unknown('its verdict carries no ok field');
  if (!v.ok) return unknown(v.reason || 'it could not read the file');
  if (!Array.isArray(v.findings) || !Array.isArray(v.items)) return unknown('its verdict is missing the findings or the items');
  if (v.findings.some((f) => !f || !Number.isInteger(f.line))) return unknown('a finding carries no line number');

  const name = relative(cwd, file) || file;
  const due = v.items.filter((i) => i && i.deadline && typeof i.deadline.date === 'string');
  const open = v.items.filter((i) => i && i.state !== 'done').length;
  if (v.findings.length) {
    console.error(`[human-todo] FINDINGS: ${v.findings.length} of ${v.items.length} item(s) in ${name} read as a code change filed as owner work:`);
    for (const f of v.findings) console.error(`  ${name}:${f.line}: ${f.text}`);
    console.error('[human-todo] Do them in a session, or reword the item so the part only a person can do is what it asks for.');
    printDue(name, due);
    return 1;
  }
  const empty = v.items.length === 0 ? ' The file holds no top-level bullet, so nothing was classified.' : '';
  console.log(`[human-todo] CLEAN: ${v.items.length} item(s) checked in ${name} (${open} not done), none reads as a code change.${empty}`);
  printDue(name, due);
  return 0;
}

// --- selftest ---------------------------------------------------------------
// Hermetic for the gate's own logic: every state runs against a STUB classifier written into a temp
// directory. Then, on a machine that holds the real classifier, a planted misfiled item goes through
// the REAL one, which is the positive control that the gate and the digest still agree.
function selftest() {
  const self = fileURLToPath(import.meta.url);
  const realClassifier = resolve(homedir(), '.claude/scripts/owner-items-digest.js');
  let failures = 0;
  const roots = [];
  const fixture = (todo, classifierSource) => {
    const root = mkdtempSync(join(tmpdir(), 'check-human-todo-st-'));
    roots.push(root);
    if (todo !== null) writeFileSync(join(root, 'HUMAN-TODO.md'), todo);
    const classifier = join(root, classifierSource === null ? 'no-classifier-here.js' : 'classifier.js');
    if (classifierSource !== null) writeFileSync(classifier, classifierSource);
    return { root, classifier };
  };
  const runCli = (fx, { env = {}, useReal = false } = {}) => {
    const args = useReal ? [self] : [self, '--classifier', fx.classifier];
    const r = spawnSync(process.execPath, args, {
      cwd: fx.root, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env }, timeout: 60000,
    });
    return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || '') };
  };
  const check = (name, got, wantCode, wantRe, notRe = null) => {
    const matched = wantRe.test(got.out);
    const forbidden = notRe ? notRe.test(got.out) : false;
    if (got.code !== wantCode || !matched || forbidden) {
      failures++;
      console.error(`SELFTEST FAIL: ${name} -> exit ${got.code} wanted ${wantCode}; ${matched ? 'output matched' : 'output missed ' + wantRe}${forbidden ? '; output held forbidden ' + notRe : ''}`);
    } else console.log(`selftest ok: ${name}`);
  };
  const stub = (classify, items) =>
    `exports.classifyFile = () => (${JSON.stringify(classify)});\nexports.parseHumanTodo = () => (${JSON.stringify(items)});\n`;
  const TODO = '# Owner work\n\n- one\n- two\n- three\n';
  try {
    check('a classifier that is not on this machine is a loud SKIPPED, exit 0',
      runCli(fixture(TODO, null)), 0, /SKIPPED: the classifier at .* is not on this machine\. The HUMAN-TODO classification was NOT checked\./);
    check('a repo with no HUMAN-TODO.md is its own SKIPPED, exit 0',
      runCli(fixture(null, stub({ ok: true, findings: [] }, []))), 0, /SKIPPED: no HUMAN-TODO\.md at /);
    check('a classifier that throws on load is UNKNOWN, exit 2',
      runCli(fixture(TODO, "throw new Error('broken on load');\n")), 2, /UNKNOWN: .*exited 1 /);
    check('a classifier that exits 0 printing nothing is UNKNOWN, exit 2',
      runCli(fixture(TODO, 'process.exit(0);\n')), 2, /UNKNOWN: .*it printed no verdict/);
    check('a verdict that does not parse is UNKNOWN, exit 2',
      runCli(fixture(TODO, `process.stdout.write(${JSON.stringify(MARK)} + '{not json\\n');\nprocess.exit(0);\n`)), 2, /UNKNOWN: .*did not parse/);
    check('a classifier that cannot read the file is UNKNOWN, exit 2',
      runCli(fixture(TODO, stub({ ok: false, reason: 'unreadable: planted', findings: [] }, []))), 2, /UNKNOWN: .*unreadable: planted/);
    check('a verdict with no findings list is UNKNOWN, exit 2',
      runCli(fixture(TODO, stub({ ok: true }, []))), 2, /UNKNOWN: .*missing the findings or the items/);
    check('a finding with no line number is UNKNOWN, exit 2',
      runCli(fixture(TODO, stub({ ok: true, findings: [{ text: 'Fix x in a.ts' }] }, [{ line: 3, state: 'open', deadline: null }]))), 2, /UNKNOWN: .*carries no line number/);
    check('a hung classifier is UNKNOWN after the timeout, exit 2',
      runCli(fixture(TODO, 'for (;;) {}\n'), { env: { CHECK_HUMAN_TODO_TIMEOUT_MS: '1500' } }), 2, /UNKNOWN: .*timed out after 1500 ms/);
    check('a misfiled item exits 1 naming file and line',
      runCli(fixture(TODO, stub({ ok: true, findings: [{ line: 4, text: 'Fix the retry in src/api.ts' }] },
        [{ line: 3, state: 'open', deadline: null }, { line: 4, state: 'open', deadline: null }, { line: 5, state: 'open', deadline: null }]))),
      1, /FINDINGS: 1 of 3 item\(s\)[\s\S]*HUMAN-TODO\.md:4: Fix the retry in src\/api\.ts/);
    check('a clean file exits 0 with the count it checked',
      runCli(fixture(TODO, stub({ ok: true, findings: [] }, [{ line: 3, state: 'open', deadline: null }, { line: 4, state: 'done', deadline: null }]))),
      0, /CLEAN: 2 item\(s\) checked in HUMAN-TODO\.md \(1 not done\)/);
    check('a dated obligation is printed with its line and the words it was read from',
      runCli(fixture(TODO, stub({ ok: true, findings: [] }, [{ line: 5, state: 'open', deadline: { date: '2026-09-13', raw: 'before 2026-09-13' } }]))),
      0, /HUMAN-TODO\.md:5: due 2026-09-13 \(read from "before 2026-09-13"\)/);

    if (existsSync(realClassifier)) {
      check('REAL classifier: a planted code change filed as owner work is caught by file and line',
        runCli(fixture('# Owner work\n\n- Buy or connect a production domain.\n- Implement the retry in src/fetch.ts\n', ''), { useReal: true }),
        1, /FINDINGS: 1 of 2 item\(s\)[\s\S]*HUMAN-TODO\.md:4: Implement the retry in src\/fetch\.ts/);
      check('REAL classifier: owner work quoting a file, a done code item and a date of record stay clean',
        runCli(fixture('# Owner work\n\n- Set `PUBLIC_SITE_URL` to the production origin in the hosting account before the production build.\n- [x] Implement the retry in src/fetch.ts\n- Submit before 2026-09-13 evening CEST. The rules page read on 2026-08-28 shows the form.\n', ''), { useReal: true }),
        0, /CLEAN: 3 item\(s\) checked in HUMAN-TODO\.md \(2 not done\)[\s\S]*HUMAN-TODO\.md:5: due 2026-09-13/, /due 2026-08-28/);
    } else {
      console.log(`selftest NOT RUN: the real classifier is not at ${realClassifier}, so the planted-item control against it did not run. The stub controls above still did.`);
    }
  } finally {
    for (const r of roots) { try { rmSync(r, { recursive: true, force: true }); } catch { /* a busy temp handle is not a verdict */ } }
  }
  if (failures) {
    console.error(`\n[human-todo] SELFTEST FAILED (${failures}). Do not trust this gate.`);
    return 1;
  }
  console.log('\n[human-todo] selftest passed: every state maps to its exit code and says what it checked.');
  return 0;
}

if (process.argv.includes('--selftest')) process.exit(selftest());
const argv = process.argv.slice(2);
const ci = argv.indexOf('--classifier');
if (ci !== -1 && (!argv[ci + 1] || argv[ci + 1].startsWith('-'))) {
  console.error('[human-todo] --classifier needs a path after it. Refusing rather than falling back to the default.');
  process.exit(2);
}
const classifierArg = ci === -1 ? DEFAULT_CLASSIFIER : resolve(argv[ci + 1]);
const pathArg = argv.find((a, i) => !a.startsWith('-') && !(ci !== -1 && i === ci + 1));
process.exit(run(process.cwd(), pathArg, classifierArg));

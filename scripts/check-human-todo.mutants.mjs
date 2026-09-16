#!/usr/bin/env node
// check-human-todo.mutants.mjs - proves check-human-todo.mjs --selftest can actually FAIL.
//
// Each mutant disables exactly ONE decision in the gate and asserts --selftest exits non-zero WITH
// a named control failing. The two guards the sibling harnesses paid for are here from the start:
// a mutant is parsed with node --check first (a SyntaxError exits non-zero exactly like a caught
// mutation), and a non-zero exit with ZERO failed controls is NO VERDICT, never CAUGHT.
//
// Two mutants below are caught only where the REAL classifier exists (the default path and the
// child's call into classifyFile), because only those controls reach it. On any other machine they
// ESCAPE, and the selftest prints why, so this harness is run where the digest lives.
//
// Usage: node scripts/check-human-todo.mutants.mjs
// Exit codes: 0 all mutations caught, 1 at least one escaped, was skipped, or gave no verdict.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'check-human-todo.mjs');
// Folded to LF so anchors holding a newline survive a CRLF checkout; node parses the LF mutant alike.
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

const MUTATIONS = [
  // The four states, and the probe that separates the first two.
  ['the classifier probe runs before the run', 'if (!existsSync(classifier)) {', 'if (false) {'],
  ['an absent classifier exits 0', 'classification was NOT checked.`);\n    return 0;', 'classification was NOT checked.`);\n    return 1;'],
  ['the absent-classifier line is loud', '[human-todo] SKIPPED: the classifier at', '[human-todo] the classifier at'],
  ['the HUMAN-TODO.md probe runs before the run', 'if (!existsSync(file)) {', 'if (false) {'],
  ['a missing HUMAN-TODO.md exits 0','nothing to classify.`);\n    return 0;', 'nothing to classify.`);\n    return 1;'],
  ['a spawn error blocks', 'if (r.error) return unknown(', 'if (false) return unknown('],
  ['a non-zero classifier exit blocks', 'if (r.status !== 0) return unknown(', 'if (false) return unknown('],
  ['a missing verdict blocks', "if (!line) return unknown('it printed no verdict');", 'if (!line) return 0;'],
  ['an unparsable verdict blocks', "catch { return unknown('its verdict did not parse'); }", 'catch { return 0; }'],
  ['an unreadable file blocks', 'if (!v.ok) return unknown(', 'if (false) return unknown('],
  ['the verdict shape check', 'if (!Array.isArray(v.findings) || !Array.isArray(v.items)) return unknown(', 'if (false) return unknown('],
  ['a finding needs a line number', 'if (v.findings.some((f) => !f || !Number.isInteger(f.line))) return unknown(', 'if (false) return unknown('],
  ['findings exit 1', '    printDue(name, due);\n    return 1;', '    printDue(name, due);\n    return 0;'],
  ['a finding names file and line', 'console.error(`  ${name}:${f.line}: ${f.text}`);', 'console.error(`  ${f.text}`);'],
  ['CLEAN prints the count it checked', 'CLEAN: ${v.items.length} item(s) checked', 'CLEAN: item(s) checked'],
  ['dated obligations are printed', 'for (const d of due) console.log(', 'for (const d of []) console.log('],
  // Reachable only through the REAL classifier controls (see the header).
  ['the default classifier path', "join(homedir(), '.claude', 'scripts', 'owner-items-digest.js');", "join(homedir(), '.claude', 'scripts', 'no-such-digest.js');"],
  ['the child asks classifyFile', "'const res = c.classifyFile(file);',", "'const res = { ok: true, findings: [] };',"],
];

const dir = mkdtempSync(join(tmpdir(), 'check-human-todo-mutants-'));
let escaped = 0, skipped = 0, inconclusive = 0;
try {
  MUTATIONS.forEach(([name, find, repl], i) => {
    const hits = src.split(find).length - 1;
    if (hits !== 1) {
      skipped++;
      console.log(`  ${hits === 0 ? 'SKIP' : 'AMBIGUOUS'} ${name} (anchor found ${hits} times - update this harness)`);
      return;
    }
    const mutant = join(dir, `m${i}.mjs`);
    writeFileSync(mutant, src.replace(find, repl));
    try {
      execFileSync(process.execPath, ['--check', mutant], { windowsHide: true, stdio: 'pipe' });
    } catch {
      skipped++;
      console.log(`  UNPARSEABLE ${name} (the mutation is malformed, not the rule; rewrite it)`);
      return;
    }
    let code = 0, out = '', err = '';
    try {
      out = execFileSync(process.execPath, [mutant, '--selftest'], { encoding: 'utf8', windowsHide: true, timeout: 180000, stdio: 'pipe' }) || '';
    } catch (e) {
      code = e.status == null ? -1 : e.status;
      out = String((e && e.stdout) || '');
      err = String((e && e.stderr) || '');
    }
    // Both streams: controls fail through console.error. The colon keeps the summary line out.
    const failuresInRun = ((out + err).match(/SELFTEST FAIL: /g) || []).length;
    if (code === 0) {
      escaped++;
      console.log(`  ESCAPED ${name} (selftest stayed green with the rule disabled - its control is vacuous)`);
    } else if (failuresInRun === 0) {
      inconclusive++;
      console.log(`  NO VERDICT ${name} (exited ${code} without failing a single control)`);
    } else {
      console.log(`  CAUGHT  ${name} (${failuresInRun} control(s) failed)`);
    }
  });
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* a busy temp handle is not a verdict */ }
}

const attempted = MUTATIONS.length - skipped;
console.log(`\n[human-todo-mutants] ${attempted - escaped - inconclusive}/${attempted} mutations caught` +
  (skipped ? `, ${skipped} skipped (fix the harness anchors)` : '') +
  (inconclusive ? `, ${inconclusive} no verdict` : ''));
process.exit(escaped || inconclusive || skipped ? 1 : 0);

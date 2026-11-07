import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/,
];
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
for (const path of files) {
  if (/(^|\/)\.env(?:\.local|\.production)?$/.test(path)) findings.push(path);
  let content; try { content = readFileSync(path, 'utf8'); } catch { continue; }
  if (patterns.some((pattern) => pattern.test(content))) findings.push(path);
}
if (process.argv.includes('--history')) {
  const history = execFileSync('git', ['log', '-p', '--all'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (patterns.some((pattern) => pattern.test(history))) findings.push('repository history (inspect locally without publishing secret values)');
}
if (findings.length) { console.error('Possible secrets found in:', [...new Set(findings)].join(', ')); process.exit(1); }
console.log(`High-confidence credential and tracked-environment scan passed (${files.length} tracked files${process.argv.includes('--history') ? ', including history' : ''}). This is not a guarantee against every possible secret format.`);

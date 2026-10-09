// Prints the CHANGELOG.md section for a version (used as GitHub release notes).
const fs = require('fs');
const version = process.argv[2];
const text = fs.readFileSync(require('path').join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const lines = text.split(/\r?\n/);
const start = lines.findIndex((l) => l.trim() === `## ${version}`);
if (start < 0) {
  process.stdout.write(`WinRemoteOps ${version}\n`);
} else {
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  process.stdout.write(lines.slice(start + 1, end).join('\n').trim() + '\n');
}
process.stdout.write('\n---\nInstall: open the .dmg and drag WinRemoteOps to Applications (universal = any Mac). Already installed? It updates itself.\n');

import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const manifest = JSON.parse(await readFile('src/vendor/mu/UPSTREAM.json', 'utf8'));
for (const entry of manifest.files) assert.equal(createHash('sha256').update(await readFile('src/vendor/mu/' + entry.file)).digest('hex'), entry.sha256, entry.file);
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const secrets = Object.entries(process.env).filter(([key, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(key) && value?.length > 14).map(([, value]) => value);
const leaks = [];
for (const file of files) {
  if (!/\.(json|jsonl|md|ts|js|mjs|yml|yaml|txt|example)$/.test(file)) continue;
  try {
    const text = await readFile(file, 'utf8');
    if (secrets.some(value => text.includes(value))) leaks.push(file);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
assert.deepEqual(leaks, [], 'Configured secret value found in candidate public files');
assert.ok(!files.some(f => /(^|\/)(\.env$|\.reference\/|\.runtime\/|node_modules\/)/.test(f)));
for (const file of ['README.md', 'README.en.md', 'docs/CONFIGURATION.md', 'docs/MIGRATION.md']) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1]; if (/^(https?:|#)/.test(target)) continue;
    const { resolve, dirname } = await import('node:path');
    await stat(resolve(dirname(file), target.split('#')[0]));
  }
}
console.log(JSON.stringify({ upstreamFilesVerified: manifest.files.length, publicCandidateFiles: files.length, configuredSecretValuesChecked: secrets.length, leakedFiles: 0, relativeDocumentationLinks: 'valid' }));

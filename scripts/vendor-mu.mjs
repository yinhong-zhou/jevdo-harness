import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const revision = '8dfebe36508ac0c2508735bb866756dab9283e74';
const upstream = resolve('.reference/mu');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim() !== revision) {
  throw new Error('MU checkout does not match the reviewed revision');
}
const root = resolve(upstream, 'packages/kyrn-judge/src');
const target = resolve('src/vendor/mu');
const pending = [
  ...(await readdir(resolve(root, 'decisions'))).filter(f => f.endsWith('.ts')).map(f => `decisions/${f}`),
  'admission/test-log.ts', 'providers/typesafe.ts', 'judge.ts', 'decision.ts',
  'frame/frame.ts', 'hive/board.ts', 'memory/store.ts', 'compaction/prune.ts',
];
const seen = new Set();
const external = new Set();
const manifest = [];
while (pending.length) {
  const file = pending.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const sourcePath = resolve(root, file);
  if (!sourcePath.startsWith(root + '\\') && !sourcePath.startsWith(root + '/')) throw new Error('Import outside source root');
  const source = await readFile(sourcePath, 'utf8');
  for (const m of source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)) {
    if (!m[1].startsWith('.')) { if (!m[1].startsWith('node:')) external.add(m[1]); continue; }
    const dependency = relative(root, resolve(dirname(sourcePath), m[1])).replaceAll('\\', '/');
    if (dependency.endsWith('.ts')) pending.push(dependency);
  }
  await mkdir(dirname(resolve(target, file)), { recursive: true });
  await writeFile(resolve(target, file), source);
  manifest.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
}
await copyFile(resolve(upstream, 'LICENSE'), resolve(target, 'LICENSE'));
await writeFile(resolve(target, 'UPSTREAM.json'), JSON.stringify({ repository: 'https://github.com/qybaihe/mu', revision, source: 'packages/kyrn-judge/src', files: manifest.sort((a,b) => a.file.localeCompare(b.file)) }, null, 2) + '\n');
console.log(JSON.stringify({ files: seen.size, external: [...external] }));

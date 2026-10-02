import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from '../src/config.ts';
import { makeFixture } from './fixtures.ts';

const root = join(ROOT, '.runtime', 'native-unified-' + Date.now());
await mkdir(root, { recursive: true });
const store = await makeFixture(root, ['alpha']);
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const results: { stage: string; code: number | null; stdout: string; stderr: string }[] = [];
async function run(stage: string, args: string[]) {
  const file = join(root, stage + '.ps1');
  await writeFile(file, '& npm exec --yes --package=@deepseek-ai/dsh@0.2.0-rc.1 -- dsh ' + args.map(quote).join(' ') + '\nexit $LASTEXITCODE\n');
  const result = await new Promise<(typeof results)[number]>((resolve, reject) => {
    const child = spawn('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', file], { cwd: join(root, 'alpha'), windowsHide: true,
      env: { ...process.env, DSH_HOME: join(root, 'dsh-home') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
    const timeout = setTimeout(() => child.kill(), 180000);
    child.on('error', e => { clearTimeout(timeout); reject(e); });
    child.on('close', code => { clearTimeout(timeout); resolve({ stage, code, stdout, stderr }); });
  });
  results.push(result); await writeFile(join(root, 'stages.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ stage, code: result.code }));
  assert.equal(result.code, 0, result.stderr.slice(-3000)); return result;
}
await run('initialize', ['--profile', 'unified-smoke', '--from-default-profile', 'headless', '--dump-config']);
await run('install', ['plugin', '--profile', 'unified-smoke', 'add', ROOT]);
const config = await run('compose', ['--profile', 'unified-smoke', '--dump-config']);
assert.match(config.stdout, /jevdo-harness/);
const patch = join(root, 'smoke.patch.yml');
await writeFile(patch, JSON.stringify([{ id: 'jevdo-harness', config: { home: store.home, agents: [], harness: { mode: 'active' } } }], null, 2));
const execution = await run('execute', ['--profile', 'unified-smoke', '--patch', patch, '--json', 'build_artifact alpha']);
assert.equal(await readFile(join(root, 'alpha', 'artifact.txt'), 'utf8'), 'alpha:2');
const judgments = (await readFile(join(store.home, 'harness', 'judgments.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l));
assert.ok(judgments.some(j => j.specId === 'action.next' && j.source === 'judge'));
await writeFile(join(ROOT, 'reports', 'native-unified-smoke.json'), JSON.stringify({ at: new Date().toISOString(), version: '0.2.0-rc.1',
  success: true, artifact: 'alpha:2', stages: results.map(r => ({ stage: r.stage, code: r.code })),
  judgmentPoints: [...new Set(judgments.map(j => j.specId))], judgmentFallbacks: judgments.filter(j => j.source === 'fallback').map(j => ({ point: j.specId, reason: j.reason })),
  output: execution.stdout, localEvidence: root }, null, 2));
console.log(JSON.stringify({ success: true, artifact: 'alpha:2', root }));

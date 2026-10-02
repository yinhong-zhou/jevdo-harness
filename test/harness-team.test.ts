import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../scripts/fixtures.ts';
import { createHost, runTurn } from '../src/dsh/host.ts';
import { callHostTool } from '../src/dsh/runtime.ts';
import { fixtureJudge } from './harness-support.ts';
import type { ChatModel } from '../src/model.ts';
import { SessionId } from '@deepseek-ai/dsh-session';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const signal = () => new AbortController().signal;

test('native workers share selected findings, retain contradictions, honor read-only tools and clean up ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-team-')), store = await makeFixture(root);
  const fixture = fixtureJudge(id => id === 'difficulty' ? 3 : id === 'share_worthy' || id === 'useful' ? 0.99 : id === 'kind' ? 'finding' : id === 'relation' ? 'contradicts' : undefined);
  const modelsSeen: string[] = [];
  const host = await createHost({ home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha', arm: 'unified',
    harness: { mode: 'off', judge: fixture.judge, modes: { 'hive.publish': 'active', 'hive.deliver': 'active', 'hive.relate': 'active', 'swarm.routing': 'active' },
      team: { models: [{ provider: 'experiment-chat', model: 'cheap-worker' }, { provider: 'experiment-chat', model: 'strong-worker' }] } },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } },
    chat: { async complete(messages, tools) {
      assert.ok(!tools.some(t => t.name === 'write_file' || t.name === 'run_command'));
      const task = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
      const text = task.includes('Investigate B') ? 'The cache server port is 9000. This is verified in config B.' : 'The cache server port is 8000. This is verified in config A.';
      modelsSeen.push(text);
      return { message: { role: 'assistant', content: text }, finishReason: 'stop' };
    } },
  });
  try {
    const parent = await host.create();
    host.ctx.jevHarness.state(parent.agent).request = 'Determine the cache server port';
    const result = JSON.parse(String(await callHostTool(parent.agent, 'jevdo_swarm', { tasks: [{ task: 'Investigate A' }, { task: 'Investigate B' }] }, signal())));
    assert.equal(result.workers.length, 2);
    assert.ok(result.workers.every((w: any) => w.outcome?.kind === 'completed'), JSON.stringify(result.workers));
    assert.equal(result.board.current.length, 2);
    assert.equal(result.board.disputed.length, 2);
    for (const worker of result.workers) assert.equal(host.ctx.agents.get(worker.id), undefined);
    assert.match(JSON.stringify(parent.agent.inbox.nextStep), /Board corrections\/disputes/);
    assert.ok(modelsSeen.length >= 2);
    assert.ok(host.adapter.requests.every(r => r.model === 'strong-worker'));
  } finally { await host.dispose(); }
});

test('canceling a delegated tool stops its native child instead of leaving it running', { timeout: 12000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-team-')), store = await makeFixture(root);
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const host = await createHost({ home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha', arm: 'unified', harness: { mode: 'off' },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } }, chat: { async complete(_m, _t, signal) {
      entered(); await new Promise<void>((_, reject) => signal!.addEventListener('abort', () => reject(new Error('canceled')), { once: true }));
      throw new Error('unreachable');
    } } });
  try {
    const parent = await host.create(), abort = new AbortController();
    const created: string[] = [];
    host.ctx.on('agent/created', ({ agent }) => { created.push(agent.id); return undefined; });
    const run = callHostTool(parent.agent, 'jevdo_swarm', { tasks: [{ task: 'Investigate indefinitely' }] }, abort.signal);
    await started; abort.abort(new Error('Stop delegated work'));
    await assert.rejects(run);
    assert.equal(created.length, 1);
    assert.equal(host.ctx.agents.get(SessionId(created[0])), undefined);
  } finally { await host.dispose(); }
});

test('semantic output monitor prevents a violating tool call, then resumes with the constraint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-monitor-')), store = await makeFixture(root);
  const fixture = fixtureJudge((_id, _q, request) => JSON.stringify(request.state).includes('forbidden') ? 0.99 : 0.01);
  let calls = 0, executed = 0;
  const host = await createHost({ home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha', arm: 'unified',
    harness: { mode: 'off', judge: fixture.judge, modes: { 'output.drift': 'active' }, outputRules: ['Never write forbidden.txt'] },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } },
    chat: { async complete(messages) {
      if (calls++ === 0) return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'bad', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'forbidden.txt', content: 'bad' }) } }] }, finishReason: 'tool_calls' };
      assert.ok(JSON.stringify(messages).includes('previous response was stopped'));
      return { message: { role: 'assistant', content: 'I will respect the file restriction.' }, finishReason: 'stop' };
    } } });
  host.ctx.on('tools/execute', async (exec, next) => { if (exec.name === 'write_file') executed++; return next(); });
  try {
    const parent = await host.create();
    const result = await runTurn(parent.agent, 'Inspect the project');
    assert.equal(result.outcome?.kind, 'completed');
    assert.equal(executed, 0);
    assert.equal(calls, 2);
    assert.ok(result.events.some(e => e.type === 'assistant/attempt'));
  } finally { await host.dispose(); }
});

test('isolated native worker returns an applicable patch including new files without touching parent or real index', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-worktree-')), store = await makeFixture(root), cwd = join(root, 'alpha');
  const git = (...args: string[]) => exec('git', args, { cwd, windowsHide: true });
  await git('init'); await git('add', '.'); await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture');
  const fixture = fixtureJudge(id => id === 'within_task' || id.startsWith('file_') ? 0.99 : undefined);
  let calls = 0;
  const host = await createHost({ arm: 'unified', home: store.home, cwd, projectId: 'alpha', harness: { mode: 'off', modes: { 'swarm.patch': 'active' }, judge: fixture.judge },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } }, chat: { async complete() {
      if (!calls++) return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'worker-write', type: 'function',
        function: { name: 'write_file', arguments: JSON.stringify({ path: 'worker-new.txt', content: 'worker result\n' }) } }] }, finishReason: 'tool_calls' };
      return { message: { role: 'assistant', content: 'Created worker-new.txt' }, finishReason: 'stop' };
    } } });
  try {
    const parent = await host.create();
    const result = JSON.parse(String(await callHostTool(parent.agent, 'jevdo_swarm', { tasks: [{ task: 'Create worker-new.txt', mode: 'isolated' }] }, signal())));
    const worker = result.workers[0]; assert.ok(worker.patch, JSON.stringify(result));
    assert.equal(worker.patch.untrackedFilesIncludedInPatch, true);
    assert.equal(worker.patch.verdict.withinTask, true);
    assert.match(await readFile(worker.patch.path, 'utf8'), /new file mode/);
    await git('apply', '--check', worker.patch.path);
    assert.equal((await git('status', '--porcelain')).stdout.trim(), '');
    assert.equal((await exec('git', ['diff', '--cached', '--name-only'], { cwd: worker.patch.workspace })).stdout.trim(), '');
    assert.equal(await readFile(join(worker.patch.workspace, 'worker-new.txt'), 'utf8'), 'worker result\n');
    assert.ok(fixture.requests.length > 0);
  } finally { await host.dispose(); }
});

test('forked worker inherits the native conversation while fresh worker starts without it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-fork-')), store = await makeFixture(root), seen: boolean[] = [];
  const host = await createHost({ arm: 'unified', home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha', harness: { mode: 'off' },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } }, chat: { async complete(messages) {
      seen.push(JSON.stringify(messages).includes('PARENT_HISTORY_MARKER'));
      return { message: { role: 'assistant', content: 'Inspected inherited evidence.' }, finishReason: 'stop' };
    } } });
  try {
    const parent = await host.create(); await runTurn(parent.agent, 'Remember PARENT_HISTORY_MARKER for later investigation');
    for (const fork of [true, false]) {
      const result = JSON.parse(String(await callHostTool(parent.agent, 'jevdo_swarm', { tasks: [{ task: 'Inspect inherited evidence', fork }] }, signal())));
      assert.ok(!result.workers[0].error, JSON.stringify(result));
      assert.equal(seen.at(-1), fork);
    }
  } finally { await host.dispose(); }
});

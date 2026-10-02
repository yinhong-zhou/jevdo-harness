import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../scripts/fixtures.ts';
import { createHost, runTurn } from '../src/dsh/host.ts';
import { Judge } from '../src/vendor/mu/judge.ts';
import type { Answer } from '../src/vendor/mu/types.ts';
import { decisionPoints, decisions } from '../src/harness/catalog.ts';
import { LiteralDecider } from '../src/decision.ts';
import type { ModelReply } from '../src/model.ts';
import { fixtureJudge } from './harness-support.ts';

const final: ModelReply = { message: { role: 'assistant', content: 'Done.' }, finishReason: 'stop' };
const progressJudge = () => new Judge({ provider: { id: 'offline-fixture', async evaluate(request) {
  return { answers: Object.fromEntries(Object.entries(request.questions).map(([id, q]) => [id,
    { type: 'choice', choice: 'progress', confidence: 1 } satisfies Answer])) };
} } });

test('all 35 registered points correspond to unique, source-pinned decisions', () => {
  assert.equal(decisionPoints.length, 35);
  assert.equal(new Set(decisionPoints.map(id => decisions[id].id)).size, 35);
  for (const id of decisionPoints) assert.equal(decisions[id].id, id);
});

test('unified loop filters one durable transcript for both models, preserves raw output, and replays projections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-unified-'));
  const store = await makeFixture(root);
  const cwd = join(root, 'alpha');
  const raw = 'downloading dependencies...\n'.repeat(300);
  await writeFile(join(cwd, 'download.log'), raw);
  let modelCalls = 0;
  const snapshots: unknown[] = [];
  const options = { arm: 'unified' as const, home: store.home, cwd, projectId: 'alpha', persistence: join(root, 'sessions'),
    harness: { mode: 'off' as const, modes: { 'tool.admission': 'active' as const }, judge: progressJudge(), admissionChars: 100 },
    decider: { async choose(request: any) { snapshots.push(request.state); return { id: 'LLM', confidence: 1 }; } },
    chat: { async complete() {
      if (modelCalls++ === 0) return { message: { role: 'assistant' as const, content: null, tool_calls: [{ id: 'read-log', type: 'function' as const,
        function: { name: 'read_file', arguments: JSON.stringify({ path: 'download.log' }) } }] }, finishReason: 'tool_calls' };
      return final;
    } },
  };
  let host = await createHost(options);
  try {
    const handle = await host.create('projected-session');
    const result = await runTurn(handle.agent, 'Inspect download.log');
    assert.equal(result.outcome?.kind, 'completed');
    const admitted = host.adapter.requests[1].messages;
    const receipt = admitted.find(m => m.role === 'tool');
    assert.ok(receipt);
    assert.match(JSON.stringify(receipt), /Archived routine output/);
    assert.doesNotMatch(JSON.stringify(receipt), /downloading dependencies/);
    assert.match(JSON.stringify(snapshots[1]), /Archived routine output/);
    const original = result.events.find(e => e.type === 'tool/result');
    assert.match(JSON.stringify(original), /downloading dependencies/);
    assert.ok(result.events.some(e => e.type === 'tool/result' && e.surfaceOp !== 'append'));
    const id = JSON.stringify(receipt).match(/[a-f0-9]{64}/)![0];
    assert.match((await host.ctx.jevHarness.context.retrieve(handle.agent, id)).text, /downloading dependencies/);
    await handle.dispose();
  } finally { await host.dispose(); }
  host = await createHost(options);
  try {
    const handle = await host.create('projected-session', true);
    const derived = JSON.stringify(handle.agent.session.deriveMessages());
    assert.match(derived, /Archived routine output/);
    assert.doesNotMatch(derived, /downloading dependencies/);
  } finally { await host.dispose(); }
});

test('unified Actions still bypass the main model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-unified-'));
  const store = await makeFixture(root);
  const host = await createHost({ arm: 'unified', home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha',
    harness: { mode: 'off', judge: progressJudge(), modes: { 'tool.admission': 'shadow' } },
    decider: new LiteralDecider(), chat: { async complete() { throw new Error('Main model must stay asleep'); } } });
  try {
    const handle = await host.create();
    assert.equal((await runTurn(handle.agent, 'build_artifact alpha')).outcome?.kind, 'completed');
    assert.equal(host.adapter.calls, 0);
    assert.equal(await readFile(join(root, 'alpha', 'artifact.txt'), 'utf8'), 'alpha:2');
  } finally { await host.dispose(); }
});

for (const point of ['context.compact', 'context.forget'] as const) test(`${point} archives old receipts, keeps calls paired and protects current results`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-context-')), store = await makeFixture(root), cwd = join(root, 'alpha');
  await writeFile(join(cwd, 'old.txt'), 'OLD-EVIDENCE\n'.repeat(600));
  await writeFile(join(cwd, 'new.txt'), 'CURRENT-EVIDENCE\n'.repeat(300));
  const fixture = fixtureJudge(() => 0.01);
  let calls = 0;
  const host = await createHost({ arm: 'unified', home: store.home, cwd, projectId: 'alpha',
    harness: { mode: 'off', modes: { [point]: 'active' }, judge: fixture.judge, compactChars: 100, keepRecentResults: point === 'context.forget' ? 0 : 1 },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } },
    chat: { async complete() {
      const index = calls++;
      if (index === 0 || (point === 'context.compact' && index === 1)) return { message: { role: 'assistant', content: null,
        tool_calls: [{ id: `read-${index}`, type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: index ? 'new.txt' : 'old.txt' }) } }] }, finishReason: 'tool_calls' };
      return final;
    } } });
  try {
    const h = await host.create();
    await runTurn(h.agent, 'Inspect the old evidence');
    if (point === 'context.forget') await runTurn(h.agent, 'Now work on a different topic');
    const messages = host.adapter.requests.at(-1)!.messages;
    const old = messages.find(m => m.role === 'tool' && m.toolCallId === 'read-0');
    assert.match(JSON.stringify(old), /Earlier result archived/);
    assert.doesNotMatch(JSON.stringify(old), /OLD-EVIDENCE/);
    if (point === 'context.compact') assert.match(JSON.stringify(messages.find(m => m.role === 'tool' && m.toolCallId === 'read-1')), /CURRENT-EVIDENCE/);
    const ids = messages.flatMap(m => m.role === 'assistant' ? m.content.filter(b => b.type === 'tool-call').map(b => b.id) : []);
    const receipts = messages.filter(m => m.role === 'tool').map(m => m.toolCallId);
    assert.deepEqual(ids, receipts);
    const id = JSON.stringify(old).match(/[a-f0-9]{64}/)![0];
    assert.equal(JSON.parse((await host.ctx.jevHarness.context.retrieve(h.agent, id)).text).content, 'OLD-EVIDENCE\n'.repeat(600));
  } finally { await host.dispose(); }
});

for (const mode of ['active', 'shadow', 'off'] as const) test(`test-log admission ${mode} retains failures and obeys its runtime mode`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-log-')), store = await makeFixture(root);
  const raw = Array.from({ length: 40 }, (_, i) => ` ✓ unrelated suite entry ${i} completed successfully (1ms)\n`).join('')
    + 'FAIL critical regression\nError: EXPECTED-FAILURE-EVIDENCE\nTests 40 passed, 1 failed\n';
  const fixture = fixtureJudge(() => 'not_needed');
  let calls = 0;
  const host = await createHost({ arm: 'unified', home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha',
    harness: { mode: 'off', modes: { 'tool.admission.test-log': mode }, judge: fixture.judge, admissionChars: 100 },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } },
    chat: { async complete() { return calls++ ? final : { message: { role: 'assistant', content: null,
      tool_calls: [{ id: 'test-log', type: 'function', function: { name: 'run_tests', arguments: '{}' } }] }, finishReason: 'tool_calls' }; } } });
  host.ctx.tools.register({ name: 'run_tests', description: 'Return a test reporter fixture', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value as string }] }, execute: async () => raw });
  try {
    const h = await host.create(); await runTurn(h.agent, 'Check whether anything failed');
    const output = host.adapter.requests.at(-1)!.messages.find(m => m.role === 'tool')!;
    const text = output.content.filter(b => b.type === 'text').map(b => b.text).join('');
    assert.match(text, /EXPECTED-FAILURE-EVIDENCE/);
    if (mode === 'active') { assert.ok(text.length < raw.length); assert.match(text, /jevdo_archive/); }
    else assert.equal(text, raw);
    assert.equal(fixture.requests.length > 0, mode !== 'off');
  } finally { await host.dispose(); }
});

test('nonzero exit receipts are preserved even when the tool transport succeeds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jev-failure-')), store = await makeFixture(root);
  const raw = JSON.stringify({ exitCode: 1, output: 'FAILURE-EVIDENCE\n'.repeat(400) });
  let n = 0;
  const host = await createHost({ arm: 'unified', home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha',
    harness: { mode: 'off', modes: { 'tool.admission': 'active', 'context.compact': 'active' }, judge: progressJudge(), admissionChars: 1, compactChars: 1, keepRecentResults: 0 },
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } }, chat: { async complete() { return n++ ? final : {
      message: { role: 'assistant', content: null, tool_calls: [{ id: 'failure', type: 'function', function: { name: 'shell_receipt', arguments: '{}' } }] }, finishReason: 'tool_calls' }; } } });
  host.ctx.tools.register({ name: 'shell_receipt', description: 'Return a transport-success command failure', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value as string }] }, execute: async () => raw });
  try { const h = await host.create(); await runTurn(h.agent, 'Read receipt');
    assert.equal(host.adapter.requests[1].messages.find(m => m.role === 'tool')!.content.filter(b => b.type === 'text').map(b => b.text).join(''), raw);
  } finally { await host.dispose(); }
});

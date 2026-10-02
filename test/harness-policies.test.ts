import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { makeFixture } from '../scripts/fixtures.ts';
import { createHost, runTurn } from '../src/dsh/host.ts';
import { callHostTool } from '../src/dsh/runtime.ts';
import { fixtureJudge } from './harness-support.ts';
import type { HarnessOptions } from '../src/harness/runtime.ts';
import type { ChatModel, ModelReply } from '../src/model.ts';
const signal = () => new AbortController().signal;
const final = (content = 'Done.') => ({ message: { role: 'assistant' as const, content }, finishReason: 'stop' });
const call = (name: string, args: unknown, id = 'call'): ModelReply => ({ message: { role: 'assistant', content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finishReason: 'tool_calls' });
async function setup(harness: HarnessOptions, chat: ChatModel = { async complete() { return final(); } }) {
  const root = await mkdtemp(join(tmpdir(), 'jev-policy-')), store = await makeFixture(root);
  const host = await createHost({ home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha', arm: 'unified', harness,
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } }, chat });
  return { root, host, handle: await host.create() };
}

test('input framing records a new constraint and the tool gate blocks a conflicting write', async () => {
  const fixture = fixtureJudge((id, question, req) => id === 'change' ? JSON.stringify(req.state).includes('Never touch') ? 'constraint' : 'new_task'
    : id.startsWith('constraint_') ? 0.99 : question.type === 'choice' && 'multi_step_task' in question.criteria ? 'multi_step_task' : undefined);
  const { host, handle, root } = await setup({ mode: 'off', judge: fixture.judge,
    modes: { 'input.preflight': 'active', 'task.frame': 'active', 'tool.constraint': 'active' } });
  try {
    await runTurn(handle.agent, 'Inspect the source files and configuration.');
    await runTurn(handle.agent, 'Never touch protected.txt');
    assert.ok(host.ctx.jevHarness.state(handle.agent).constraints.includes('Never touch protected.txt'));
    await assert.rejects(() => callHostTool(handle.agent, 'write_file', { path: 'protected.txt', content: 'bad' }, signal()), /Conflicts with user constraint/);
    await assert.rejects(readFile(join(root, 'alpha', 'protected.txt')));
    assert.ok(host.adapter.requests.some(r => JSON.stringify(r.messages).includes('Task type: multi_step_task')));
  } finally { await host.dispose(); }
});

test('mid-turn correction cancels the old model request and reaches the next turn', { timeout: 15000 }, async () => {
  const fixture = fixtureJudge(() => 'correction');
  let entered!: () => void, calls = 0;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'input.interjection': 'active' } }, { async complete(messages, _tools, signal) {
    if (calls++ === 0) { entered(); await new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('canceled')), { once: true })); }
    assert.ok(JSON.stringify(messages).includes('Stop that and inspect the tests'));
    return final('Corrected course.');
  } });
  try {
    const run = runTurn(handle.agent, 'Inspect source'); await started;
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Stop that and inspect the tests' }] }));
    await run; await handle.agent.whenIdle();
    assert.equal(calls, 2);
    const endings = handle.agent.session.snapshotEvents().filter(e => e.type === 'turn/end');
    assert.equal(endings[0].data.reason.kind, 'aborted'); assert.equal(endings[1].data.reason.kind, 'completed');
  } finally { await host.dispose(); }
});

test('completion nudge causes a real verification command after an unchecked edit', async () => {
  const fixture = fixtureJudge(() => 0.99); let calls = 0;
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'turn.completion': 'active' } }, { async complete() {
    if (calls++ === 0) return call('write_file', { path: 'new.txt', content: 'new contents' }, 'write');
    if (calls === 2) return final();
    if (calls === 3) return call('run_command', { command: 'node', args: ['-e', 'const fs=require("fs");if(fs.readFileSync("new.txt","utf8")!=="new contents")process.exit(1);console.log("test passed")'] }, 'check');
    return final();
  } });
  try {
    const result = await runTurn(handle.agent, 'Change a file, then test it');
    assert.equal(result.outcome?.kind, 'completed'); assert.equal(calls, 4);
    assert.ok(host.adapter.requests.some(r => JSON.stringify(r.messages).includes('Before finishing, verify')));
    assert.equal(host.ctx.jevHarness.state(handle.agent).ranAfterEdit, true);
  } finally { await host.dispose(); }
});

test('goal check continues the loop, then records completion; explicit model route overrides automatic choice', async () => {
  const fixture = fixtureJudge((id, _question, req) => id === 'achieved' ? JSON.stringify(req.state).includes('ALL_GOAL_ITEMS_DONE') ? 0.99 : 0.01 : id === 'model' ? 'second' : undefined);
  let calls = 0;
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'goal.met': 'active', 'model.select': 'active' },
    models: [{ id: 'first', provider: 'experiment-chat', model: 'first-model', description: 'General work' }, { id: 'second', provider: 'experiment-chat', model: 'second-model', description: 'Design' }] },
    { async complete() { if (calls++ === 0) return call('jevdo_goal', { operation: 'set', goal: 'Finish both required outputs' }, 'goal'); return final(calls >= 3 ? 'ALL_GOAL_ITEMS_DONE' : 'First part completed.'); } });
  try {
    assert.equal((await runTurn(handle.agent, 'Finish both outputs, using goal mode')).outcome?.kind, 'completed');
    assert.equal(calls, 3); assert.equal(host.ctx.jevHarness.state(handle.agent).goal, undefined);
    assert.ok(host.adapter.requests.every(r => r.model === 'second-model'));
    host.ctx.jevHarness.options.fixedModel = 'first';
    await runTurn(handle.agent, 'Explain the result');
    assert.equal(host.adapter.requests.at(-1)!.model, 'first-model');
  } finally { await host.dispose(); }
});

test('drift proposes a recoverable checkpoint and outcome learning stores a verified recovery lesson', async () => {
  const fixture = fixtureJudge(id => id === 'course' ? 'loop' : id === 'dead_end' || id === 'way_out' ? 0.99 : id === 'progress' ? 0.01 : id.startsWith('worth_') ? 'reusable' : undefined);
  let calls = 0;
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, monitorEvery: 1,
    modes: { 'turn.drift': 'active', 'turn.rewind': 'active', 'memory.outcome': 'active', 'memory.worth': 'active' } }, { async complete(messages) {
    if (JSON.stringify(messages).includes('Extract one reusable, evidence-supported lesson')) return final(JSON.stringify({ trigger: 'Running project tests', lesson: 'Check the actual exit code and repair the failing command before reporting completion.', kind: 'workaround' }));
    if (calls++ === 0) return call('run_command', { command: 'node', args: ['-e', 'process.exit(1)'] }, 'fail');
    if (calls === 2) return call('run_command', { command: 'node', args: ['-e', 'console.log("test passed")'] }, 'test');
    return final();
  } });
  try {
    assert.equal((await runTurn(handle.agent, 'Repair the failing test')).outcome?.kind, 'completed');
    assert.ok(host.adapter.requests.some(r => JSON.stringify(r.messages).includes('Propose returning to this checkpoint')));
    const lesson = host.ctx.jevHarness.memory.store.all().find(l => l.source.origin === 'outcome');
    assert.equal(lesson?.kind, 'workaround');
  } finally { await host.dispose(); }
});

test('file ranking uses real candidates and review triage preserves every finding', async () => {
  const fixture = fixtureJudge((id, question) => id.startsWith('path_') ? String(question.instructions).includes('router.ts') ? 0.99 : 0.1 : id === 'is_bug_0' || id === 'in_scope_0' ? 0.99 : 0.01);
  const { host, handle, root } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'files.locate': 'active', 'review.triage': 'active' } });
  await writeFile(join(root, 'alpha', 'router.ts'), 'export const route = {};');
  try {
    const ranked = JSON.parse(String(await callHostTool(handle.agent, 'jevdo_locate', { query: 'routing implementation' }, signal())));
    assert.equal(ranked.ranked[0].path, 'router.ts');
    const review = JSON.parse(String(await callHostTool(handle.agent, 'jevdo_review', { change: 'Fix routing', findings: [{ text: 'Crashes on empty URL', severity: 'must' }, { text: 'Rename a local variable', severity: 'nit' }] }, signal())));
    assert.equal(review.length, 2); assert.equal(review[0].priority, 'P0'); assert.equal(review[1].priority, 'P3');
  } finally { await host.dispose(); }
});

test('destructive command risk requests confirmation and never dispatches the command', async () => {
  const fixture = fixtureJudge(id => id === 'destructive' ? 0.99 : 0.01);
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'tool.risk': 'active' } });
  let dispatched = false; host.ctx.on('tools/execute', async (exec, next) => { if (exec.name === 'run_command') dispatched = true; return next(); });
  try {
    await assert.rejects(() => callHostTool(handle.agent, 'run_command', { command: 'git', args: ['reset', '--hard'] }, signal()), /destructive|Confirm/);
    assert.equal(dispatched, false);
  } finally { await host.dispose(); }
});

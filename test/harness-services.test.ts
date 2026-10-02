import test from 'node:test';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import * as SkillTool from '@deepseek-ai/dsh-tool-skill';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../scripts/fixtures.ts';
import { createHost, runTurn } from '../src/dsh/host.ts';
import { callHostTool } from '../src/dsh/runtime.ts';
import { fixtureJudge } from './harness-support.ts';
import type { HarnessOptions } from '../src/harness/runtime.ts';
import type { ChatModel } from '../src/model.ts';
const final = { message: { role: 'assistant' as const, content: 'Completed task.' }, finishReason: 'stop' };
const signal = () => new AbortController().signal;
async function setup(harness: HarnessOptions, chat: ChatModel = { async complete() { return final; } }) {
  const root = await mkdtemp(join(tmpdir(), 'jev-services-'));
  const store = await makeFixture(root);
  const host = await createHost({ home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha', arm: 'unified', harness,
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } }, chat });
  return { root, host, handle: await host.create() };
}

test('project memory captures user rules, supersedes them, recalls across agents, and records actual application', async () => {
  const fixture = fixtureJudge((id, _q, request) => id === 'preference' ? (JSON.stringify(request.state).includes('Always use') ? 0.99 : 0.01) : id.startsWith('lesson_') || id.startsWith('applied_') ? 0.99
    : id.startsWith('merge_') ? 'contradicts' : undefined);
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge,
    modes: { 'memory.capture': 'active', 'memory.merge': 'active', 'memory.recall': 'active', 'memory.applied': 'active' } });
  try {
    await runTurn(handle.agent, 'Always use pnpm for this project.');
    await runTurn(handle.agent, 'Always use npm instead of pnpm for this project.');
    const lessons = host.ctx.jevHarness.memory.store.all();
    assert.equal(lessons.length, 2);
    assert.equal(lessons[0].status, 'superseded');
    assert.equal(lessons[1].status, 'active');
    assert.equal(lessons[1].uses.applied, 1);
    assert.match(JSON.stringify(host.adapter.requests.at(-1)), /Relevant project lessons/);
    const next = await host.create();
    await runTurn(next.agent, 'Inspect the source.');
    assert.match(JSON.stringify(host.adapter.requests.at(-1)), /Always use npm instead/);
  } finally { await host.dispose(); }
});

test('model-created memory must pass worth and cannot replace a conflicting user rule', async () => {
  const fixture = fixtureJudge(id => id.startsWith('worth_') ? 'reusable' : id.startsWith('merge_') ? 'contradicts' : undefined);
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'memory.worth': 'active', 'memory.merge': 'active' } });
  try {
    const memory = host.ctx.jevHarness.memory;
    await memory.remember(handle.agent, { trigger: 'package manager', lesson: 'Use npm in this project', kind: 'preference' }, 'user', signal());
    const result = await callHostTool(handle.agent, 'jevdo_remember', { trigger: 'package manager', lesson: 'Use pnpm in this project', kind: 'fact' }, signal());
    assert.equal(JSON.parse(String(result)).reason, 'conflicts_with_user_rule');
    assert.equal(memory.store.all().filter(l => l.status === 'active').length, 1);
  } finally { await host.dispose(); }
});

test('disclosure hides optional schemas and skills, manual discovery restores visibility without overriding a host deny', async () => {
  const fixture = fixtureJudge(id => id.startsWith('skill_') || id.startsWith('capability_') ? 0.01 : undefined);
  const root = await mkdtemp(join(tmpdir(), 'jev-skill-'));
  const path = join(root, 'SKILL.md'); await writeFile(path, 'SQL_SKILL_BODY');
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge,
    modes: { 'skills.disclosure': 'active', 'capability.disclosure': 'active' },
    skills: [{ name: 'sql', description: 'SQL database analysis', path }],
    capabilities: [{ id: 'files', title: 'File reading', description: 'Read workspace files', tools: ['read_file'] }] });
  try {
    await runTurn(handle.agent, 'Write a greeting.');
    assert.ok(!host.adapter.requests.at(-1)!.tools!.some(t => t.name === 'read_file'));
    assert.doesNotMatch(JSON.stringify(host.adapter.requests.at(-1)!.messages), /SQL database analysis/);
    await callHostTool(handle.agent, 'jevdo_capability', { id: 'files' }, signal());
    await callHostTool(handle.agent, 'jevdo_skill', { name: 'sql' }, signal());
    await runTurn(handle.agent, 'Inspect files.');
    assert.ok(host.adapter.requests.at(-1)!.tools!.some(t => t.name === 'read_file'));
    assert.match(JSON.stringify(host.adapter.requests.at(-1)!.messages), /SQL_SKILL_BODY/);
    const undo = handle.agent.ctx.tools.restrict({ deny: ['read_file'] });
    await runTurn(handle.agent, 'Inspect files again.');
    assert.ok(!host.adapter.requests.at(-1)!.tools!.some(t => t.name === 'read_file'));
    undo();
  } finally { await host.dispose(); }
});

test('Jev tool approval never overrules a final host permission guard', async () => {
  const fixture = fixtureJudge(() => 'needed');
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, permissionMode: 'jev', modes: { 'tool.approval': 'active' } });
  let ran = false;
  host.ctx.tools.register({ name: 'write_secret', description: 'Test write', parameters: { type: 'object' },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: async () => { ran = true; return 'bad'; } });
  host.ctx.tools.guard(exec => exec.name === 'write_secret' ? 'DENIED_BY_HOST' : undefined);
  try {
    await assert.rejects(() => callHostTool(handle.agent, 'write_secret', {}, signal()), /DENIED_BY_HOST/);
    assert.equal(ran, false);
  } finally { await host.dispose(); }
});

test('human narration stays outside the working transcript', async () => {
  const fixture = fixtureJudge(id => id === 'phase' ? 'wrapping_up' : id.startsWith('event_') ? 'key' : 0.99);
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'board.read': 'active' },
    boardWriter: { provider: 'experiment-chat', model: 'narrator' } }, { async complete(messages) {
      return JSON.stringify(messages).includes('Write a concise progress update')
        ? { ...final, message: { role: 'assistant', content: 'HUMAN_ONLY_NARRATION' } } : final;
    } });
  const updates: string[] = [];
  host.ctx.on('jevdo/progress', update => { updates.push(update.text); });
  try {
    await runTurn(handle.agent, 'Hello');
    assert.ok(updates.includes('HUMAN_ONLY_NARRATION'));
    assert.doesNotMatch(JSON.stringify(handle.agent.session.snapshotEvents()), /HUMAN_ONLY_NARRATION/);
    await runTurn(handle.agent, 'Continue');
    assert.doesNotMatch(JSON.stringify(host.adapter.requests.filter(r => r.model !== 'narrator')), /HUMAN_ONLY_NARRATION/);
  } finally { await host.dispose(); }
});

test('native DSH skill catalog is filtered once with matching metadata and hidden skills remain loadable', async () => {
  const fixture = fixtureJudge((_id, q) => String(q.instructions).includes('database') ? 0.01 : 0.99);
  const { host, handle } = await setup({ mode: 'off', modes: { 'skills.disclosure': 'active' }, judge: fixture.judge });
  await host.ctx.plugin(SkillRegistry);
  host.ctx.skills.register({ name: 'database', description: 'DATABASE_CATALOG_TEXT', source: 'runtime', content: 'DATABASE_FULL_INSTRUCTIONS' });
  host.ctx.skills.register({ name: 'greeting', description: 'GREETING_CATALOG_TEXT', source: 'runtime', content: 'GREETING_FULL_INSTRUCTIONS' });
  await host.ctx.plugin(SkillTool);
  try {
    await runTurn(handle.agent, 'Write a greeting');
    const first = JSON.stringify(host.adapter.requests.at(-1)!.messages);
    assert.match(first, /GREETING_CATALOG_TEXT/); assert.doesNotMatch(first, /DATABASE_CATALOG_TEXT/);
    await runTurn(handle.agent, 'Write a greeting');
    const catalogs = handle.agent.session.deriveMessages().filter(m => m.role === 'user' && m.source.kind === 'skill-catalog');
    assert.equal(catalogs.length, 1);
    assert.deepEqual((catalogs[0] as any).source.entries.map((e: any) => e.name), ['greeting']);
    const loaded = await callHostTool(handle.agent, 'skill', { name: 'database' }, signal());
    assert.match(JSON.stringify(loaded), /DATABASE_FULL_INSTRUCTIONS/);
    assert.equal((await host.ctx.jevHarness.disclosure.listSkills(handle.agent)).length, 2);
  } finally { await host.dispose(); }
});

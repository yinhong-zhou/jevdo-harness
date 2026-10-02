import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFixture } from '../scripts/fixtures.ts';
import { createHost, runTurn } from '../src/dsh/host.ts';
import { callHostTool } from '../src/dsh/runtime.ts';
import { fixtureJudge } from './harness-support.ts';
import type { HarnessOptions } from '../src/harness/runtime.ts';
import type { ChatModel } from '../src/model.ts';
const signal = () => new AbortController().signal;
const final = { message: { role: 'assistant' as const, content: 'Task finished. Need anything else?' }, finishReason: 'stop' };
async function setup(harness: HarnessOptions, chat: ChatModel = { async complete() { return final; } }) {
  const root = await mkdtemp(join(tmpdir(), 'jev-io-')), store = await makeFixture(root);
  const host = await createHost({ home: store.home, cwd: join(root, 'alpha'), projectId: 'alpha', arm: 'unified', harness,
    decider: { async choose() { return { id: 'LLM', confidence: 1 }; } }, chat });
  return { root, host, handle: await host.create() };
}

test('browser gateway clicks a real observed page element and stops on visible evidence without the main model', async t => {
  let executablePath: string | undefined;
  for (const path of [process.env.JEVDO_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean) as string[]) {
    try { await access(path); executablePath = path; break; } catch { /* Try another installed browser. */ }
  }
  if (!executablePath) return t.skip('Set JEVDO_TEST_BROWSER to an installed Chrome/Chromium executable');
  const server = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html><body><button onclick="document.getElementById(\'result\').textContent=\'SAVED_SUCCESSFULLY\'">Save result</button><p id="result">Awaiting save</p></body></html>'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixture = fixtureJudge((id, _q, request) => id === 'operation' ? JSON.stringify(request.state).includes('SAVED_SUCCESSFULLY') ? 'DONE' : 'CLICK' : id === 'click_target' ? '0' : undefined);
  const { host, handle } = await setup({ mode: 'off', modes: { 'browser.step': 'active' }, judge: fixture.judge, browser: { enabled: true, executablePath } }, { async complete() { throw new Error('No text writer required for this browser task'); } });
  try {
    const port = (server.address() as { port: number }).port;
    const result = JSON.parse(String(await callHostTool(handle.agent, 'jevdo_browse', { goal: 'Save the result', url: `http://127.0.0.1:${port}` }, signal())));
    assert.equal(result.status, 'done'); assert.match(result.page.text, /SAVED_SUCCESSFULLY/); assert.equal(result.steps.length, 1);
    assert.equal(host.adapter.calls, 0);
  } finally { await host.dispose(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

test('real checker diagnostics are held during edits, resolved errors disappear, and unresolved errors reach the model before stopping', async () => {
  const fixture = fixtureJudge(id => id === 'more_edits_coming' ? 0.99 : undefined);
  let calls = 0;
  const { root, host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'diagnostics.delivery': 'active' },
    diagnostics: { format: 'json', command: { command: 'node', args: ['checker.mjs'], cwd: '.', timeoutMs: 10000 } } }, { async complete() {
      if (calls++ === 0) return { message: { role: 'assistant', content: 'I will continue editing after this.', tool_calls: [{ id: 'edit', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'source.txt', content: 'broken' }) } }] }, finishReason: 'tool_calls' };
      return final;
    } });
  await writeFile(join(root, 'alpha', 'source.txt'), 'working');
  await writeFile(join(root, 'alpha', 'checker.mjs'), 'import {readFileSync} from "node:fs"; console.log(JSON.stringify(readFileSync("source.txt","utf8")==="broken"?[{file:"source.txt",severity:"error",message:"BROKEN_SOURCE"}]:[]));');
  try {
    const result = await runTurn(handle.agent, 'Change the source and verify it');
    assert.equal(result.outcome?.kind, 'completed');
    assert.equal(calls, 3);
    assert.ok(!JSON.stringify(host.adapter.requests[1].messages).includes('BROKEN_SOURCE'));
    assert.ok(JSON.stringify(host.adapter.requests[2].messages).includes('BROKEN_SOURCE'));
    const checkpoint = host.ctx.jevHarness.checkpoints.describe(handle.agent);
    const manifest = JSON.parse(await readFile(checkpoint.manifest, 'utf8'));
    assert.equal(Buffer.from(Object.values(manifest.files)[0] && (Object.values(manifest.files)[0] as any).before, 'base64').toString(), 'working');
    await host.ctx.jevHarness.diagnostics.accept(handle.agent, [], 'source.txt', signal());
    assert.equal(await host.ctx.jevHarness.diagnostics.flush(handle.agent, signal()), false);
  } finally { await host.dispose(); }
});

test('cache warming emits one discarded request, never runs proposed tools, and leaves session history unchanged', async () => {
  const fixture = fixtureJudge(id => id === 'open' ? 0.99 : 0.01);
  let calls = 0, warmed!: () => void;
  const ready = new Promise<void>(resolve => { warmed = resolve; });
  const { host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'cache.warming': 'active' }, cacheWarming: { enabled: true, delayMs: 25 } }, { async complete() {
    if (calls++ > 0) { warmed(); return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'ignored', type: 'function', function: { name: 'write_file', arguments: '{}' } }] }, finishReason: 'tool_calls' }; }
    return final;
  } });
  let ran = false; host.ctx.on('tools/execute', async (_exec, next) => { ran = true; return next(); });
  try {
    await runTurn(handle.agent, 'Hello'); const before = handle.agent.session.seq;
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Warming did not run')), 3000))]);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(calls, 2); assert.equal(ran, false); assert.equal(handle.agent.session.seq, before);
    assert.equal(host.adapter.requests[1].maxTokens, 1);
  } finally { await host.dispose(); }
});

test('filesystem observer queues a judged change notice without waking an idle agent', async () => {
  const fixture = fixtureJudge(() => 'next_turn');
  const { root, host, handle } = await setup({ mode: 'off', judge: fixture.judge, modes: { 'notify.routing': 'active' }, observations: { enabled: true, debounceMs: 25 } });
  try {
    await writeFile(join(root, 'alpha', 'external-change.txt'), 'changed externally');
    const deadline = Date.now() + 3000;
    while (!handle.agent.inbox.nextTurn.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
    assert.match(JSON.stringify(handle.agent.inbox.nextTurn), /external-change.txt/);
    assert.equal(host.adapter.calls, 0); assert.equal(handle.agent.status, 'idle');
  } finally { await host.dispose(); }
});

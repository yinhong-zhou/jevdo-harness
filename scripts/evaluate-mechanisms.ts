/** Native DSH comparison + explicitly separate fixed-proposal / routing probes. */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { createHost, runTurn, type Arm } from '../src/dsh/host.ts';
import { CompatibleChatModel } from '../src/model.ts';
import { Store } from '../src/store.ts';
import { Kernel } from '../src/harness/kernel.ts';
import { ExperimentBudget } from './subset-budget.ts';
import { logs, constraints, messages, recipients, relations, goal } from './mechanism-cases.ts';

const live = process.argv.includes('--live');
const taskCase = process.argv.find(a => a.startsWith('--task-case='))?.slice(12);
if (taskCase && !logs.some(c => c.id === taskCase)) throw new Error('Unknown task case');
const runId = process.argv.find(a => a.startsWith('--id='))?.slice(5) ?? 'unified-mechanisms-v1';
if (!/^[a-z0-9-]+$/.test(runId)) throw new Error('Invalid run id');
const report = resolve('reports', runId), scratch = resolve('.runtime', runId);
const protocol = {
  createdAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  transportSha256: createHash('sha256').update(await readFile(new URL('./subset-budget.ts', import.meta.url))).digest('hex'),
  datasetSha256: createHash('sha256').update(JSON.stringify({ logs, constraints, messages, recipients, relations })).digest('hex'),
  model: 'deepseek-flash', judge: 'jev-latest', concurrency: 2, repetitions: 1,
  selection: taskCase ? { taskCase, otherTracksExcluded: true } : 'all',
  tracks: {
    task: '6 synthetic deployment-log repair tasks x 2 arms. Real native official-clean DSH loop versus full unified active runtime, real main model, actual file edits and external exact-value verification. Fresh Action library per task. No forced model tool trajectory.',
    constraint: '8 fixed proposed write_file calls x 2 arms, via native DSH tool execution. The same constraint labels and calls apply to both arms; full runtime enables only tool.constraint and receives the extracted constraint directly. Native tool dispatch has no semantic constraint plugin. Tests an execution guard, not how frequently an autonomous baseline model proposes violations or how accurately task.frame extracts constraints.',
    communication: '8 annotated synthetic notes x 3 recipient tasks; live full-runtime hive.publish / hive.deliver policy replay, plus 4 relation pairs. Control is explicitly a constructed broadcast-all policy, NOT an official DSH broadcast feature or an end-to-end multi-agent task.',
  },
  limits: ['Self-authored small sample; no public benchmark or statistical significance.', 'One live sample per cell; no tuning or retries to select successful outcomes.',
    'Log variants are one task family, not six different developer workflows.', 'Actual API usage is recorded; CNY uses inherited fixed accounting rates, not a provider invoice.',
    'Communication annotations are author judgments and can be disputed; per-case outcomes remain public.', 'All 35 points installed in full task arm, but not all are triggered.'],
  cases: { logs: logs.map(({ raw, ...c }) => ({ ...c, chars: raw.length, sha256: createHash('sha256').update(raw).digest('hex') })), constraints, messages, recipients, relations },
};
if (!live) { console.log(JSON.stringify(protocol, null, 2)); process.exit(0); }
if (!process.env.DEEPSEEK_API_KEY || !process.env.TYPESAFE_API_KEY) throw new Error('Both model API keys are required');
// The accounting transport accepts these official endpoints only.
process.env.DEEPSEEK_MODEL = 'deepseek-flash';
await mkdir(report, { recursive: true });
await writeFile(join(report, 'protocol.json'), JSON.stringify(protocol, null, 2), { flag: 'wx' });
await mkdir(join(report, 'traces'), { recursive: true });
await mkdir(scratch, { recursive: true });
const budget = new ExperimentBudget(join(report, 'usage.json'), null);
const restore = budget.installTransport();
const results: any[] = [];
let saveQueue = Promise.resolve();
const save = (value: unknown) => { results.push(value); const snapshot = JSON.stringify(results, null, 2); saveQueue = saveQueue.then(() => writeFile(join(report, 'results.json'), snapshot)); return saveQueue; };
const json = async (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2));
const usage = (id: string) => {
  const rows = budget.entries.filter(e => e.trial === id);
  return { mainCalls: rows.filter(e => e.service === 'deepseek').length, jevCalls: rows.filter(e => e.service === 'jev').length,
    mainInputTokens: rows.filter(e => e.service === 'deepseek').reduce((s, e) => s + (e.inputTokens ?? 0), 0),
    mainOutputTokens: rows.filter(e => e.service === 'deepseek').reduce((s, e) => s + (e.outputTokens ?? 0), 0),
    jevInputTokens: rows.filter(e => e.service === 'jev').reduce((s, e) => s + (e.inputTokens ?? 0), 0),
    estimatedCny: rows.reduce((s, e) => s + e.upperCny, 0), requestErrors: rows.filter(e => e.status !== 'ok').length };
};
async function setup(id: string) {
  const root = join(scratch, id), cwd = join(root, 'project'), home = join(root, 'home');
  await mkdir(cwd, { recursive: true });
  const store = new Store(home);
  await store.addProject({ id: 'probe', name: 'Mechanism probe', description: 'Synthetic evaluation sandbox', aliases: [], root: cwd });
  return { root, cwd, home, projectId: 'probe' };
}
async function task(c: typeof logs[number], arm: Arm) {
  const id = `task-${c.id}-${arm}`, started = Date.now();
  return budget.runTrial(id, async () => {
    const env = await setup(id);
    await json(join(env.cwd, 'release.json'), { endpoint: 'unset', buildId: 'unset', keepMe: 'unchanged' });
    let inspections = 0, verifications = 0, verifiedSuccess = false;
    const chat = new CompatibleChatModel({ apiKey: process.env.DEEPSEEK_API_KEY!, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', maxTokens: 1800 });
    const host = await createHost({ ...env, arm, chat, maxSteps: 12, harness: { mode: 'active' } });
    host.ctx.tools.register({ name: 'inspect_deployment_log', description: 'Read the complete deployment log for this workspace. Contains verified service addresses and build identifiers.', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] }, execute: async () => { inspections++; return c.raw; } });
    host.ctx.tools.register({ name: 'verify_release', description: 'Check current release.json against the independently verified deployment and ensure unrelated fields are preserved.', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] }, execute: async () => {
        verifications++;
        const actual = JSON.parse(await readFile(join(env.cwd, 'release.json'), 'utf8'));
        verifiedSuccess = actual.endpoint === c.expected.endpoint && actual.buildId === c.expected.buildId && actual.keepMe === 'unchanged';
        return JSON.stringify({ ok: verifiedSuccess, message: verifiedSuccess ? 'Current release matches the deployment; validation passed.' : 'Validation failed: endpoint/buildId or preserved fields do not match. Consult the deployment log.' });
      } });
    try {
      const handle = await host.create(id);
      const turn = await runTurn(handle.agent, c.task, 240000);
      let actual: any; try { actual = JSON.parse(await readFile(join(env.cwd, 'release.json'), 'utf8')); } catch { actual = null; }
      const output = actual?.endpoint === c.expected.endpoint && actual?.buildId === c.expected.buildId && actual?.keepMe === 'unchanged';
      const events = turn.events as any[];
      const logCallIds = new Set(events.filter(e => e.type === 'tool/call' && e.data.name === 'inspect_deployment_log').map(e => e.data.callId));
      const receipts = host.adapter.requests.flatMap(r => r.messages.filter(m => m.role === 'tool' && logCallIds.has(m.toolCallId)));
      const text = (m: any) => m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      const firstView = receipts[0] ? text(receipts[0]) : null;
      let archives = 0, exactRecovery = 0;
      if (arm === 'unified') {
        const archiveRoot = join(host.ctx.jevHarness.context.home, 'archives', createHash('sha256').update(handle.agent.id).digest('hex'));
        for (const file of await readdir(archiveRoot).catch(() => [])) {
          if (!file.endsWith('.txt')) continue;
          const original = await readFile(join(archiveRoot, file), 'utf8');
          if (original !== c.raw) continue;
          archives++;
          if ((await host.ctx.jevHarness.context.retrieve(handle.agent, file.slice(0, -4), 0, 100000)).text === c.raw) exactRecovery++;
        }
      }
      const row = { track: 'task', id, case: c.id, arm, success: output && verifiedSuccess && turn.outcome?.kind === 'completed', externalStateCorrect: output,
        verifiedSuccess, outcome: turn.outcome, actual, inspections, verifications, elapsedMs: Date.now() - started, ...usage(id),
        originalLogChars: c.raw.length, firstAdmittedLogChars: firstView?.length ?? null,
        firstViewEvidenceKept: firstView === null ? null : c.evidence.filter(f => firstView.includes(f)).length, expectedEvidence: c.evidence.length,
        archives, exactRecovery, answer: turn.answer };
      await json(join(report, 'traces', `${id}.json`), { events, requests: host.adapter.requests, judgments: arm === 'unified' ? host.ctx.jevHarness.kernel.memory.records : [] });
      await save(row); console.log(JSON.stringify(row));
    } finally { await host.dispose(); }
  });
}
async function constraint(c: typeof constraints[number], arm: Arm) {
  const id = `constraint-${c.id}-${arm}`, started = Date.now();
  return budget.runTrial(id, async () => {
    const env = await setup(id), file = join(env.cwd, c.path);
    await mkdir(dirname(file), { recursive: true }); await writeFile(file, 'ORIGINAL');
    const host = await createHost({ ...env, arm, harness: { mode: 'off', modes: { 'tool.constraint': 'active' } },
      chat: { async complete() { throw new Error('Fixed-proposal guard probe must not invoke a main model'); } } });
    try {
      const { agent } = await host.create(id);
      // The replay holds the extracted user constraint constant, without evaluating task.frame.
      if (arm === 'unified') host.ctx.jevHarness.state(agent).constraints = [c.rule];
      let error: string | undefined;
      try {
        const r = await agent.ctx.tools.execute({ agent, name: 'write_file', arguments: { path: c.path, content: c.content }, callId: ToolCallId(randomUUID()), signal: AbortSignal.timeout(45000) });
        if (r.isError) error = JSON.stringify(r.content);
      } catch (e) { error = String(e); }
      const executed = await readFile(file, 'utf8') === c.content;
      const row = { track: 'constraint', id, case: c.id, arm, expectedAllowed: c.allowed, executed, correct: executed === c.allowed, error, elapsedMs: Date.now() - started, ...usage(id) };
      if (arm === 'unified') await json(join(report, 'traces', `${id}.json`), host.ctx.jevHarness.kernel.memory.records);
      await save(row); console.log(JSON.stringify(row));
    } finally { await host.dispose(); }
  });
}
async function communication() {
  const id = 'communication', started = Date.now();
  return budget.runTrial(id, async () => {
    const kernel = new Kernel({ home: join(scratch, id), mode: 'active' });
    const routed = [];
    for (const m of messages) {
      const publish = await kernel.decide('hive.publish', { goal, focus: goal, note: m.text, source: 'worker report' }, { sessionId: m.id });
      const delivery = [];
      for (const r of recipients) {
        const result = publish.publish && publish.kind ? await kernel.decide('hive.deliver', { focus: r.focus, note: m.text, kind: publish.kind, from: 'source-worker' }, { sessionId: m.id }) : { deliver: false, score: 0 };
        delivery.push({ recipient: r.id, expected: (m.relevant as readonly string[]).includes(r.id), ...result });
      }
      routed.push({ id: m.id, publish, delivery });
    }
    const compared = [];
    for (const pair of relations) {
      const result = await kernel.decide('hive.relate', { goal, earlier: pair.earlier, later: pair.later }, { sessionId: pair.id });
      compared.push({ id: pair.id, expected: pair.expected, ...result, correct: result.relation === pair.expected });
    }
    const row = { track: 'communication', id, control: 'synthetic-broadcast-all', routed, relations: compared, elapsedMs: Date.now() - started, ...usage(id) };
    await json(join(report, 'traces', `${id}.json`), kernel.memory.records);
    await save(row); console.log(JSON.stringify(row));
  });
}

const allJobs = [
  ...logs.flatMap(c => (['official-clean', 'unified'] as Arm[]).map(arm => ({ id: `task-${c.id}-${arm}`, run: () => task(c, arm) }))),
  ...constraints.flatMap(c => (['official-clean', 'unified'] as Arm[]).map(arm => ({ id: `constraint-${c.id}-${arm}`, run: () => constraint(c, arm) }))),
  { id: 'communication', run: communication },
];
const jobs = taskCase ? allJobs.filter(j => j.id === `task-${taskCase}-official-clean` || j.id === `task-${taskCase}-unified`) : allJobs;
let next = 0;
try {
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await job.run(); } catch (e) { const failure = { track: 'infrastructure-failure', id: job.id, error: String(e), ...usage(job.id) }; await save(failure); console.log(JSON.stringify(failure)); }
    }
  }));
} finally { restore(); await budget.save(); await saveQueue; }
console.log(JSON.stringify({ report, cells: results.length, estimatedCny: budget.upperCny }));

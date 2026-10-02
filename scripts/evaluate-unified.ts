/** Live comparative integration evaluation. No hand-seeded Actions; no score claim. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { JevDecider } from '../src/decision.ts';
import { CompatibleChatModel } from '../src/model.ts';
import { createHost, runTurn, type Arm } from '../src/dsh/host.ts';
import { ExperimentBudget } from './subset-budget.ts';
import { createDeveloperProject, prepareDeveloperCase, verifyDeveloperCase, cleanupDeveloperProject, PROMPTS, type DeveloperCase } from './developer-fixtures.ts';

const revision = process.argv.find(a => a.startsWith('--id='))?.slice(5) ?? 'unified-v1';
assert.match(revision, /^[a-z0-9-]+$/);
const report = join(ROOT, 'reports', revision), scratch = join(ROOT, '.runtime', revision);
const arms = ['official-clean', 'jevaction', 'unified'] as const;
const tasks: DeveloperCase[] = ['start-script', 'test-build'];
const protocol = { id: revision, createdAt: new Date().toISOString(), rows: 17, source: 'Self-authored executable developer fixtures; not a public benchmark.',
  models: { main: 'deepseek-flash', judge: process.env.TYPESAFE_MODEL || 'jev-latest' }, arms,
  comparison: 'Pinned original DSH loop without Action support; JevDo Action loop with harness disabled; combined loop with all available judgment points active.',
  sequence: 'Each arm has its own project and empty Action library. Baseline runs each task once; plugin arms run the same two tasks three times in fresh sessions while retaining only library/project files. All arms then run start-and-edit once.',
  reset: 'Reset fixture source, service state and outputs before every trial; verify effects independently outside model workspace. No user request to save Actions; both plugin arms receive the same Action-authoring policy.',
  configuration: 'Default active judgment modes; no optional browser/checker/watcher/cache-warming backends or alternative model routes in these tasks. This experiment does not exercise all 35 points.',
  controls: { concurrency: 3, maxSteps: 24, timeoutMs: 300000, temperature: 0, thinking: 'disabled', maxOutputTokens: 3000 },
  cost: 'Fixed accounting assumptions inherited from JevDo experiments: CNY 2/M main input, 8/M main output, 0.5/M Jev input. Estimates only, not verified current tariffs or invoices. All API requests counted, including auxiliary writers.',
  limitations: ['One rollout per cell, small scripted project, no baseline variance estimate.', 'Repeated plugin trials measure accumulation plus routing, not routing alone.', 'Parallel wall times include contention.', 'No hand repair or cherry-picking. Failures remain in results.'],
  sourceHashes: Object.fromEntries(await Promise.all(['src/harness/runtime.ts', 'src/harness/kernel.ts', 'src/harness/context.ts', 'src/vendor/dsh-loop/agent.ts', 'src/dsh/policy.ts', 'scripts/evaluate-unified.ts', 'scripts/developer-fixtures.ts'].map(async f => [f, createHash('sha256').update(await readFile(join(ROOT, f))).digest('hex')]))) };
await mkdir(report, { recursive: true });
try { await access(join(report, 'results.json')); throw new Error('Run already exists; select a fresh --id.'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await writeFile(join(report, 'protocol.json'), JSON.stringify(protocol, null, 2));
if (!process.argv.includes('--live')) { console.log(JSON.stringify({ paidCalls: 0, plannedRows: protocol.rows, report })); process.exit(0); }
assert.ok(process.env.TYPESAFE_API_KEY && process.env.DEEPSEEK_API_KEY, 'Both API keys are required');
// All API calls go through the accounting transport; it rejects unpriced models.
const budget = new ExperimentBudget(join(report, 'usage.json'), null), restore = budget.installTransport();
const rows: any[] = [], errors: unknown[] = [];
let writes = Promise.resolve();
const save = () => { const data = JSON.stringify({ complete: rows.length === protocol.rows && !errors.length, rows, errors, costEstimateCny: budget.upperCny }, null, 2);
  writes = writes.then(() => writeFile(join(report, 'results.json'), data)); return writes; };
async function initialize(root: string) {
  const cwd = join(root, 'project'), store = new Store(join(root, 'store'));
  await createDeveloperProject(cwd);
  await store.addProject({ id: 'demo', name: 'Developer demo', aliases: ['this project'], root: cwd, description: 'Current project with documented developer scripts' });
  return { cwd, store };
}
async function trial(root: string, arm: Arm, task: DeveloperCase, round: number) {
  const id = `${arm}-r${round}-${task}`;
  await budget.runTrial(id, async () => {
    const cwd = join(root, 'project'), store = new Store(join(root, 'store'));
    const before = await prepareDeveloperCase(cwd, task), libraryBefore = await store.recipes();
    const host = await createHost({ arm, home: store.home, cwd, projectId: 'demo', maxSteps: 24, persistence: join(root, 'sessions'),
      chat: new CompatibleChatModel({ apiKey: process.env.DEEPSEEK_API_KEY!, baseUrl: 'https://api.deepseek.com', model: protocol.models.main, maxTokens: 3000 }),
      decider: arm === 'jevaction' ? new JevDecider({ apiKey: process.env.TYPESAFE_API_KEY!, model: protocol.models.judge, store }) : undefined,
      harness: { mode: 'active', model: protocol.models.judge } });
    let result: Awaited<ReturnType<typeof runTurn>> | undefined, error: string | undefined;
    let judgments: unknown[] = [];
    const start = Date.now();
    try { const h = await host.create(); result = await runTurn(h.agent, PROMPTS[task], protocol.controls.timeoutMs); }
    catch (e) { error = String(e); }
    finally { judgments = host.ctx.get('jevHarness')?.kernel.memory.records ?? []; await host.dispose(); }
    const external = await verifyDeveloperCase(cwd, task, before), libraryAfter = await store.recipes();
    const entries = budget.entries.filter(e => e.trial === id), model = entries.filter(e => e.service === 'deepseek'), jev = entries.filter(e => e.service === 'jev');
    const fast = (result?.actions ?? []).filter(e => e.kind === 'jevaction/decision' && e.plan?.kind === 'action');
    const row = { id, arm, task, round, prompt: PROMPTS[task], external, outcome: result?.outcome, error,
      success: external.success && result?.outcome?.kind === 'completed', elapsedMs: Date.now() - start,
      modelRequests: model.length, jevRequests: jev.length, inputTokens: model.reduce((s, e) => s + (e.inputTokens ?? 0), 0), outputTokens: model.reduce((s, e) => s + (e.outputTokens ?? 0), 0),
      jevInputTokens: jev.reduce((s, e) => s + (e.inputTokens ?? 0), 0), costEstimateCny: entries.reduce((s, e) => s + e.upperCny, 0),
      savedBefore: libraryBefore.length, savedAfter: libraryAfter.length, fastActions: fast.map(e => e.plan), answer: result?.answer,
      points: [...new Set((judgments as any[]).map(j => j.specId))], judgeFallbacks: (judgments as any[]).filter(j => j.source === 'fallback').map(j => ({ point: j.specId, reason: j.reason })) };
    await mkdir(join(report, 'traces'), { recursive: true });
    await writeFile(join(report, 'traces', id + '.json'), JSON.stringify({ ...row, events: result?.events, actions: result?.actions, judgments, libraryAfter }, null, 2));
    rows.push(row); await save(); await cleanupDeveloperProject(cwd);
    console.log(JSON.stringify({ id, success: row.success, main: row.modelRequests, jev: row.jevRequests, saved: row.savedAfter, fast: fast.length, seconds: +(row.elapsedMs / 1000).toFixed(1) }));
  });
}
await save();
try {
  const completed = await Promise.allSettled(arms.map(async arm => {
    const root = join(scratch, arm);
    if (arm !== 'official-clean') await initialize(root);
    try {
      for (let round = 1; round <= (arm === 'official-clean' ? 1 : 3); round++) for (const task of tasks) {
        const target = arm === 'official-clean' ? join(root, task) : root;
        if (arm === 'official-clean') await initialize(target);
        await trial(target, arm, task, round);
      }
      const target = arm === 'official-clean' ? join(root, 'start-and-edit') : root;
      if (arm === 'official-clean') await initialize(target);
      await trial(target, arm, 'start-and-edit', 4);
    } finally { if (arm !== 'official-clean') await cleanupDeveloperProject(join(root, 'project')); }
  }));
  completed.forEach((r, i) => { if (r.status === 'rejected') errors.push({ arm: arms[i], error: String(r.reason) }); });
} finally { await budget.save(); await save(); restore(); }
console.log(JSON.stringify({ complete: rows.length === protocol.rows && !errors.length, rows: rows.length, errors, costEstimateCny: budget.upperCny }));
if (errors.length) process.exitCode = 1;

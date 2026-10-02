/** Offline aggregation/audit; never calls a model or changes the frozen results. */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { logs } from './mechanism-cases.ts';
import { createHost } from '../src/dsh/host.ts';

const id = process.argv[2] ?? 'unified-mechanisms-v1';
if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid id');
const report = resolve('reports', id), scratch = resolve('.runtime', id);
const rows: any[] = JSON.parse(await readFile(join(report, 'results.json'), 'utf8'));
const usage = JSON.parse(await readFile(join(report, 'usage.json'), 'utf8'));
const byArm = ['official-clean', 'unified'].map(arm => {
  const tasks = rows.filter(r => r.track === 'task' && r.arm === arm);
  const sum = (key: string) => tasks.reduce((n, r) => n + r[key], 0);
  const guard = rows.filter(r => r.track === 'constraint' && r.arm === arm);
  return { arm, tasks: tasks.length, completed: tasks.filter(r => r.success).length, correctFiles: tasks.filter(r => r.externalStateCorrect).length,
    mainCalls: sum('mainCalls'), jevCalls: sum('jevCalls'), mainInputTokens: sum('mainInputTokens'), mainOutputTokens: sum('mainOutputTokens'),
    jevInputTokens: sum('jevInputTokens'), elapsedMs: sum('elapsedMs'), estimatedCny: sum('estimatedCny'), firstAdmittedLogChars: sum('firstAdmittedLogChars'),
    evidenceRetained: sum('firstViewEvidenceKept'), expectedEvidence: sum('expectedEvidence'),
    blockedViolations: guard.filter(r => !r.expectedAllowed && !r.executed).length, proposedViolations: guard.filter(r => !r.expectedAllowed).length,
    allowedLegitimate: guard.filter(r => r.expectedAllowed && r.executed).length, proposedLegitimate: guard.filter(r => r.expectedAllowed).length };
});
const comm = rows.find(r => r.track === 'communication');
const pairs = comm.routed.flatMap((n: any) => n.delivery);
const communication = { baseline: 'synthetic broadcast-all; not a native DSH multi-agent run', candidates: pairs.length,
  delivered: pairs.filter((p: any) => p.deliver).length, relevant: pairs.filter((p: any) => p.expected).length,
  usefulDelivered: pairs.filter((p: any) => p.expected && p.deliver).length, irrelevantDelivered: pairs.filter((p: any) => !p.expected && p.deliver).length,
  strictRelationLabelsCorrect: comm.relations.filter((p: any) => p.correct).length,
  relationNote: '3/4 exact outcome labels. The fourth judge chose none with probability 1; MU pickChoice treats none as an escape and the public outcome is null, meaning no relation added. Raw labels are not overwritten.',
  jevCalls: comm.jevCalls, estimatedCny: comm.estimatedCny };
const archiveAudit = [];
// The live runner v1 looked in home/archives instead of home/harness/archives.
// Audit through a fresh native DSH session and the actual public retrieval API.
for (const c of logs) {
  const trial = `task-${c.id}-unified`, root = join(scratch, trial), home = join(root, 'home'), cwd = join(root, 'project');
  const host = await createHost({ home, cwd, projectId: 'probe', arm: 'unified', harness: { mode: 'off' },
    chat: { async complete() { throw new Error('Offline archive audit cannot call models'); } } });
  try {
    const handle = await host.create(trial);
    const archiveRoot = join(host.ctx.jevHarness.context.home, 'archives', createHash('sha256').update(handle.agent.id).digest('hex'));
    const matches = [];
    for (const file of await readdir(archiveRoot).catch(() => [])) {
      if (!file.endsWith('.txt') || await readFile(join(archiveRoot, file), 'utf8') !== c.raw) continue;
      const value = await host.ctx.jevHarness.context.retrieve(handle.agent, file.slice(0, -4), 0, 100000);
      matches.push({ sha256: file.slice(0, -4), chars: value.totalChars, byteExact: Buffer.from(value.text).equals(Buffer.from(c.raw)) });
    }
    archiveAudit.push({ trial, liveCounterWasIncorrect: true, expectedArchive: c.id !== 'failed-receipt', matches });
  } finally { await host.dispose(); }
}
const allJudgments = [];
for (const file of await readdir(join(report, 'traces'))) {
  const value = JSON.parse(await readFile(join(report, 'traces', file), 'utf8'));
  allJudgments.push(...(Array.isArray(value) ? value : value.judgments ?? []));
}
const summary = { byArm, communication, archiveAudit,
  audit: { judgmentRows: allJudgments.length, fallbacks: allJudgments.filter(j => j.source === 'fallback').length,
    decisionPointsObserved: [...new Set(allJudgments.map(j => j.specId))].sort(),
    returnedModels: [...new Set(usage.entries.map((e: any) => e.returnedModel).filter(Boolean))],
    totalRequests: usage.entries.length, failedRequests: usage.entries.filter((e: any) => e.status !== 'ok').length,
    infrastructureFailures: rows.filter(r => r.track === 'infrastructure-failure').length, estimatedCny: usage.upperCny,
    corrections: ['Archive counters in frozen results.json were measured at the wrong subdirectory. Separate archiveAudit uses the actual context retrieval API; no task/model requests were rerun.',
      'No relation outcome label was changed: inspect the judge answer none and its null policy mapping before treating strict-label mismatch as an incorrect relation.'] } };
await writeFile(join(report, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

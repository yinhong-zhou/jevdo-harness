import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import { isTestLog, planTestLog, renderTestLog } from '../vendor/mu/admission/test-log.ts';
import type { Kernel } from './kernel.ts';
import { textOf, originFor, type SessionState } from './state.ts';

function failedReceipt(text: string) {
  try {
    const value = JSON.parse(text);
    return value?.timedOut === true || (typeof value?.exitCode === 'number' && value.exitCode !== 0);
  } catch { return false; }
}

export interface ContextOptions { admissionChars?: number; compactChars?: number; keepRecentResults?: number }
// Use native surface replacements: DSH 0.2.0-rc.1's persistence deliberately
// rejects unknown required event names. Raw append-origin records are retained.
export class ContextManager {
  private readonly admitted = new WeakMap<Agent, Map<string, string>>();
  private readonly tombstones = new WeakMap<Agent, Map<string, string>>();
  constructor(readonly home: string, readonly kernel: Kernel, readonly options: ContextOptions = {}) {}
  private archiveRoot(sessionId: string) {
    return resolve(this.home, 'archives', createHash('sha256').update(sessionId).digest('hex'));
  }
  async archive(agent: Agent, text: string) {
    const id = createHash('sha256').update(text).digest('hex');
    const root = this.archiveRoot(agent.id);
    await mkdir(root, { recursive: true });
    await writeFile(resolve(root, `${id}.txt`), text, { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    return id;
  }
  async retrieve(agent: Agent, id: string, offset = 0, limit = 20000) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid archive id');
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) throw new Error('Invalid archive range');
    let text: string;
    try { text = await readFile(resolve(this.archiveRoot(agent.id), `${id}.txt`), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // A fork owns its inherited transcript, but never arbitrary sibling archives.
      const inherited = agent.session.snapshotEvents().filter(e => e.type === 'tool/result')
        .map(e => textOf(e.data.message)).find(t => createHash('sha256').update(t).digest('hex') === id);
      if (inherited === undefined) throw error;
      text = inherited;
    }
    return { text: text.slice(offset, offset + Math.min(limit, 100000)), offset, totalChars: text.length };
  }
  async project(agent: Agent, state: SessionState, request: GenerateOptions, signal: AbortSignal): Promise<GenerateOptions> {
    let cache = this.admitted.get(agent);
    if (!cache) this.admitted.set(agent, cache = new Map());
    let tombstones = this.tombstones.get(agent);
    if (!tombstones) this.tombstones.set(agent, tombstones = new Map());
    const events = agent.session.snapshotEvents();
    const callInfo = new Map(events.filter(e => e.type === 'tool/call').map(e => [e.data.callId, e.data]));
    const resultTurns = new Map(events.filter(e => e.type === 'tool/result').map(e => [e.data.message.toolCallId, e.data.turn]));
    const resultEvents = new Map(events.filter(e => e.type === 'tool/result').map(e => [e.data.message.toolCallId, e]));
    const rawResults = new Map(events.filter(e => e.type === 'tool/result').filter(e => e.surfaceOp === 'append').map(e => [e.data.message.toolCallId, e]));
    const committedEdits = new Map([...resultEvents].filter(([, e]) => e.surfaceOp !== 'append').map(([id, e]) => [id, textOf(e.data.message)]));
    const resultIds = request.messages.filter(m => m.role === 'tool').map(m => m.toolCallId);
    const recentCount = this.options.keepRecentResults ?? 3;
    const protectedIds = new Set(recentCount > 0 ? resultIds.slice(-recentCount) : []);
    let total = JSON.stringify(request.messages).length;
    const budget = this.options.compactChars ?? 100000;
    for (const message of request.messages) {
      signal.throwIfAborted();
      // Preserve all message identities, calls, ordering, images and non-tool roles.
      if (message.role !== 'tool' || message.isError || message.content.some(b => b.type !== 'text')) {
        continue;
      }
      const resultEvent = resultEvents.get(message.toolCallId);
      if (!resultEvent) continue;
      const original = textOf(rawResults.get(message.toolCallId)?.data.message ?? resultEvent.data.message);
      // Shell transport may succeed while the command itself fails. Keep the
      // complete failure receipt even when the tool does not set isError.
      if (failedReceipt(original)) continue;
      const info = callInfo.get(message.toolCallId);
      const call = info ? `${info.name}: ${JSON.stringify(info.arguments)}` : String(message.toolCallId);
      const key = `${message.toolCallId}:${createHash('sha256').update(original).digest('hex')}`;
      let text = tombstones.get(key) ?? cache.get(key) ?? committedEdits.get(message.toolCallId) ?? original;
      const origin = originFor(agent, state);
      // Decisions are sticky for a tool receipt. Archives retain the exact raw output.
      if (!cache.has(key) && !committedEdits.has(message.toolCallId) && original.length >= (this.options.admissionChars ?? 4000) && !call.startsWith('jevdo_archive')) {
        const id = await this.archive(agent, original);
        const pointer = `Retrieve full original with jevdo_archive({"id":"${id}"}).`;
        if (isTestLog(call, original)) {
          const mode = this.kernel.engine.getMode('tool.admission.test-log');
          if (mode !== 'off') {
            const plan = await this.kernel.withOrigin(origin, () => planTestLog({ output: original, call, goal: state.request, intent: call }, 'jev', this.kernel.engine, { signal }));
            // Upstream rules folding is independent; shadow must not change the output.
            if (mode === 'active') text = renderTestLog(plan, `jevdo-archive:${id}`).text;
            if (text !== original) text += `\n${pointer}`;
          }
        } else {
          const chunks = original.match(/[\s\S]{1,2400}/g) ?? [];
          // Bound each batch, retain any chunk whose classifier cannot answer.
          const kept: string[] = [];
          for (let i = 0; i < chunks.length; i += 12) {
            const batch = chunks.slice(i, i + 12);
            const outcomes = await this.kernel.decide('tool.admission', { call, chunks: batch }, origin, signal);
            batch.forEach((chunk, j) => kept.push(outcomes[j]?.drop ? '[Archived routine output]' : chunk));
          }
          const candidate = kept.join('');
          if (candidate.length < original.length) text = `${candidate}\n${pointer}`;
        }
        signal.throwIfAborted();
        cache.set(key, text);
      }
      const ageTurns = state.turn - (resultTurns.get(message.toolCallId) ?? state.turn);
      if (total > budget && !protectedIds.has(message.toolCallId) && !tombstones.has(key)) {
        const since = state.actions.slice(-6).map(a => `${a.tool}: ${a.what}`);
        const forget = ageTurns > 0 ? await this.kernel.decide('context.forget', {
          call, goal: state.request, resultChars: original.length, ageTurns, since,
        }, origin, signal) : 'keep';
        const compact = forget === 'shrink' ? null : await this.kernel.decide('context.compact', {
          call, goal: state.request, resultHead: original.slice(0, 2500), resultChars: original.length, isError: false, since,
        }, origin, signal);
        if (forget === 'shrink' || (compact?.keepResult !== null && compact?.keepResult !== undefined && compact.keepResult <= 0.2)) {
          const id = await this.archive(agent, original);
          text = `[Earlier result archived; call retained. Retrieve with jevdo_archive({"id":"${id}"}).]`;
          tombstones.set(key, text);
        }
      }
      total -= textOf(message).length - text.length;
      if (text !== textOf(message)) agent.session.append('tool/result', {
        ...resultEvent.data, message: { ...message, content: [{ type: 'text', text }] },
      }, { surfaceOp: { op: 'replace', startSeq: resultEvent.seq, endSeq: resultEvent.seq }, sourceEventSeqs: [resultEvent.seq] });
    }
    return { ...request, messages: agent.session.deriveMessages() };
  }
}

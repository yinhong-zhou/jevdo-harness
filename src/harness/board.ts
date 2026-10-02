import type { Agent } from '@deepseek-ai/dsh-agent';
import { mkdir, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HarnessRuntime } from './runtime.ts';
import { originFor, type SessionState } from './state.ts';
import { writeText } from './support.ts';
import type { BoardReading } from '../vendor/mu/decisions/board-read.ts';

export interface ProgressUpdate { sessionId: string; turn: number; phase: string; text: string; needsUser: boolean }
declare module '@deepseek-ai/cordis' { interface Events { 'jevdo/progress'(update: ProgressUpdate): void } }
export class ProgressBoard {
  private readonly last = new WeakMap<Agent, { reading: BoardReading; text: string; count: number }>();
  constructor(readonly runtime: HarnessRuntime) {}
  async update(agent: Agent, state: SessionState, latest: string, ended: boolean, signal: AbortSignal) {
    const previous = this.last.get(agent);
    const events = state.boardEvents.slice(ended ? 0 : previous?.count ?? 0).slice(-16);
    if (!ended && !events.length) return;
    const reading = await this.runtime.kernel.decide('board.read', { goal: state.frame?.goal ?? state.request,
      items: state.frame?.acceptance ?? [], steps: state.actions.slice(-8), latest, ended, events,
      ...(previous ? { last: { phase: previous.reading.phase, now: previous.text } } : {}) }, originFor(agent, state), signal);
    if (!reading.update && !ended) return;
    const selected = reading.key.map(i => events[i]).filter(Boolean).map(e => e.text);
    let text = selected.join('\n') || latest || reading.phase;
    if (this.runtime.options.boardWriter) {
      try { text = await writeText(agent, 'Write a concise progress update for the human, in the language of the goal. Mention only supplied evidence and uncertainty. Do not issue instructions to the working agent. At most three sentences.',
        { goal: state.request, phase: reading.phase, events: selected, ended, latest }, signal, this.runtime.options.boardWriter); }
      catch { signal.throwIfAborted(); }
    }
    const update: ProgressUpdate = { sessionId: agent.id, turn: state.turn, phase: reading.phase, text, needsUser: reading.needsUser };
    this.last.set(agent, { reading, text, count: state.boardEvents.length });
    await mkdir(this.runtime.options.home, { recursive: true });
    await appendFile(resolve(this.runtime.options.home, 'progress.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...update }) + '\n');
    // Deliberately no session append / steer: narration is for people only.
    this.runtime.ctx.emit('jevdo/progress', update);
  }
}

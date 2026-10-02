import type { Agent } from '@deepseek-ai/dsh-agent';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HarnessRuntime } from './runtime.ts';
import { originFor } from './state.ts';

export interface WarmingOptions { enabled?: boolean; delayMs?: number; defaultWarm?: boolean }
/** At most one discarded 1-token refresh per idle boundary; never executes model tools. */
export class CacheWarmer {
  private readonly requests = new WeakMap<Agent, GenerateOptions>();
  private readonly ready = new WeakSet<Agent>();
  private readonly jobs = new Map<Agent, { timer: ReturnType<typeof setTimeout>; abort: AbortController; done?: Promise<void> }>();
  private readonly pending = new Set<Promise<void>>();
  constructor(readonly runtime: HarnessRuntime) {}
  remember(agent: Agent, request: GenerateOptions) { this.requests.set(agent, request); }
  async consider(agent: Agent, final: string, signal: AbortSignal) {
    if (!this.runtime.options.cacheWarming?.enabled || !this.requests.has(agent)) return;
    const state = this.runtime.state(agent);
    const choice = await this.runtime.kernel.decide('cache.warming', { lastUserMessage: state.request, lastAssistantMessage: final }, originFor(agent, state), signal);
    if (choice === 'warm' || choice === 'default' && this.runtime.options.cacheWarming.defaultWarm) this.ready.add(agent);
    else { this.ready.delete(agent); this.cancel(agent); }
  }
  cancel(agent: Agent) { const job = this.jobs.get(agent); if (job) { clearTimeout(job.timer); job.abort.abort(); this.jobs.delete(agent); } this.ready.delete(agent); }
  private schedule(agent: Agent) {
    if (!this.ready.has(agent) || this.jobs.has(agent)) return;
    this.ready.delete(agent);
    const request = this.requests.get(agent); if (!request) return;
    const abort = new AbortController();
    const job = { timer: setTimeout(() => {
      // Optional background work must not create unhandled rejections, including
      // when its audit directory becomes unavailable during shutdown.
      job.done = run().catch(() => {}).finally(() => this.pending.delete(job.done!));
      this.pending.add(job.done);
    }, this.runtime.options.cacheWarming?.delayMs ?? 60000), abort, done: undefined as Promise<void> | undefined };
    job.timer.unref(); this.jobs.set(agent, job);
    const run = async () => {
      if (agent.status !== 'idle' || abort.signal.aborted) { if (this.jobs.get(agent) === job) this.jobs.delete(agent); return; }
      let inputTokens = 0, outputTokens = 0, status = 'refreshed';
      try {
        for await (const chunk of agent.ctx.llm.stream({ ...request, messages: agent.session.deriveMessages(), maxTokens: 1, signal: abort.signal })) {
          if (chunk.type === 'usage') { inputTokens += chunk.usage.inputTokens ?? 0; outputTokens += chunk.usage.outputTokens ?? 0; }
          // Deliberately discard all generated content, including tool calls.
        }
      } catch { status = abort.signal.aborted ? 'canceled' : 'failed'; }
      finally {
        if (this.jobs.get(agent) === job) this.jobs.delete(agent);
        await mkdir(this.runtime.options.home, { recursive: true });
        await appendFile(resolve(this.runtime.options.home, 'cache-warming.jsonl'), JSON.stringify({ sessionId: agent.id, at: new Date().toISOString(), inputTokens, outputTokens, status }) + '\n');
      }
    };
  }
  install() {
    const ctx = this.runtime.ctx;
    ctx.on('agent/status', ({ agent, status }) => { if (status === 'running') this.cancel(agent); else this.schedule(agent); });
    ctx.on('agent/inbox/inserted', ({ agent }) => { this.cancel(agent); });
    ctx.on('agent/disposed', ({ agent }) => { this.cancel(agent); });
    ctx.effect(() => async () => { for (const agent of this.jobs.keys()) this.cancel(agent); await Promise.allSettled(this.pending); });
  }
}

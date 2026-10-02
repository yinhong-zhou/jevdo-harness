import type { Agent } from '@deepseek-ai/dsh-agent';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { HarnessRuntime } from './runtime.ts';
import { note, originFor } from './state.ts';

/** One bounded semantic watcher; reasoning text never enters the classifier. */
export class OutputMonitor {
  readonly abort = new AbortController();
  readonly signal: AbortSignal;
  private text = '';
  private checked = 0;
  private pending?: Promise<void>;
  broken: string[] = [];
  constructor(readonly runtime: HarnessRuntime, readonly agent: Agent, readonly parentSignal: AbortSignal, readonly rules: string[]) {
    this.signal = AbortSignal.any([parentSignal, this.abort.signal]);
  }
  observe(chunk: StreamChunk) {
    if (chunk.type === 'text-delta') this.text += chunk.text;
    if (chunk.type === 'tool-call-delta') this.text += chunk.argumentsDelta ?? '';
    if (this.text.length - this.checked >= 800 && !this.pending) this.start();
  }
  private start() {
    if (!this.text || this.broken.length || this.parentSignal.aborted) return;
    this.checked = this.text.length;
    this.pending = this.runtime.kernel.decide('output.drift', { recentOutput: this.text.slice(-4000), rules: this.rules },
      originFor(this.agent, this.runtime.state(this.agent)), this.parentSignal).then(result => {
      if (!result.broken.length) return;
      this.broken = result.broken.map(i => this.rules[i]).filter(Boolean);
      if (this.broken.length) this.abort.abort(new Error('Output violates user constraints'));
    }).catch(() => { /* Unavailable judge cannot cut an otherwise valid answer. */ }).finally(() => { this.pending = undefined; });
  }
  async finish() {
    await this.pending;
    if (this.text.length > this.checked && !this.broken.length) { this.start(); await this.pending; }
    this.parentSignal.throwIfAborted();
    if (!this.broken.length) return false;
    this.runtime.state(this.agent).outputCorrections++;
    this.agent.inject(note('The previous response was stopped before executing its proposed tools because it conflicted with these user constraints. Reconsider and continue within them:\n' + this.broken.join('\n')));
    return true;
  }
}

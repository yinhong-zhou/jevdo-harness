import { watch, type FSWatcher } from 'node:fs';
import { resolve } from 'node:path';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { HarnessRuntime } from './runtime.ts';

export interface ObservationOptions { enabled?: boolean; debounceMs?: number }
/** Filesystem events are hints to re-read current state, never claims that a write succeeded. */
export class WorkspaceObserver {
  private readonly watches = new Map<Agent, { watcher: FSWatcher; timer?: ReturnType<typeof setTimeout>; abort: AbortController; paths: Set<string>; pending?: Promise<void> }>();
  constructor(readonly runtime: HarnessRuntime) {}
  start(agent: Agent) {
    if (!this.runtime.options.observations?.enabled || !agent.session.header.cwd) return;
    const abort = new AbortController(), paths = new Set<string>();
    const entry = { watcher: undefined as unknown as FSWatcher, abort, paths, timer: undefined as ReturnType<typeof setTimeout> | undefined, pending: undefined as Promise<void> | undefined };
    entry.watcher = watch(resolve(agent.session.header.cwd), { recursive: true, persistent: false }, (_kind, path) => {
      const name = String(path ?? '').replaceAll('\\', '/');
      if (!name || /(^|\/)(node_modules|dist|build|coverage|\.jevdo|\.jevaction|\.env[^/]*)($|\/)/.test(name)) return;
      if (name.startsWith('.git/') && !['.git/HEAD', '.git/index'].includes(name)) return;
      if (paths.size < 40) paths.add(name);
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        const changed = [...paths]; paths.clear();
        entry.pending = (entry.pending ?? Promise.resolve()).catch(() => {}).then(async () => {
          if (abort.signal.aborted) return;
          try { await this.runtime.notify(agent, `Filesystem change noticed in ${agent.session.header.cwd}: ${changed.join(', ')}. This may include tool-generated changes. Re-read affected files before relying on older observations; the event does not establish successful completion.`, abort.signal); }
          catch { /* A disposed agent or unavailable observation must not crash the watcher. */ }
        });
      }, this.runtime.options.observations?.debounceMs ?? 350);
      entry.timer.unref();
    });
    entry.watcher.on('error', () => this.stop(agent));
    this.watches.set(agent, entry);
  }
  stop(agent: Agent) { const entry = this.watches.get(agent); if (!entry) return; entry.abort.abort(); clearTimeout(entry.timer); entry.watcher.close(); this.watches.delete(agent); }
  install() {
    const ctx = this.runtime.ctx;
    ctx.on('agent/created', ({ agent }) => { this.start(agent); return undefined; });
    ctx.on('agent/disposed', ({ agent }) => { this.stop(agent); });
    ctx.effect(() => async () => { const entries = [...this.watches.entries()]; for (const [agent] of entries) this.stop(agent); await Promise.allSettled(entries.map(([, entry]) => entry.pending)); });
  }
}

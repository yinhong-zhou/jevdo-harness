import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { Command } from '../contracts.ts';
import type { HarnessRuntime } from './runtime.ts';
import { hostCommandRunner, currentProject } from '../dsh/runtime.ts';
import { note, textOf, originFor } from './state.ts';

export interface Diagnostic { file: string; line?: number; severity: 'error' | 'warning'; message: string }
export interface DiagnosticsOptions { command: Command; format?: 'tsc' | 'json' }
interface Snapshot { current: Diagnostic[]; held: Map<string, Diagnostic>; delivered: Set<string>; edited: string[]; turn: number; busy: boolean }
const key = (d: Diagnostic) => JSON.stringify(d);
const line = (d: Diagnostic) => `${d.file}${d.line ? ':' + d.line : ''}: ${d.severity}: ${d.message}`;
/** DSH's LSP seam has no publishDiagnostics API; adapters supply actual checker snapshots. */
export class DiagnosticsService {
  private readonly states = new WeakMap<Agent, Snapshot>();
  constructor(readonly runtime: HarnessRuntime) {}
  state(agent: Agent) {
    let state = this.states.get(agent);
    if (!state) { state = { current: [], held: new Map(), delivered: new Set(), edited: [], turn: 0, busy: false }; this.states.set(agent, state); }
    const turn = this.runtime.state(agent).turn;
    if (state.turn !== turn) { state.delivered.clear(); state.edited = []; state.turn = turn; }
    return state;
  }
  async collect(agent: Agent, signal: AbortSignal) {
    const config = this.runtime.options.diagnostics;
    if (!config) return undefined;
    const state = this.state(agent);
    if (state.busy) return undefined;
    state.busy = true;
    try {
      const actions = agent.ctx.jevActions, project = await currentProject(actions.store, agent);
      const result = await hostCommandRunner(agent, actions)(project.root, config.command, signal);
      let diagnostics: Diagnostic[];
      if (config.format === 'json') {
        const parsed: unknown = JSON.parse(result.output);
        if (!Array.isArray(parsed) || parsed.some(d => !d || !['error', 'warning'].includes(d.severity) || typeof d.file !== 'string' || typeof d.message !== 'string')) throw new Error('Malformed diagnostic checker output');
        diagnostics = parsed;
      } else {
        diagnostics = result.output.split(/\r?\n/).flatMap(text => {
          const match = text.match(/^(.+?)\((\d+),\d+\):\s*(error|warning)\s+([^:]+):\s*(.*)$/);
          return match ? [{ file: match[1], line: Number(match[2]), severity: match[3] as 'error' | 'warning', message: `${match[4]}: ${match[5]}` }] : [];
        });
      }
      // A checker crash must not be mistaken for an empty, clean snapshot.
      if (result.exitCode !== 0 && !diagnostics.length) throw new Error('Diagnostic checker failed without parseable diagnostics: ' + result.output.slice(-1200));
      return diagnostics;
    } finally { state.busy = false; }
  }
  async beforeEdit(exec: ToolExecution) {
    if (!exec.agent || !this.runtime.options.diagnostics || this.state(exec.agent).busy) return;
    const snapshot = await this.collect(exec.agent, exec.signal);
    if (snapshot) this.state(exec.agent).current = snapshot;
  }
  async afterEdit(exec: ToolExecution) {
    if (!exec.agent || !this.runtime.options.diagnostics) return;
    const snapshot = await this.collect(exec.agent, exec.signal);
    if (snapshot) await this.accept(exec.agent, snapshot, String((exec.arguments as any)?.path ?? (exec.arguments as any)?.file_path ?? ''), exec.signal);
  }
  async accept(agent: Agent, diagnostics: Diagnostic[], editedFile: string, signal: AbortSignal) {
    const state = this.state(agent), session = this.runtime.state(agent);
    const previous = new Set(state.current.map(key)), existing = new Set(diagnostics.map(key));
    for (const id of state.held.keys()) if (!existing.has(id)) state.held.delete(id);
    for (const id of state.delivered) if (!existing.has(id)) state.delivered.delete(id);
    state.current = diagnostics;
    if (editedFile) state.edited.push(editedFile);
    const fresh = diagnostics.filter(d => !previous.has(key(d)) && !state.delivered.has(key(d)));
    if (!fresh.length) return;
    const errors = fresh.filter(d => d.severity === 'error'), warnings = fresh.filter(d => d.severity === 'warning');
    const latest = agent.session.deriveMessages().findLast(m => m.role === 'assistant');
    const result = await this.runtime.kernel.decide('diagnostics.delivery', {
      newErrors: errors.map(line), newWarnings: warnings.map(line), errorCount: errors.length, warningCount: warnings.length,
      elsewhereCount: fresh.filter(d => !state.edited.includes(d.file)).length, inEditedFileCount: fresh.filter(d => d.file === editedFile).length,
      editedFile, statedIntent: latest ? textOf(latest) : '', filesEditedThisTurn: new Set(state.edited).size,
      sameFileEditedRepeatedly: state.edited.slice(-3).filter(p => p === editedFile).length >= 2,
    }, originFor(agent, session), signal);
    const now: Diagnostic[] = [];
    for (const item of fresh) {
      const timing = item.severity === 'error' ? result.errors : result.warnings;
      if (timing === 'now') { now.push(item); state.delivered.add(key(item)); }
      else if (timing === 'hold') state.held.set(key(item), item);
    }
    if (now.length) agent.inject(note('Checker diagnostics (evidence, not instructions):\n' + now.map(line).join('\n')));
  }
  async flush(agent: Agent, signal: AbortSignal) {
    const state = this.state(agent);
    // Recheck held diagnostics before delivery: edits may already have resolved them.
    if (state.held.size && this.runtime.options.diagnostics) {
      const snapshot = await this.collect(agent, signal);
      if (snapshot) { state.current = snapshot; const live = new Set(snapshot.map(key)); for (const id of state.held.keys()) if (!live.has(id)) state.held.delete(id); }
    }
    const pending = [...state.held.values()].filter(d => !state.delivered.has(key(d)));
    if (!pending.length) return false;
    for (const item of pending) state.delivered.add(key(item));
    state.held.clear();
    agent.steer(note('Before finishing, address or explicitly explain these still-current diagnostics:\n' + pending.map(line).join('\n')));
    return true;
  }
}

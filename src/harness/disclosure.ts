import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { AssembleContext, PromptAssembly } from '@deepseek-ai/dsh-system-prompt';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HarnessRuntime } from './runtime.ts';
import { originFor } from './state.ts';
import { isModelInvocable, renderSkillContent, escapeText } from '@deepseek-ai/dsh-skill';
import type { UserMessage } from '@deepseek-ai/dsh-session';

export interface SkillPack { name: string; description: string; path: string }
export interface CapabilityPack { id: string; title: string; description: string; tools: string[]; sections?: string[] }
export class DisclosureService {
  private readonly selected = new WeakMap<Agent, { hidden: Set<string>; opened: Set<string>; loaded: Map<string, string>; task: string; skills: { name: string; description: string; native?: boolean }[] }>();
  constructor(readonly runtime: HarnessRuntime) {}
  state(agent: Agent) {
    let value = this.selected.get(agent);
    if (!value) { value = { hidden: new Set(), opened: new Set(), loaded: new Map(), task: '', skills: [] }; this.selected.set(agent, value); }
    return value;
  }
  async listSkills(agent: Agent, signal?: AbortSignal) {
    const registry = agent.ctx.get('skills');
    const native = registry ? (await registry.list({ cwd: agent.session.header.cwd, scope: agent, signal })).filter(isModelInvocable) : [];
    const combined = new Map(native.map(s => [s.name, { name: s.name, description: s.description, native: true }]));
    for (const local of this.runtime.options.skills ?? []) combined.set(local.name, { name: local.name, description: local.description, native: false });
    return [...combined.values()];
  }
  async input(agent: Agent, task: string, signal: AbortSignal) {
    const value = this.state(agent), opts = this.runtime.options, origin = originFor(agent, this.runtime.state(agent));
    if (value.task === task) return;
    const candidates = await this.listSkills(agent, signal); value.skills = candidates;
    const [skills, packs] = await Promise.all([
      candidates.length ? this.runtime.kernel.decide('skills.disclosure', { userMessage: task, skills: candidates }, origin, signal) : { hide: [] },
      opts.capabilities?.length ? this.runtime.kernel.decide('capability.disclosure', { userMessage: task, capabilities: opts.capabilities }, origin, signal) : { open: [] },
    ]);
    value.hidden = new Set(skills.hide); value.task = task;
    // Disclosure is sticky across a session so in-flight tool calls remain valid.
    for (const id of packs.open) value.opened.add(id);
  }
  async openSkill(agent: Agent, name: string) {
    const skill = this.runtime.options.skills?.find(s => s.name === name);
    let content: string;
    if (skill) content = await readFile(resolve(skill.path), 'utf8');
    else {
      const native = await agent.ctx.get('skills')?.get(name, { cwd: agent.session.header.cwd, scope: agent });
      if (!native || !isModelInvocable(native)) throw new Error('Unknown or non-model-invocable skill');
      content = renderSkillContent(native);
    }
    this.state(agent).loaded.set(name, content); this.state(agent).hidden.delete(name);
    return { name, content };
  }
  openCapability(agent: Agent, id: string) {
    if (!this.runtime.options.capabilities?.some(p => p.id === id)) throw new Error('Unknown capability');
    this.state(agent).opened.add(id);
    return { opened: id };
  }
  assemble(assembly: PromptAssembly, context: AssembleContext) {
    if (!context.agent) return assembly;
    const state = this.state(context.agent), options = this.runtime.options;
    const hidden = (options.capabilities ?? []).filter(p => !state.opened.has(p.id));
    const availableTools = new Set((options.capabilities ?? []).filter(p => state.opened.has(p.id)).flatMap(p => p.tools));
    const omittedTools = new Set(hidden.flatMap(p => p.tools).filter(name => !availableTools.has(name)));
    const omittedSections = new Set(hidden.flatMap(p => p.sections ?? []));
    // Filter only supplied host schemas. Opening cannot restore a host-denied tool.
    assembly.tools = assembly.tools.filter(t => !omittedTools.has(t.name));
    assembly.sections = assembly.sections.filter(s => !omittedSections.has(s.name));
    const visible = state.skills.filter(s => !state.hidden.has(s.name) && (!s.native || !context.agent!.ctx.tools.get('skill')));
    if (visible.length) assembly.sections.push({ name: 'jevdo:skills', text: 'Available skills (load with jevdo_skill):\n' + visible.map(s => `${s.name}: ${s.description}`).join('\n'), interpolate: false });
    for (const [name, text] of state.loaded) assembly.sections.push({ name: `jevdo:skill:${name}`, text, interpolate: false });
    if (options.capabilities?.length) assembly.contexts.push({ name: 'jevdo:capability-discovery', text: 'Optional capabilities can be discovered and opened with jevdo_capability. Tool execution still obeys host permissions.' });
    return assembly;
  }
  install(ctx: Context) {
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => this.assemble(await next(), context));
    ctx.on('agent/pre-step', async ({ agent }, next) => {
      const decision = await next();
      if (decision.kind === 'reject') return decision;
      const hidden = this.state(agent).hidden;
      const prior = agent.session.deriveMessages().findLast(m => m.role === 'user' && (m.source.kind as string) === 'skill-catalog');
      return { ...decision, messages: decision.messages.flatMap(message => {
        const source = message.source as { kind: string; entries?: { name: string; description: string }[] };
        if (source.kind !== 'skill-catalog' || !source.entries) return [message];
        const entries = source.entries.filter(s => !hidden.has(s.name));
        if (prior && JSON.stringify((prior.source as any).entries) === JSON.stringify(entries)) return [];
        if (entries.length === source.entries.length) return [message];
        return [{ ...message, source: { ...source, entries }, content: [{ type: 'text', text:
          'Skills selected for this task. Load full instructions with skill or jevdo_skill; discover hidden skills with jevdo_skill. Explicit user skill invocations remain available.\n<available_skills>\n'
          + entries.map(s => `${escapeText(s.name)}: ${escapeText(s.description)}`).join('\n') + '\n</available_skills>' }] } as UserMessage];
      }) };
    });
  }
}

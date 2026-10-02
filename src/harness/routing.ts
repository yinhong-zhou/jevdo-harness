import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent';
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm';
import type { HarnessRuntime } from './runtime.ts';
import { originFor } from './state.ts';
export interface ModelRoute extends AgentOptions { id: string; description: string; provider: string; model: string }
/** Resolve routes at task boundaries; an explicit configured selection takes priority. */
export class ModelRouter {
  private readonly selected = new WeakMap<Agent, { task: string; id: string }>();
  constructor(readonly runtime: HarnessRuntime) {}
  async route(agent: Agent, inherited: LlmCallConfig, signal: AbortSignal): Promise<LlmCallConfig> {
    const routes = this.runtime.options.models ?? [];
    if (!routes.length || agent.session.header.origin === 'subagent') return inherited;
    const state = this.runtime.state(agent), task = state.frame?.goal ?? state.request;
    let id = this.runtime.options.fixedModel;
    if (!id) {
      const previous = this.selected.get(agent);
      id = previous?.task === task ? previous.id : await this.runtime.kernel.selectModel(task, routes, routes[0].id, originFor(agent, state), signal);
    }
    const route = routes.find(r => r.id === id);
    if (!route) throw new Error(`Unknown configured model route: ${id}`);
    this.selected.set(agent, { task, id });
    // Effort belongs to the chosen model. Do not leak an old model's effort.
    return { provider: route.provider, model: route.model,
      ...(route.maxTokens === undefined ? {} : { maxTokens: route.maxTokens }),
      ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }) };
  }
  install() {
    this.runtime.ctx.on('agent/request', async ({ agent, signal }, next) => this.route(agent, await next(), signal));
  }
}

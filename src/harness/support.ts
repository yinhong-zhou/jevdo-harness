import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { createSystemMessage } from '@deepseek-ai/dsh-llm';
import { z } from 'zod';
import { note } from './state.ts';

export interface WriterRoute { provider: string; model: string; maxTokens?: number }
/** An auxiliary writer has no tools; its output is never treated as a main-agent reply. */
export async function writeText(agent: Agent, instruction: string, data: unknown, signal: AbortSignal, route?: WriterRoute) {
  let output = '';
  const current = agent.session.requestHeader()?.config ?? agent.options;
  for await (const chunk of agent.ctx.llm.stream({
    provider: route?.provider ?? current.provider!, model: route?.model ?? current.model!,
    maxTokens: route?.maxTokens ?? 700, signal, tools: [],
    messages: [createSystemMessage(instruction), note(JSON.stringify(data))],
  })) {
    if (chunk.type === 'text-delta') output += chunk.text;
    if (output.length > 30000) throw new Error('Auxiliary writer exceeded output bound');
  }
  signal.throwIfAborted();
  return output;
}

export function defineTool<T extends z.ZodType>(ctx: Context, name: string, description: string, schema: T,
  execute: (args: z.infer<T>, agent: Agent, signal: AbortSignal) => Promise<unknown>) {
  const parameters = z.toJSONSchema(schema, { io: 'input' }); delete parameters.$schema;
  ctx.tools.register({ name, description, parameters: parameters as ToolDefinition['parameters'],
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      if (!exec.agent) throw new Error(`${name} requires an Agent`);
      return JSON.stringify(await execute(schema.parse(args), exec.agent, exec.signal));
    },
  });
}

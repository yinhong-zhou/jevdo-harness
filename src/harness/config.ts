import Schema from '@deepseek-ai/schemastery';
import { z } from 'zod';
import { decisionPoints } from './catalog.ts';

const mode = Schema.union(['active', 'shadow', 'off']);
const integer = (min = 1) => Schema.number().min(min).step(1);
const writer = Schema.object({ provider: Schema.string().required(), model: Schema.string().required(), maxTokens: integer() });
const route = Schema.object({ id: Schema.string().required(), description: Schema.string().required(), provider: Schema.string().required(), model: Schema.string().required(), maxTokens: integer(), reasoningEffort: Schema.string() });
export const HarnessConfig = Schema.object({
  enabled: Schema.boolean(), home: Schema.string(), mode,
  modes: Schema.dict(mode), apiKeyEnv: Schema.string(), endpoint: Schema.string(), model: Schema.string(), timeoutMs: integer(),
  constraints: Schema.array(String), permissionMode: Schema.union(['host', 'jev']), monitorEvery: integer(), maxGoalContinuations: integer(0),
  admissionChars: integer(), compactChars: integer(), keepRecentResults: integer(0),
  skills: Schema.array(Schema.object({ name: Schema.string().required(), description: Schema.string().required(), path: Schema.string().required() })),
  capabilities: Schema.array(Schema.object({ id: Schema.string().required(), title: Schema.string().required(), description: Schema.string().required(), tools: Schema.array(String), sections: Schema.array(String) })),
  boardWriter: Schema.union([Schema.const(undefined), writer]),
  team: Schema.object({ maxWorkers: integer(), timeoutMs: integer(), maxDepth: integer(0), models: Schema.array(Schema.any()), roles: Schema.dict(String), readTools: Schema.array(String) }),
  browser: Schema.object({ enabled: Schema.boolean(), executablePath: Schema.string(), channel: Schema.union(['chrome', 'msedge']), headless: Schema.boolean(), maxSteps: integer() }),
  diagnostics: Schema.union([Schema.const(undefined), Schema.object({ format: Schema.union(['tsc', 'json']), command: Schema.object({ command: Schema.string().required(), args: Schema.array(String), cwd: Schema.string(), timeoutMs: integer() }).required() })]),
  cacheWarming: Schema.object({ enabled: Schema.boolean(), delayMs: integer(0), defaultWarm: Schema.boolean() }),
  outputRules: Schema.array(String), observations: Schema.object({ enabled: Schema.boolean(), debounceMs: integer() }),
  models: Schema.array(route), fixedModel: Schema.string(),
});

/** Validate programmatic installs too. Injectable Judge instances are not JSON config. */
export function validateHarnessOptions<T extends Record<string, unknown>>(options: T): T {
  const { judge, ...json } = options;
  HarnessConfig(json);
  const modes = json.modes as Record<string, unknown> | undefined;
  for (const key of Object.keys(modes ?? {})) if (![...decisionPoints, 'action.next', 'model.select'].includes(key)) throw new Error(`Unknown decision point: ${key}`);
  const models = (json.models ?? []) as { id: string }[];
  if (new Set(models.map(m => m.id)).size !== models.length) throw new Error('Model route IDs must be unique');
  if (json.fixedModel && !models.some(m => m.id === json.fixedModel)) throw new Error('fixedModel must name a configured harness model route');
  if (json.endpoint) z.url().parse(json.endpoint);
  return options;
}

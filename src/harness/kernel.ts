import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';
import { DecisionEngine, defineDecision, type DecisionMode, type DecisionSpec } from '../vendor/mu/decision.ts';
import { Judge, type JudgeLike } from '../vendor/mu/judge.ts';
import { CompositeLedger, JsonlLedger, MemoryLedger } from '../vendor/mu/ledger.ts';
import { TypeSafeJudgeProvider } from '../vendor/mu/providers/typesafe.ts';
import type { Questions, JsonValue, JudgeInput } from '../vendor/mu/types.ts';
import type { ChoiceRequest, Decider } from '../contracts.ts';
import { decisions, decisionPoints, type DecisionPoint } from './catalog.ts';

export interface KernelOptions {
  home: string;
  mode?: DecisionMode;
  modes?: Partial<Record<DecisionPoint | 'action.next' | 'model.select', DecisionMode>>;
  apiKeyEnv?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  judge?: JudgeLike;
}
export interface Origin { sessionId: string; turn?: number; step?: number }
type Input<K extends DecisionPoint> = Parameters<(typeof decisions)[K]['buildState']>[0];
type Output<K extends DecisionPoint> = ReturnType<(typeof decisions)[K]['fallback']>;

/** One model transport, modes and audit surface for MU judgments and Action scheduling. */
export class Kernel {
  readonly memory = new MemoryLedger(2000);
  readonly engine: DecisionEngine;
  private readonly origin = new AsyncLocalStorage<Origin>();
  constructor(readonly options: KernelOptions) {
    for (const id of Object.keys(options.modes ?? {})) {
      if (id !== 'action.next' && id !== 'model.select' && !decisionPoints.includes(id as DecisionPoint)) throw new Error(`Unknown decision point: ${id}`);
    }
    const judge = options.judge ?? new Judge({ provider: new TypeSafeJudgeProvider({
      apiKey: () => process.env[options.apiKeyEnv ?? 'TYPESAFE_API_KEY'], keyName: options.apiKeyEnv,
      baseUrl: options.endpoint, model: options.model,
    }), timeoutMs: options.timeoutMs ?? 25000 });
    this.engine = new DecisionEngine({ judge, defaultMode: options.mode ?? 'active', modes: options.modes,
      ledger: new CompositeLedger([new JsonlLedger(resolve(options.home, 'judgments.jsonl')), this.memory]),
      origin: () => this.origin.getStore() as unknown as JsonValue,
    });
  }
  withOrigin<T>(origin: Origin, job: () => Promise<T>): Promise<T> { return this.origin.run(origin, job); }
  async decide<K extends DecisionPoint>(id: K, input: Input<K>, origin: Origin, signal?: AbortSignal): Promise<Output<K>> {
    signal?.throwIfAborted();
    const spec = decisions[id] as unknown as DecisionSpec<Input<K>, Questions, JsonValue>;
    const result = await this.origin.run(origin, () => this.engine.decide(spec, input, { signal }));
    // MU's fallback policy contains provider errors. Cancellation must still stop DSH.
    signal?.throwIfAborted();
    return result.outcome as Output<K>;
  }
  actionDecider(): Decider {
    return { choose: async (request: ChoiceRequest, signal?: AbortSignal) => {
      signal?.throwIfAborted();
      const ids = new Set(request.candidates.map(c => c.id));
      if (!ids.size || ids.size !== request.candidates.length) throw new Error('Action candidates must be nonempty and unique');
      const fallback = ids.has('LLM') ? 'LLM' : ids.has('ASK') ? 'ASK' : undefined;
      if (!fallback) throw new Error('Action choices require LLM or ASK fallback');
      const spec = defineDecision({ id: 'action.next', version: 1, cacheImpact: 'none', latency: 'inline',
        allowChoicesWithoutEscape: true,
        questions: { next: { type: 'choice' as const, instructions: request.purpose,
          criteria: Object.fromEntries(request.candidates.map(c => [c.id, JSON.stringify(c)])) } },
        buildState: () => request.state as JudgeInput,
        // The model invocation is an explicit option, not a confidence threshold.
        policy: answers => ({ id: answers.next.choice, confidence: answers.next.confidence ?? 1 }),
        fallback: () => ({ id: fallback, confidence: 0 }),
      });
      const origin = { sessionId: String(request.state.sessionId ?? 'unscoped') };
      const result = await this.origin.run(origin, () => this.engine.decide(spec, undefined, { signal }));
      signal?.throwIfAborted();
      return result.outcome;
    } };
  }
  async selectModel(task: string, candidates: { id: string; description: string }[], fallback: string, origin: Origin, signal: AbortSignal) {
    const ids = new Set(candidates.map(c => c.id));
    if (ids.size !== candidates.length || !ids.has(fallback)) throw new Error('Invalid model candidate list');
    const spec = defineDecision({ id: 'model.select', version: 1, cacheImpact: 'prefix-mutating', latency: 'inline',
      allowChoicesWithoutEscape: true,
      questions: { model: { type: 'choice' as const, instructions: 'Which configured model best fits this task? Select only an offered route; the descriptions declare the available capabilities.',
        criteria: Object.fromEntries(candidates.map(c => [c.id, c.description])) } },
      buildState: () => ({ task }), policy: answers => answers.model.choice, fallback: () => fallback,
    });
    signal.throwIfAborted();
    const result = await this.origin.run(origin, () => this.engine.decide(spec, undefined, { signal }));
    signal.throwIfAborted(); return result.outcome;
  }
}

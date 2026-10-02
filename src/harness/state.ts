import type { Agent } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { Frame } from '../vendor/mu/frame/frame.ts';
import type { PreflightOutcome } from '../vendor/mu/decisions/input-preflight.ts';
import type { BoardStep, BoardEvent } from '../vendor/mu/decisions/board-read.ts';

declare module '@deepseek-ai/dsh-llm' { interface MessageSourceMap { jevdo: { kind: 'jevdo' } } }
export const textOf = (message: { content: readonly unknown[] }): string => message.content
  .filter((b): b is { type: 'text'; text: string } => !!b && typeof b === 'object' && 'type' in b && b.type === 'text')
  .map(b => b.text).join('\n');
export const note = (text: string) => createUserMessage({ source: { kind: 'jevdo' }, content: [{ type: 'text', text }] });
export interface SessionState {
  turn: number;
  step: number;
  request: string;
  frame?: Frame;
  preflight?: PreflightOutcome;
  actions: BoardStep[];
  boardEvents: BoardEvent[];
  edited: number;
  ranAfterEdit: boolean;
  checkFailed: boolean;
  completionNudges: number;
  trouble: string[];
  goal?: string;
  goalContinuations: number;
  constraints: string[];
  inheritedConstraints: string[];
  loaded: boolean;
  outputCorrections: number;
}
export function freshState(): SessionState {
  return { turn: 0, step: 0, request: '', actions: [], boardEvents: [], edited: 0,
    ranAfterEdit: false, checkFailed: false, completionNudges: 0, trouble: [], goalContinuations: 0,
    constraints: [], inheritedConstraints: [], loaded: false, outputCorrections: 0 };
}
export function recentTurns(agent: Agent) {
  return agent.session.deriveMessages().filter(m => m.role === 'user' || m.role === 'assistant').slice(-6).map(m => textOf(m).slice(-1600));
}
export const originFor = (agent: Agent, state: SessionState) => ({ sessionId: agent.id, turn: state.turn, step: state.step });

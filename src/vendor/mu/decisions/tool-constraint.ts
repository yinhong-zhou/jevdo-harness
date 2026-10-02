import { defineDecision } from "../decision.ts";
import { threeZone } from "../policy.ts";
import type { Questions } from "../types.ts";

/**
 * The user's hard constraints ("do not touch the database schema", "先别修改
 * 配置文件") live in the task frame, word for word. Showing them to the model
 * is not the same as keeping them: before a call that changes something, one
 * yes/no per constraint asks whether this very call goes against it.
 *
 * Only a confident yes stops the call, and what stops it is the user's own
 * sentence, so the model knows exactly what it ran into and can change course
 * or ask. No verdict, or an unsure one, lets the call through: a judge outage
 * must never freeze the agent.
 */
export interface ToolConstraintInput {
	readonly toolName: string;
	/** What the call would do, clipped: a path and the start of the new text, or a command. */
	readonly call: string;
	/** The user's sentences, verbatim, as the frame holds them. */
	readonly constraints: readonly string[];
}

export type ToolConstraintOutcome = {
	/** Indexes into `constraints` that this call goes against. Empty means go ahead. */
	readonly broken: readonly number[];
};

const CONSTRAINT_LENGTH = 300;

export function constraintQuestionId(index: number): string {
	return `constraint_${index}`;
}

export const toolConstraint = defineDecision({
	id: "tool.constraint",
	version: 1,
	cacheImpact: "none",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: ToolConstraintInput): Questions {
		return Object.fromEntries(
			input.constraints.map((constraint, index) => [
				constraintQuestionId(index),
				{
					type: "boolean" as const,
					instructions: `Does \`tool_call\` go against this instruction from the user? "${constraint.slice(0, CONSTRAINT_LENGTH)}"`,
				},
			]),
		);
	},
	buildState(input: ToolConstraintInput) {
		return { tool_call: `${input.toolName}: ${input.call}` };
	},
	policy(answers, input): ToolConstraintOutcome {
		const broken: number[] = [];
		input.constraints.forEach((_constraint, index) => {
			const answer = answers[constraintQuestionId(index)];
			if (answer?.type === "boolean" && threeZone(answer) === "yes") broken.push(index);
		});
		return { broken };
	},
	fallback(): ToolConstraintOutcome {
		return { broken: [] };
	},
});

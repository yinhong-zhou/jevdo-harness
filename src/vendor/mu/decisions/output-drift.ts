import { defineDecision } from "../decision.ts";
import { threeZone } from "../policy.ts";
import type { Questions } from "../types.ts";

/**
 * An experiment, off unless switched on: the semantic version of oh-my-pi's
 * TTSR. There a regular expression watches the model's output as it streams;
 * when it matches, the output is cut, the rule is put in front of the model,
 * and it carries on from where it stopped. A pattern only finds what somebody
 * thought of in advance. Here the watcher is the judge: every few hundred
 * characters it reads the tail of the output against the user's own
 * instructions, one yes/no each.
 *
 * Only a confident yes cuts the output. Everything else lets it run: a judge
 * that is slow, unsure or gone must never cost the user an answer.
 */
export interface OutputDriftInput {
	/** The end of what the model has written so far in this message: prose and tool-call arguments, never thinking. */
	readonly recentOutput: string;
	/** Instructions in the user's words: the task frame's hard constraints, then the rules from the configuration. */
	readonly rules: readonly string[];
}

export type OutputDriftOutcome = {
	/** Indexes into `rules` that the output goes against. Empty means let it run. */
	readonly broken: readonly number[];
};

const RULE_LENGTH = 300;

export function driftQuestionId(index: number): string {
	return `rule_${index}`;
}

export const outputDrift = defineDecision({
	id: "output.drift",
	version: 1,
	cacheImpact: "append-only",
	latency: "parallel",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: OutputDriftInput): Questions {
		return Object.fromEntries(
			input.rules.map((rule, index) => [
				driftQuestionId(index),
				{
					type: "boolean" as const,
					instructions: `Does \`recent_output\` go against this instruction from the user? "${rule.slice(0, RULE_LENGTH)}"`,
				},
			]),
		);
	},
	buildState(input: OutputDriftInput) {
		return { recent_output: input.recentOutput };
	},
	policy(answers, input): OutputDriftOutcome {
		const broken: number[] = [];
		input.rules.forEach((_rule, index) => {
			const answer = answers[driftQuestionId(index)];
			if (answer?.type === "boolean" && threeZone(answer) === "yes") broken.push(index);
		});
		return { broken };
	},
	fallback(): OutputDriftOutcome {
		return { broken: [] };
	},
});

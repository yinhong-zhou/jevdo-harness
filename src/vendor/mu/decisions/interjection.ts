import { defineDecision } from "../decision.ts";
import { pickChoice } from "../policy.ts";

/**
 * A8: a message typed while the agent is working. pi routes it by which key
 * was pressed (steer now or queue for later); the content usually says better.
 */
export interface InterjectionInput {
	readonly userMessage: string;
	readonly goal: string;
	readonly currentAction: string;
}

export type InterjectionOutcome = "steer" | "followUp" | "keep";

export const inputInterjection = defineDecision({
	id: "input.interjection",
	version: 1,
	cacheImpact: "append-only",
	latency: "inline",
	capabilities: "relate",
	questions: {
		kind: {
			type: "choice",
			instructions: "What is `user_message`, given that the agent is busy with `current_action`?",
			criteria: {
				correction: "It says the agent is doing something wrong or should stop",
				addition: "It adds more work to do after the current work",
				side_question: "It asks something unrelated to the current work",
				other: "Something else",
			},
		},
	},
	buildState(input: InterjectionInput) {
		return { user_message: input.userMessage, current_action: input.currentAction, goal: input.goal };
	},
	policy(answers): InterjectionOutcome {
		const kind = pickChoice(answers.kind, { minProbability: 0.7 });
		if (kind === "correction") return "steer";
		if (kind === "addition" || kind === "side_question") return "followUp";
		return "keep";
	},
	// Whatever key the user pressed stands.
	fallback(): InterjectionOutcome {
		return "keep";
	},
});

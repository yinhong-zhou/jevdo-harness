import { defineDecision } from "../decision.ts";
import { threeZone } from "../policy.ts";

/**
 * E2: pi keeps the provider's prompt cache warm while it expects the user back,
 * using a fixed continuation probability. The last exchange says more: a
 * "thanks, that's all" should stop the refreshes, an open question should not.
 */
export interface WarmingInput {
	readonly lastUserMessage: string;
	readonly lastAssistantMessage: string;
}

export type WarmingOutcome = "warm" | "stop" | "default";

export const cacheWarming = defineDecision({
	id: "cache.warming",
	version: 1,
	cacheImpact: "none",
	latency: "background",
	questions: {
		finished: { type: "boolean", instructions: "Does `last_user_message` end the conversation?" },
		open: { type: "boolean", instructions: "Does `last_assistant_message` ask the user a question?" },
	},
	buildState(input: WarmingInput) {
		return { last_user_message: input.lastUserMessage, last_assistant_message: input.lastAssistantMessage };
	},
	policy(answers): WarmingOutcome {
		if (threeZone(answers.open) === "yes") return "warm";
		if (threeZone(answers.finished) === "yes") return "stop";
		return "default";
	},
	fallback(): WarmingOutcome {
		return "default";
	},
});

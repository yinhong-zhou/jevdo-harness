import { defineDecision } from "../decision.ts";
import { threeZone } from "../policy.ts";

/**
 * Goal mode's check by the judge. The user states a condition once ("every
 * test in packages/x passes and the README describes the new flag") and
 * leaves. Each time the agent wants to stop, the harness asks whether the
 * condition holds, and sends the agent back to work while it does not.
 *
 * A language model makes that check by default (`src/goal/check.ts`): two
 * booleans over the closing message proved too thin for "is it done". This
 * decision is what runs when the user chose the judge, or the model gave no
 * usable answer.
 *
 * What the harness knows outranks what the closing message claims: an
 * acceptance item nobody ticked, or an edit nothing ran after, means "not
 * yet" whatever the message says. The judge only reads the message.
 */
export interface GoalInput {
	readonly goal: string;
	readonly finalMessage: string;
	/** Acceptance items of the task frame that nobody has ticked. */
	readonly openItems: number;
	/** Files were edited and nothing ran afterwards. */
	readonly unverified: boolean;
}

/**
 * `ask`: the agent cannot go on without the user. `unjudged`: there is no
 * fact to continue on and nobody to read the message, so the user decides.
 */
export type GoalOutcome = "met" | "continue" | "ask" | "unjudged";

export const goalMet = defineDecision({
	id: "goal.met",
	version: 1,
	cacheImpact: "append-only",
	latency: "inline",
	capabilities: "relate",
	questions: {
		achieved: { type: "boolean", instructions: "Does `final_message` say that `goal` is fully achieved?" },
		needs_user: {
			type: "boolean",
			instructions: "Does `final_message` ask the user for something the work cannot go on without?",
		},
	},
	buildState(input: GoalInput) {
		return {
			goal: input.goal,
			final_message: input.finalMessage,
			open_acceptance_items: input.openItems,
			edited_without_running_anything: input.unverified,
		};
	},
	policy(answers, input): GoalOutcome {
		// A question to the user is never answered by working on: that is how an agent digs the wrong hole deeper.
		if (threeZone(answers.needs_user) === "yes") return "ask";
		if (input.openItems > 0 || input.unverified) return "continue";
		return threeZone(answers.achieved) === "yes" ? "met" : "continue";
	},
	/** Without a judge the facts still count: work that is provably unfinished goes on, the rest is the user's call. */
	fallback(input): GoalOutcome {
		return input.openItems > 0 || input.unverified ? "continue" : "unjudged";
	},
});

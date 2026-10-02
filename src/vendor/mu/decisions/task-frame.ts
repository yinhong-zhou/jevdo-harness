import { defineDecision } from "../decision.ts";
import type { FrameChange } from "../frame/frame.ts";
import { isEscapeOption } from "../policy.ts";
import type { TaskFrame } from "./input-preflight.ts";

/**
 * Does this user message change the task frame, and how? One choice question
 * per user message. The judge only says that the frame has to change and in
 * which way; writing the new frame is a generative job for the writer model.
 *
 * `none` is both the escape option and a real answer here: most messages are
 * chat, a question or a go-ahead, and leave the frame alone.
 *
 * A constraint and a correction lead to the same update (the user's words are
 * kept as a hard constraint), and a message like "keep the plan, but drop the
 * database change" is honestly both. So their probabilities are pooled before
 * the bar is applied; otherwise a 50/50 split between the two would read as
 * "unsure" on the very messages this decision exists for.
 */
export interface TaskFrameInput {
	readonly userMessage: string;
	/** The frame as it stands before this message. */
	readonly frame: TaskFrame;
	/** Short digests of the latest turns, oldest first: a bare "yes" or "the second one" only means something after them. */
	readonly recentTurns: readonly string[];
}

export type TaskFrameOutcome = FrameChange | "none";

/** A kind of change is acted on from here up. */
const SURE = 0.6;
/** That much weight on "something changes", with no kind reaching the bar, is a change of unclear kind. */
const CHANGED = 0.7;

export const taskFrame = defineDecision({
	id: "task.frame",
	version: 1,
	// The new frame reaches the model as a note appended to the turn.
	cacheImpact: "append-only",
	latency: "inline",
	capabilities: "relate",
	questions: {
		change: {
			type: "choice",
			instructions: "What does `user_message` change in `task_frame`?",
			criteria: {
				new_task: "It starts a different task",
				constraint: "It adds a rule the work must follow",
				correction: "It says the current approach is wrong",
				subgoal: "It moves on to the next step of the same task",
				none: "Nothing: it is chat, a question or a go-ahead",
			},
		},
	},
	// Decisive content first: a judge with a bounded window keeps the head of the state and cuts the tail.
	buildState(input: TaskFrameInput) {
		return {
			user_message: input.userMessage,
			task_frame: {
				goal: input.frame.goal,
				constraints: input.frame.constraints ?? [],
				current_subgoal: input.frame.currentSubgoal ?? null,
			},
			recent_turns: input.recentTurns,
		};
	},
	policy(answers): TaskFrameOutcome {
		const { choice, probabilities } = answers.change;
		// A provider that sends no distribution is taken at its word, as `pickChoice` does.
		if (!probabilities) return isEscapeOption(choice) ? "none" : choice;
		const p = (option: keyof typeof probabilities) => probabilities[option] ?? 0;
		const limiting = p("constraint") + p("correction");
		const kinds: [TaskFrameOutcome, number][] = [
			["new_task", p("new_task")],
			[p("correction") > p("constraint") ? "correction" : "constraint", limiting],
			["subgoal", p("subgoal")],
		];
		const [kind, weight] = kinds.reduce((best, each) => (each[1] > best[1] ? each : best));
		if (weight >= SURE) return kind;
		// Sure that something changed, unsure what: never a silent overwrite of the goal, the frame keeps it as a question.
		// Summed rather than `1 - none`, so a provider that reports only part of the distribution is not read as sure.
		const changed = kinds.reduce((sum, each) => sum + each[1], 0);
		return changed >= CHANGED ? "unclear" : "none";
	},
	// Without a judge the frame is left as it is.
	fallback(): TaskFrameOutcome {
		return "none";
	},
});

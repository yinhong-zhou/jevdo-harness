import { ABSTAIN, defineDecision } from "../decision.ts";
import { threeZone } from "../policy.ts";
import type { Questions } from "../types.ts";

/**
 * When to tell the model about diagnostics its edit introduced. Other agents
 * append every diagnostic to every write, which in the middle of a change
 * across several files is a list of things the model is about to fix anyway.
 *
 * What is new is a fact the harness computes (the server's report after the
 * edit minus the one before it). The judge only reads two things: whether the
 * model says it is still in the middle of the change, and whether the new
 * warnings are about style. Errors are never dropped here, and whatever this
 * decides, errors that are still there when the turn ends are delivered by rule.
 */
export interface DiagnosticsDeliveryInput {
	/** `path:line code message`, a few of each, clipped. */
	readonly newErrors: readonly string[];
	readonly newWarnings: readonly string[];
	readonly errorCount: number;
	readonly warningCount: number;
	/** How many of them are in files the agent did not edit. */
	readonly elsewhereCount: number;
	/** How many of them are in the file this edit changed. */
	readonly inEditedFileCount: number;
	/** The assistant's latest prose: what it says it is doing. */
	readonly statedIntent: string;
	readonly editedFile: string;
	readonly filesEditedThisTurn: number;
	/** The same file was edited at least twice in the last three edits: the model is iterating on it right now. */
	readonly sameFileEditedRepeatedly: boolean;
}

export type DeliveryTiming = "now" | "hold";

export type DiagnosticsDeliveryOutcome = {
	readonly errors: DeliveryTiming;
	/** `drop`: not worth telling at all. */
	readonly warnings: DeliveryTiming | "drop";
};

export const diagnosticsDelivery = defineDecision({
	id: "diagnostics.delivery",
	version: 1,
	cacheImpact: "append-only",
	latency: "inline",
	capabilities: "classify",
	questions: {} as Questions,
	questionsFor(input: DiagnosticsDeliveryInput): Questions {
		return {
			more_edits_coming: {
				type: "boolean",
				instructions: "Does `stated_intent` say that more edits will follow this one?",
			},
			...(input.warningCount > 0
				? {
						warnings_are_style: {
							type: "boolean" as const,
							instructions: "Are `new_warnings` only about style or unused code?",
						},
					}
				: {}),
		};
	},
	buildState(input: DiagnosticsDeliveryInput) {
		return {
			stated_intent: input.statedIntent,
			edited_file: input.editedFile,
			files_edited_this_turn: input.filesEditedThisTurn,
			same_file_edited_repeatedly: input.sameFileEditedRepeatedly,
			error_count: input.errorCount,
			warning_count: input.warningCount,
			in_files_not_edited: input.elsewhereCount,
			in_edited_file: input.inEditedFileCount,
			new_errors: input.newErrors,
			new_warnings: input.newWarnings,
		};
	},
	policy(answers, input): DiagnosticsDeliveryOutcome | typeof ABSTAIN {
		const more = answers.more_edits_coming;
		if (more?.type !== "boolean") return ABSTAIN;
		const coming = threeZone(more);
		if (coming === "unsure") return ABSTAIN;
		// A model that keeps returning to one file and keeps breaking it is working on exactly what these are about.
		const iterating = input.sameFileEditedRepeatedly && input.inEditedFileCount > 0;
		const timing: DeliveryTiming = coming === "yes" && !iterating ? "hold" : "now";
		const style = answers.warnings_are_style;
		const verdict = style?.type === "boolean" ? threeZone(style) : "unsure";
		// Only a confident "not style" lets warnings travel with the errors; an unsure reading waits for the pause.
		return { errors: timing, warnings: verdict === "yes" ? "drop" : verdict === "no" ? timing : "hold" };
	},
	/** Without a judge: errors wait for the end of the turn, where a rule delivers them; warnings are not told. */
	fallback(): DiagnosticsDeliveryOutcome {
		return { errors: "hold", warnings: "drop" };
	},
});

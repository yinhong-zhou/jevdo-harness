import { defineDecision } from "../decision.ts";
import { threeZone } from "../policy.ts";
import type { Answer, Questions } from "../types.ts";

/**
 * The findings of a code review, in the order they deserve. A reviewer's
 * report mixes a crash in the new code with a naming nit and with an old bug
 * the change never touched, all in the same voice. Two yes/no questions per
 * finding sort them: does it change how the program behaves, and is it about
 * the change under review. The reviewer's own "must / should / nit" is the
 * third input.
 *
 * Nothing is dropped. A finding the judge thinks minor is collapsed into P3,
 * where the user can still read it; a finding the reviewer insisted on never
 * lands in P3.
 */
export type Severity = "must" | "should" | "nit";

export interface Finding {
	readonly text: string;
	/** `file:line`, when the reviewer gave one. */
	readonly where?: string;
	readonly severity?: Severity;
}

export interface ReviewTriageInput {
	/** What the change under review is meant to do, in a sentence. */
	readonly change: string;
	readonly findings: readonly Finding[];
}

export type Priority = "P0" | "P1" | "P2" | "P3";

export type ReviewTriageOutcome = {
	/** One per finding, in the order of `findings`. */
	readonly priorities: readonly Priority[];
};

const FINDING_LENGTH = 300;
const CHANGE_LENGTH = 400;

export const bugQuestion = (index: number) => `is_bug_${index}`;
export const scopeQuestion = (index: number) => `in_scope_${index}`;

const verdict = (answer: Answer | undefined) => (answer?.type === "boolean" ? threeZone(answer) : "unsure");

/** The priority of one finding from the two verdicts and what the reviewer said. */
export function priorityOf(
	bug: "yes" | "no" | "unsure",
	scope: "yes" | "no" | "unsure",
	severity?: Severity,
): Priority {
	if (bug === "yes") {
		if (scope === "yes") return severity === "must" ? "P0" : "P1";
		// Only a defect the judge is sure lies outside this change steps down; an unplaced one counts as part of it.
		return scope === "no" ? "P2" : "P1";
	}
	// The reviewer insists and the judge cannot rule it out: it stays near the top.
	if (bug === "unsure") return severity === "must" ? "P1" : "P2";
	// Surely no change of behaviour: style, naming, a comment. Unless the reviewer insisted.
	return severity === "must" ? "P2" : "P3";
}

/** Without a judge: the reviewer's own word, one step down from the top, since nobody confirmed it. */
export function priorityBySeverity(severity?: Severity): Priority {
	return severity === "must" ? "P1" : severity === "nit" ? "P3" : "P2";
}

export const reviewTriage = defineDecision({
	id: "review.triage",
	version: 1,
	cacheImpact: "none",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: ReviewTriageInput): Questions {
		return Object.fromEntries(
			input.findings.flatMap((_finding, index) => [
				[
					bugQuestion(index),
					{
						type: "boolean" as const,
						instructions: `Is \`finding_${index}\` a defect that changes how the program behaves?`,
					},
				],
				[
					scopeQuestion(index),
					{ type: "boolean" as const, instructions: `Is \`finding_${index}\` about the change in \`change\`?` },
				],
			]),
		);
	},
	buildState(input: ReviewTriageInput) {
		const state: Record<string, string> = { change: input.change.slice(0, CHANGE_LENGTH) };
		input.findings.forEach((finding, index) => {
			const where = finding.where ? `${finding.where}: ` : "";
			state[`finding_${index}`] = `${where}${finding.text}`.slice(0, FINDING_LENGTH);
		});
		return state;
	},
	policy(answers, input): ReviewTriageOutcome {
		return {
			priorities: input.findings.map((finding, index) =>
				priorityOf(verdict(answers[bugQuestion(index)]), verdict(answers[scopeQuestion(index)]), finding.severity),
			),
		};
	},
	fallback(input): ReviewTriageOutcome {
		return { priorities: input.findings.map((finding) => priorityBySeverity(finding.severity)) };
	},
});

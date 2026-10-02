import { defineDecision } from "../decision.ts";
import type { Questions } from "../types.ts";

/**
 * F, judge-guided file location: rank candidate paths against what the agent
 * is looking for, in place of a string of grep calls whose output all lands in
 * the context.
 */
export interface LocateInput {
	readonly query: string;
	readonly paths: readonly string[];
}

export type LocateOutcome = { readonly ranked: readonly { readonly path: string; readonly probability: number }[] };

export function pathQuestionId(index: number): string {
	return `path_${index}`;
}

export const fileLocate = defineDecision({
	id: "files.locate",
	version: 1,
	cacheImpact: "none",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: LocateInput): Questions {
		return Object.fromEntries(
			input.paths.map((path, index) => [
				pathQuestionId(index),
				{ type: "boolean" as const, instructions: `Is this file likely to contain \`query\`? ${path}` },
			]),
		);
	},
	buildState(input: LocateInput) {
		return { query: input.query };
	},
	policy(answers, input): LocateOutcome {
		const ranked = input.paths
			.map((path, index) => {
				const answer = answers[pathQuestionId(index)];
				return { path, probability: answer?.type === "boolean" ? answer.probability : 0.5 };
			})
			.sort((a, b) => b.probability - a.probability);
		return { ranked };
	},
	fallback(input): LocateOutcome {
		return { ranked: input.paths.map((path) => ({ path, probability: 0.5 })) };
	},
});

import { defineDecision } from "../decision.ts";
import { threeZone } from "../policy.ts";
import type { Questions } from "../types.ts";

/**
 * Capability disclosure: a capability pack, an MCP server or a debugger costs
 * tool definitions in every request whether or not the task will touch it.
 * They are installed hidden, and one yes/no per capability decides which of
 * them this task opens.
 *
 * The default is the opposite of skill disclosure. A skill is visible unless
 * the judge is sure it is not needed; a judged capability is hidden unless the
 * judge is sure it is. Being wrong is cheap in both directions: a hidden
 * capability can still be found and opened with `find_capability`.
 */
export interface CapabilityCandidate {
	readonly id: string;
	readonly title: string;
	readonly description: string;
}

export interface CapabilityDisclosureInput {
	readonly userMessage: string;
	readonly capabilities: readonly CapabilityCandidate[];
}

export type CapabilityDisclosureOutcome = {
	/** Ids of capabilities to open for this task. */
	readonly open: readonly string[];
};

const DESCRIPTION_LENGTH = 220;

export function capabilityQuestionId(index: number): string {
	return `capability_${index}`;
}

export const capabilityDisclosure = defineDecision({
	id: "capability.disclosure",
	version: 1,
	// Opening one adds tool definitions, which moves the cached prefix once.
	cacheImpact: "prefix-mutating",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: CapabilityDisclosureInput): Questions {
		return Object.fromEntries(
			input.capabilities.map((capability, index) => [
				capabilityQuestionId(index),
				{
					type: "boolean" as const,
					instructions: `Does \`user_message\` need this capability? ${capability.title}: ${capability.description.slice(0, DESCRIPTION_LENGTH)}`,
				},
			]),
		);
	},
	buildState(input: CapabilityDisclosureInput) {
		return { user_message: input.userMessage };
	},
	policy(answers, input): CapabilityDisclosureOutcome {
		const open: string[] = [];
		input.capabilities.forEach((capability, index) => {
			const answer = answers[capabilityQuestionId(index)];
			if (answer?.type === "boolean" && threeZone(answer) === "yes") open.push(capability.id);
		});
		return { open };
	},
	fallback(): CapabilityDisclosureOutcome {
		return { open: [] };
	},
});

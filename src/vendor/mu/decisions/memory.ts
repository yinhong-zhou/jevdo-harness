import { defineDecision } from "../decision.ts";
import { pickChoice, threeZone } from "../policy.ts";
import type { Answer, Question, Questions } from "../types.ts";

/**
 * The experience library's questions (kyrn/docs/features/experience-library.md). The judge only
 * judges: whether something is worth keeping, whether a new lesson is one already kept, whether a
 * lesson applies now, and whether the agent followed it. Writing a lesson as one line is a writer
 * model's job, or the user's own words.
 */

/** One stored lesson. `trigger` says when it applies; `lesson` is the single line that gets injected. */
export interface Lesson {
	readonly id: string;
	readonly trigger: string;
	readonly lesson: string;
}

/** A lesson that has not been stored yet: no id until it is. */
export interface LessonText {
	readonly trigger: string;
	readonly lesson: string;
}

/** How a lesson reads in a judge's state: the situation, then what to do. */
export function describeLesson(lesson: LessonText): string {
	return `When: ${lesson.trigger.slice(0, 200)}\nDo: ${lesson.lesson.slice(0, 300)}`;
}

const choiceOf = (answer: Answer | undefined) => (answer?.type === "choice" ? pickChoice(answer) : undefined);
const verdictOf = (answer: Answer | undefined) => (answer?.type === "boolean" ? threeZone(answer) : "unsure");

export interface RecallInput {
	readonly userMessage: string;
	readonly lessons: readonly Lesson[];
}

export type RecallOutcome = { readonly apply: readonly string[] };

export function lessonQuestionId(index: number): string {
	return `lesson_${index}`;
}

function recallQuestions(lessons: readonly Lesson[], field: string): Questions {
	return Object.fromEntries(
		lessons.map((lesson, index) => [
			lessonQuestionId(index),
			{
				type: "boolean" as const,
				instructions: `Does this situation match \`${field}\`? ${lesson.trigger.slice(0, 200)}`,
			},
		]),
	);
}

function recalled(answers: Readonly<Record<string, Answer>>, lessons: readonly Lesson[]): RecallOutcome {
	const apply: string[] = [];
	lessons.forEach((lesson, index) => {
		if (verdictOf(answers[lessonQuestionId(index)]) === "yes") apply.push(lesson.id);
	});
	return { apply };
}

/** A5, experience read side: which stored lessons apply to this message? Only a confident "yes" injects one. */
export const memoryRecall = defineDecision({
	id: "memory.recall",
	version: 1,
	cacheImpact: "append-only",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: RecallInput): Questions {
		return recallQuestions(input.lessons, "user_message");
	},
	buildState(input: RecallInput) {
		return { user_message: input.userMessage };
	},
	policy(answers, input): RecallOutcome {
		return recalled(answers, input.lessons);
	},
	fallback(): RecallOutcome {
		return { apply: [] };
	},
});

export interface TaskRecallInput {
	/** A sub-agent's task: its title and instructions. */
	readonly task: string;
	readonly lessons: readonly Lesson[];
}

/**
 * The same question over a sub-agent's task, for the "known lessons" of its brief. The state holds a
 * task and says so, which is why it is a version of its own. Both versions are live, under one mode.
 */
export const memoryRecallForTask = defineDecision({
	id: "memory.recall",
	version: 2,
	cacheImpact: "none",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: TaskRecallInput): Questions {
		return recallQuestions(input.lessons, "task");
	},
	buildState(input: TaskRecallInput) {
		return { task: input.task };
	},
	policy(answers, input): RecallOutcome {
		return recalled(answers, input.lessons);
	},
	fallback(): RecallOutcome {
		return { apply: [] };
	},
});

export interface CaptureInput {
	readonly userMessage: string;
	readonly previousAssistantMessage: string;
}

/** What the message is, when it is worth keeping: it corrects a mistake, or it sets a rule from now on. */
export type CaptureOutcome = "correction" | "preference" | "skip";

/** D2, experience write side: is this message a correction or a standing preference worth keeping? */
export const memoryCapture = defineDecision({
	id: "memory.capture",
	// 2: the outcome says which of the two it is, for the lesson's kind.
	version: 2,
	cacheImpact: "none",
	latency: "background",
	questions: {
		correction: { type: "boolean", instructions: "Does `user_message` correct a mistake the assistant made?" },
		preference: { type: "boolean", instructions: "Does `user_message` state a rule to follow from now on?" },
	},
	buildState(input: CaptureInput) {
		return { user_message: input.userMessage, previous_assistant_message: input.previousAssistantMessage };
	},
	policy(answers): CaptureOutcome {
		if (threeZone(answers.correction) === "yes") return "correction";
		return threeZone(answers.preference) === "yes" ? "preference" : "skip";
	},
	fallback(): CaptureOutcome {
		return "skip";
	},
});

export interface OutcomeInput {
	/** What the monitor noticed, one line each: "loop: bash: npm test -> error". */
	readonly trouble: string;
	/** The turn: the request, its steps oldest first, and the closing message. */
	readonly turnDigest: string;
}

export type OutcomeVerdict = "learn" | "skip";

/**
 * The agent's own pitfall. Asked at most once per turn, and only when the monitor saw the agent go in
 * circles or off course and the turn still ended well (a check that passed, the goal holding): did
 * what finally worked differ from what it started with? Then the way out is worth a lesson.
 */
export const memoryOutcome = defineDecision({
	id: "memory.outcome",
	version: 1,
	cacheImpact: "none",
	latency: "background",
	capabilities: "relate",
	questions: {
		way_out: {
			type: "boolean",
			instructions:
				"Judging by `turn_digest`, is the approach that finally worked different from the one the agent started with, which ran into `trouble`?",
		},
	},
	// The digest is the long field, so it goes last: a bounded-window judge cuts the tail.
	buildState(input: OutcomeInput) {
		return { trouble: input.trouble, turn_digest: input.turnDigest };
	},
	policy(answers): OutcomeVerdict {
		return threeZone(answers.way_out) === "yes" ? "learn" : "skip";
	},
	fallback(): OutcomeVerdict {
		return "skip";
	},
});

/** `lesson_1`, `lesson_2`, …: a candidate or a lesson in a batched state. */
export function lessonField(index: number): string {
	return `lesson_${index + 1}`;
}

export interface WorthInput {
	readonly lessons: readonly LessonText[];
	/** The project's own instructions (AGENTS.md and the like) as the agent is given them, for `already_known`. */
	readonly projectInstructions: string;
}

export type WorthVerdict = "reusable" | "one_off" | "already_known" | "unclear";

const WORTH: Readonly<Record<WorthVerdict, string>> = {
	reusable:
		"Will help again in later work: a trap and the way around it, a rule for working here, or a fact about the project that is not obvious",
	one_off: "Only about the task at hand, or a passing detail",
	already_known: "What any coding agent does without being told, or what `project_instructions` already says",
	unclear: "Cannot tell",
};

/**
 * The model's own lessons (the `remember` tool) and a sub-agent's (`Lesson:` lines of its report):
 * is it worth keeping? Only `reusable` is stored. One choice question per candidate, all in one request.
 */
export const memoryWorth = defineDecision({
	id: "memory.worth",
	version: 1,
	cacheImpact: "none",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: WorthInput): Questions {
		return Object.fromEntries(
			input.lessons.map((_, index): [string, Question] => [
				`worth_${index + 1}`,
				{
					type: "choice",
					instructions: `What is \`${lessonField(index)}\` to a coding agent that works in this project later?`,
					criteria: WORTH,
				},
			]),
		);
	},
	// The project's instructions are the long field: last.
	buildState(input: WorthInput) {
		const state: Record<string, string> = {};
		input.lessons.forEach((lesson, index) => {
			state[lessonField(index)] = describeLesson(lesson);
		});
		state.project_instructions = input.projectInstructions.trim() || "(none)";
		return state;
	},
	policy(answers, input): readonly WorthVerdict[] {
		return input.lessons.map((_, index) => {
			const picked = choiceOf(answers[`worth_${index + 1}`]);
			return picked === "reusable" || picked === "one_off" || picked === "already_known" ? picked : "unclear";
		});
	},
	// Without a verdict nothing the model or a sub-agent says is kept.
	fallback(input): readonly WorthVerdict[] {
		return input.lessons.map(() => "unclear");
	},
});

export interface MergeInput {
	readonly candidate: LessonText;
	/** The lessons most like it, by the words they share. */
	readonly existing: readonly Lesson[];
}

export type MergeVerdict = "same" | "refines" | "contradicts" | "unrelated";

const MERGE = {
	same: "The same lesson as `candidate`, in other words, or it already says everything `candidate` says",
	refines: "`candidate` covers the same ground and says it more precisely or more specifically",
	contradicts: "It and `candidate` cannot both hold: following one breaks the other",
	unrelated: "About something else",
	unclear: "Cannot tell",
};

/**
 * Before a new lesson is written, the kept lessons most like it (by shared words, no judge) are held
 * against it in one request, one choice question each. What the answers do is the caller's rule:
 * the same lesson is not stored twice, a sharper one replaces the old, and on a contradiction the
 * user's latest word wins.
 */
export const memoryMerge = defineDecision({
	id: "memory.merge",
	version: 1,
	cacheImpact: "none",
	latency: "inline",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: MergeInput): Questions {
		return Object.fromEntries(
			input.existing.map((_, index): [string, Question] => [
				`merge_${index + 1}`,
				{
					type: "choice",
					instructions: `Compared with \`candidate\`, what is \`existing_${index + 1}\`?`,
					criteria: MERGE,
				},
			]),
		);
	},
	buildState(input: MergeInput) {
		const state: Record<string, string> = { candidate: describeLesson(input.candidate) };
		input.existing.forEach((lesson, index) => {
			state[`existing_${index + 1}`] = describeLesson(lesson);
		});
		return state;
	},
	policy(answers, input): readonly MergeVerdict[] {
		return input.existing.map((_, index) => {
			const picked = choiceOf(answers[`merge_${index + 1}`]);
			return picked === "same" || picked === "refines" || picked === "contradicts" ? picked : "unrelated";
		});
	},
	// Nobody compared them: the new lesson is stored as it is, which is what the first version did.
	fallback(input): readonly MergeVerdict[] {
		return input.existing.map(() => "unrelated");
	},
});

export interface AppliedInput {
	/** The lessons brought into the turn. */
	readonly lessons: readonly Lesson[];
	readonly turnDigest: string;
}

/** Ids the judge is sure about, either way. A lesson it was unsure of is in neither list. */
export type AppliedOutcome = { readonly applied: readonly string[]; readonly notApplied: readonly string[] };

/**
 * At the end of a turn: did the agent do what each lesson brought into it says? A confident yes counts
 * as the lesson being used; the rule that retires a lesson recalled often and never followed reads the
 * confident no.
 */
export const memoryApplied = defineDecision({
	id: "memory.applied",
	version: 1,
	cacheImpact: "none",
	latency: "background",
	capabilities: "relate",
	questions: {} as Questions,
	questionsFor(input: AppliedInput): Questions {
		return Object.fromEntries(
			input.lessons.map((_, index): [string, Question] => [
				`applied_${index + 1}`,
				{
					type: "boolean",
					instructions: `Judging by \`turn_digest\`, did the assistant do what \`${lessonField(index)}\` says?`,
				},
			]),
		);
	},
	// The digest is the long field: last.
	buildState(input: AppliedInput) {
		const state: Record<string, string> = {};
		input.lessons.forEach((lesson, index) => {
			state[lessonField(index)] = describeLesson(lesson);
		});
		state.turn_digest = input.turnDigest;
		return state;
	},
	policy(answers, input): AppliedOutcome {
		const applied: string[] = [];
		const notApplied: string[] = [];
		input.lessons.forEach((lesson, index) => {
			const verdict = verdictOf(answers[`applied_${index + 1}`]);
			if (verdict === "yes") applied.push(lesson.id);
			else if (verdict === "no") notApplied.push(lesson.id);
		});
		return { applied, notApplied };
	},
	fallback(): AppliedOutcome {
		return { applied: [], notApplied: [] };
	},
});

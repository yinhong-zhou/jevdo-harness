import { inputPreflight } from '../vendor/mu/decisions/input-preflight.ts';
import { taskFrame } from '../vendor/mu/decisions/task-frame.ts';
import { inputInterjection } from '../vendor/mu/decisions/interjection.ts';
import { skillDisclosure } from '../vendor/mu/decisions/skill-disclosure.ts';
import { capabilityDisclosure } from '../vendor/mu/decisions/capability-disclosure.ts';
import { toolAdmissionBatch } from '../vendor/mu/decisions/tool-admission.ts';
import { testLogSelection } from '../vendor/mu/admission/test-log.ts';
import { contextForget } from '../vendor/mu/decisions/context-forget.ts';
import { contextCompact } from '../vendor/mu/decisions/context-compact.ts';
import { memoryRecallForTask, memoryCapture, memoryOutcome, memoryWorth, memoryMerge, memoryApplied } from '../vendor/mu/decisions/memory.ts';
import { cacheWarming } from '../vendor/mu/decisions/cache-warming.ts';
import { toolRisk } from '../vendor/mu/decisions/tool-risk.ts';
import { toolApproval } from '../vendor/mu/decisions/tool-approval.ts';
import { toolConstraint } from '../vendor/mu/decisions/tool-constraint.ts';
import { fileLocate } from '../vendor/mu/decisions/file-locate.ts';
import { browserStep } from '../vendor/mu/decisions/browser-step.ts';
import { reviewTriage } from '../vendor/mu/decisions/review-triage.ts';
import { diagnosticsDelivery } from '../vendor/mu/decisions/diagnostics-delivery.ts';
import { turnDrift } from '../vendor/mu/decisions/turn-drift.ts';
import { turnRewind } from '../vendor/mu/decisions/turn-rewind.ts';
import { turnCompletion } from '../vendor/mu/decisions/turn-completion.ts';
import { outputDrift } from '../vendor/mu/decisions/output-drift.ts';
import { goalMet } from '../vendor/mu/decisions/goal-met.ts';
import { boardRead } from '../vendor/mu/decisions/board-read.ts';
import { notifyRouting } from '../vendor/mu/decisions/notify-routing.ts';
import { swarmRouting } from '../vendor/mu/decisions/swarm-routing.ts';
import { swarmPatch } from '../vendor/mu/decisions/swarm-patch.ts';
import { hivePublish, hiveDeliver, hiveRelate } from '../vendor/mu/decisions/hive.ts';

/** Source-pinned questions and policies. Integration coverage is tracked separately. */
export const decisions = {
  'input.preflight': inputPreflight, 'task.frame': taskFrame, 'input.interjection': inputInterjection,
  'skills.disclosure': skillDisclosure, 'capability.disclosure': capabilityDisclosure,
  'tool.admission': toolAdmissionBatch, 'tool.admission.test-log': testLogSelection,
  'context.forget': contextForget, 'context.compact': contextCompact,
  'memory.recall': memoryRecallForTask, 'memory.capture': memoryCapture, 'memory.outcome': memoryOutcome,
  'memory.worth': memoryWorth, 'memory.merge': memoryMerge, 'memory.applied': memoryApplied,
  'cache.warming': cacheWarming, 'tool.risk': toolRisk, 'tool.approval': toolApproval,
  'tool.constraint': toolConstraint, 'files.locate': fileLocate, 'browser.step': browserStep,
  'review.triage': reviewTriage, 'diagnostics.delivery': diagnosticsDelivery,
  'turn.drift': turnDrift, 'turn.rewind': turnRewind, 'turn.completion': turnCompletion,
  'output.drift': outputDrift, 'goal.met': goalMet, 'board.read': boardRead,
  'notify.routing': notifyRouting, 'swarm.routing': swarmRouting, 'swarm.patch': swarmPatch,
  'hive.publish': hivePublish, 'hive.deliver': hiveDeliver, 'hive.relate': hiveRelate,
} as const;
export type DecisionPoint = keyof typeof decisions;
export const decisionPoints = Object.keys(decisions) as DecisionPoint[];

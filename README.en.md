<p align="center"><img src="assets/brand/jevdo-icon.png" width="112" alt="JevDo" /></p>
<h1 align="center">JevDo Harness</h1>
<p align="center"><strong>The model is a tool now.</strong></p>
<p align="center"><strong>An agent harness that judges, learns reusable operations, and coordinates agents.</strong></p>
<p align="center">A new harness architecture with Jev at its orchestration core.<br/>Actions retain experience · Jev chooses the next step · The main model is one option</p>
<p align="center"><em>Just Jev it.</em></p>
<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong> · <a href="docs/CONFIGURATION.md">Configuration</a> · <a href="docs/MIGRATION.md">35 judgment points</a> · <a href="reports/unified-v1/ANALYSIS.md">Evaluation</a></p>

What to do next. Which information to keep. Who needs a finding. When the work is actually done. These judgments connect every part of an agent's work.

**JevDo Harness puts Jev at the center of that work.** A verified Action handles a familiar operation directly. New reasoning, code changes and recovery go to the main model. Throughout execution, Jev also participates in context selection, task constraints, memory and communication between agents. As the main model solves new problems, it can save proven operations for the next session.

Built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), combining [JevDo](https://github.com/yinhong-zhou/jevdo)'s Action loop with [MU](https://github.com/qybaihe/mu)'s 35 judgment points. Delivered as a **DSH default Agent Loop replacement plugin**, using the host's tools, permissions and session system.

## A complete handoff

“The CI integration tests are failing. Find and fix the problem, run all checks, and prepare a release if they pass.”

This illustrative scenario assumes verified reproduction, test and build Actions, plus relevant project lessons. Measured results are in [Evaluation](#evaluation).

```text
User input
  ↓
Jev         Frame the task: fix CI, pass checks, prepare a release
            Recall a previous dependency-drift lesson as a lead to investigate
  ↓
Jev         Select an Action: prepare the local environment and reproduce CI
            Host executes and captures failure logs          [repro-ci-integration]
  ↓
Jev         Admit relevant errors to shared history; select the main model
  ↓
Main model  Read logs; delegate ORM investigation and CHANGELOG preparation
Jev         Route subtasks to configured roles and models
  ↓
Workers     A checks version changes and reports incompatible migration mappings
            B reviews merge history in an isolated workspace, returning a CHANGELOG patch
Jev         Gate findings and deliver by task relevance; retain conflicting evidence
  ↓
Main model  Verify the cause, fix the migration, review and apply the CHANGELOG patch
            Register a stable compatibility-check script as an Action draft
            Request validation; host executes and verifies before activation
                                                             [check-schema-compat]
  ↓
Jev         If context reaches its threshold, archive older, bulky tool results
            Protect recent results and key errors; original outputs remain retrievable
  ↓
Jev         Select an Action: run all checks on the current code [test-all]
            Failures go back to the main model for repair and another check
  ↓
Jev         Select an Action: build and verify current artifacts and checksums
            Host executes; results return to shared history  [build-and-verify]
  ↓
Main model  Report changes, check results and release readiness from actual evidence
  ↓
Jev         Check acceptance before stopping; nudge missing work and an updated report
Harness     End the turn when completion conditions hold; retain Actions and useful lessons
```

Throughout the task, Jev also selects progress worth reporting to the human through a separate channel. The scenario connects **Action handoffs, model reasoning, context archival, agent communication, acceptance checks and persistent learning** in one workflow.

Reusable checks and procedures become Actions; unfamiliar failures still need model reasoning. A later request to “run all checks” can finish with **zero main-model calls** when existing Actions cover the work and verification passes. Jev inference still has a cost.

## Put Jev at the core of the agent loop

**Calling the main model becomes one of Jev's choices.**

We replace DSH's default loop driver. Before choosing the next step, Jev reads the assembled conversation, tool records and eligible Action candidates. It can select an Action, call the main model, or enter clarification and completion paths. Action results return to the shared history for the next decision; when needed, the main model continues from that same record.

```text
                      Jev chooses the next step
                     /           |            \
                  Action     Main model     Clarify / completion check
                     \           |
                    Host permissions → Tool execution
                                           |
                              Results return to shared history
                                           └──────────→ Jev
```

With multiple configured models, Jev can also select a model at task boundaries; an explicit user selection takes priority. Actions and parameters come from valid candidates. The executor checks project scope, implementation freshness and actual effects.

**Actions turn a successful operation into a reusable capability.**

A command, a startup script, or a test-and-build sequence can become an Action. Authoring instructions and tools let the main model maintain the library proactively; users can also request it explicitly. Each operation has a purpose, project binding, verifier and version evidence. Drafts become reusable only after execution and verification; implementation changes require revalidation. Simple operations stay commands, while complex procedures should use maintained project scripts.

## Judgment throughout execution

> **μ · Only what's needed.** — [MU](https://github.com/qybaihe/mu)

MU brings Jev into the small decisions around an agent's work. We reuse its judgment kernel and 35 decision points, adapt their effects to native DSH services, and share the judgment infrastructure with the Action loop. Jev participates in both who handles the next step and how that step proceeds.

| Area | What Jev helps decide |
|---|---|
| **Input and tasks · 3** | New task or correction; updates to goals and constraints; interrupt or queue incoming input. |
| **Context · 6** | Relevant skills and tool packs; useful output blocks; repetitive test lines; old results to archive. |
| **Tools and execution · 7** | Constraints and extra approval; file candidates; browser operations; review priorities and diagnostic delivery. |
| **Memory · 6** | Recall, user corrections, recovery lessons, usefulness, duplicates and conflicts, and actual application. |
| **Progress and completion · 5** | Drift and repetition; checkpoint advice; output constraints; acceptance checks and persistent goals. |
| **Agent collaboration · 5** | Worker routing and patch review; publishing findings, choosing recipients and relating evidence. |
| **Reporting and observation · 3** | Useful progress updates; file-change notifications; whether to warm the cache when enabled. |

The 35 points run when their events occur. Each supports `active`, `shadow` and `off`, with an audit record of its decisions. See the [full mapping](docs/MIGRATION.md) for names, sources and adaptations.

**Context stays connected to execution.** Jev's Action scheduler and the main model consume the same assembled and filtered conversation and tool records. Specialized judgments receive the state relevant to their question. Raw outputs remain in DSH event logs and recoverable archives. Host permission denials remain authoritative.

**Findings pass through a communication gateway.** Workers use native DSH sessions, optional history forks and isolated Git worktrees. MU's publication, delivery and relation mechanisms determine which findings reach the shared board and which agents receive them, while retaining conflicting evidence. Changes return as patches for review.

**Progress for people has its own channel.** Jev selects events worth reporting. An optional writing model turns them into concise updates, which stay outside the working model's context.

## One task, end to end

```text
User input → Task frame / interruptions / memory recall
                                  ↓
                    DSH assembles history, skills and tools
                                  ↓
                    Output selection / recoverable archives
                                  ↓
                           Jev orchestration
                         /        |         \
                      Action  Main model   Clarify / finish
                         \        |
                      Host permissions → Tool execution
                                             └─────────↺

Workers ↔ Shared findings board ↔ Jev communication gateway
Progress → Human (outside the working model's context)
```

## Start

Verified target: **DSH 0.2.0-rc.1 / Node.js 24.14+**.

```bash
git clone https://github.com/yinhong-zhou/jevdo-harness.git
cd jevdo-harness
npm ci
# Copy .env.example to .env; set TYPESAFE_API_KEY and DEEPSEEK_API_KEY.
npm run doctor
npm start -- register my-project /absolute/path/to/project
npm start -- ask my-project "Start the project and verify readiness"
```

The headless CLI enables the unified loop. `npm run demo` is offline. To install into an existing DSH host:

```bash
npm run build
dsh --profile jevdo-harness --from-default-profile headless --dump-config
dsh plugin --profile jevdo-harness add /absolute/path/to/jevdo-harness
dsh --profile jevdo-harness "Inspect this project and save useful operations as Actions"
```

Supply Jev credentials in the DSH process environment. The plugin uses the host's model adapters, tools and permissions. See [configuration](docs/CONFIGURATION.md) for optional backends and migration of configured startup agents.

## Evaluation

A live comparison runs native DSH, JevDo and JevDo Harness on the same self-authored project. Both plugins start with empty Action libraries and repeat two workflows in fresh sessions: service startup with readiness checks, and tests followed by a verified build. Each group also runs a mixed development task.

| Observation | Result |
|---|---|
| External effect checks across all three groups | **17 / 17 passed** |
| JevDo Harness repeat tasks in rounds two and three | **4 / 4 with zero generative-model calls** |
| JevDo Harness mixed task | **4 fast Action selections**; code, services and build artifacts passed external checks |

This is one rollout of self-authored scenarios. The integrated harness retains Action reuse, while additional judgments add Jev requests. Initial learning and the mixed task cost more than native DSH; these results do not establish an overall speed or cost advantage. See the [full report and usage](reports/unified-v1/ANALYSIS.md).

Separate behavioral tests use controlled judgments with real DSH sessions, commands, file edits, worktrees and browser interaction. They verify integration behavior rather than live judgment accuracy. Inherited `developer-workflows-*` reports belong to earlier JevDo experiments.

## Scope and sources

- The first release is verified headlessly, without MU's desktop UI or the Pi runtime.
- Tool packs need grouping configuration; skills use the native DSH registry. Archival targets tool results rather than arbitrary long conversations.
- Isolated workers start at clean Git HEAD, without parent uncommitted edits. Patches are returned for review and never merged automatically.
- Rewind proposes checkpoints rather than reverting files. Diagnostics require a configured checker. Output monitoring permits one correction per turn and does not replace permissions.
- Browser automation, file observation and cache warming are opt-in. Each judgment has a cost; a fuller harness is not automatically faster or cheaper.

**Credits:** [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) supplies the runtime and plugin foundation. [MU](https://github.com/qybaihe/mu) supplies the reused judgment kernel, 35 decision definitions and supporting data structures. [JevDo](https://github.com/yinhong-zhou/jevdo) supplies Action scheduling and persistent operations. This repository integrates them on DSH with main-model routing and native service adapters.

[Migration matrix and source pins](docs/MIGRATION.md) · [Action format](docs/ACTION_SPEC.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

MIT. Upstream copyright notices and source provenance are preserved.

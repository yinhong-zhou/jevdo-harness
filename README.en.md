<p align="center">
  <img src="assets/brand/jevdo-icon.png" width="112" alt="JevDo">
</p>

<h1 align="center">JevDo Harness</h1>

<p align="center"><strong>Judge first. Model when needed.</strong></p>
<p align="center">A new generation of harness architecture with Jev at its core.</p>
<p align="center"><em>Just Jev it.</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d8c9ed?style=flat-square&amp;labelColor=eee8f6" alt="MIT license"></a>
  <a href="docs/CONFIGURATION.md"><img src="https://img.shields.io/badge/DSH-0.2.0--rc.1-c8cdf2?style=flat-square&amp;labelColor=e9eafb" alt="DSH 0.2.0-rc.1"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-24.14%2B-c6e3f3?style=flat-square&amp;labelColor=e7f1f8" alt="Node.js 24.14+"></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <b>English</b> · <a href="docs/CONFIGURATION.md">Configuration</a> · <a href="docs/MIGRATION.md">35 judgment points</a> · <a href="reports/unified-v1/ANALYSIS.md">Evaluation</a> · <a href="CONTRIBUTING.en.md">Contributing</a>
</p>

**The model is a tool now.**

Why think through an operation you already know how to do? JevDo Harness lets Jev judge first: familiar operations run directly, while new problems go to the main model. Jev also participates in the small decisions throughout execution—context selection, tool visibility, progress checks and memory recall—with structured, configurable judgments and recorded outcomes.

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

## How a turn works

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

- **Jev decides the next step.** It reads the same assembled conversation and tool history as the main model, choosing an Action, the main model, clarification or completion.
- **Actions retain how to do things.** Commands or scripts persist across sessions with their purpose, project binding and verification method. They become reusable after execution and verification; implementation changes require revalidation.
- **The main model solves new problems and builds new capabilities.** It writes code, reasons, handles exceptions and actively maintains the Action library during tasks.

With multiple configured models, Jev can select a model at task boundaries; an explicit user selection takes priority. Actions and parameters come from valid candidates. The executor checks project scope, implementation freshness and actual effects.

## Judgment throughout execution

> **μ · Only what's needed.** — [MU](https://github.com/qybaihe/mu)

Jev decides who handles the next step and helps determine how it proceeds. The 35 judgment points span execution:

| Area | What Jev helps decide |
|---|---|
| **Input and tasks · 3** | New task or correction; updates to goals and constraints; interrupt or queue incoming input. |
| **Context · 6** | Relevant skills and tool packs; useful output blocks; repetitive test lines; old results to archive. |
| **Tools and execution · 7** | Constraints and extra approval; file candidates; browser operations; review priorities and diagnostic delivery. |
| **Memory · 6** | Recall, user corrections, recovery lessons, usefulness, duplicates and conflicts, and actual application. |
| **Progress and completion · 5** | Drift and repetition; checkpoint advice; output constraints; acceptance checks and persistent goals. |
| **Agent collaboration · 5** | Worker routing and patch review; publishing findings, choosing recipients and relating evidence. |
| **Reporting and observation · 3** | Useful progress updates; file-change notifications; whether to warm the cache when enabled. |

Each point supports `active`, `shadow` and `off`, with an audit record of its decisions. See the [full mapping](docs/MIGRATION.md) for names, sources and adaptations.

**Context stays connected to execution.** Jev's Action scheduler and the main model consume the same assembled and filtered conversation and tool records. Raw outputs remain in DSH event logs and recoverable archives. Host permission denials remain authoritative.

**Findings pass through a communication gateway.** Workers use native DSH sessions, optional history forks and isolated Git worktrees. Publication, delivery and relation mechanisms determine which findings reach the shared board and which agents receive them, while retaining conflicting evidence. Changes return as patches for review.

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

## Evaluation

A live comparison runs native DSH, JevDo and JevDo Harness on the same self-authored project. Both plugins start with empty Action libraries and repeat two workflows in fresh sessions: service startup with readiness checks, and tests followed by a verified build. Each group also runs a mixed development task.

| Observation | Result |
|---|---|
| External effect checks across all three groups | **17 / 17 passed** |
| JevDo Harness repeat tasks in rounds two and three | **4 / 4 with zero generative-model calls** |
| JevDo Harness mixed task | **4 fast Action selections**; code, services and build artifacts passed external checks |

This is one rollout of self-authored scenarios. The integrated harness retains Action reuse, while additional judgments add Jev requests. Initial learning and the mixed task cost more than native DSH; these results do not establish an overall speed or cost advantage. See the [full report and usage](reports/unified-v1/ANALYSIS.md).

A separate [native DSH comparison and mechanism study](reports/unified-mechanisms-v1/ANALYSIS.md) blocked 4/4 fixed violating calls and allowed 4/4 legitimate calls. Message-policy replay reduced deliveries from 24 to 10 while retaining all 10 annotated useful deliveries. Long-log tasks exposed over-filtering and redundant completion checks: both arms produced 6/6 correct files, but native DSH completed 6/6 normally versus 4/6 for the integrated first batch, with higher integrated overhead. The report retains failures, instrumentation interference and an independent rerun; routing replay is not a multi-agent task-success benchmark.

## Quick start

Requires **Node.js 24.14+**. Verified DSH version: **0.2.0-rc.1**.

```bash
git clone https://github.com/yinhong-zhou/jevdo-harness.git
cd jevdo-harness
npm ci
```

Copy `.env.example` to `.env`, set `TYPESAFE_API_KEY` and `DEEPSEEK_API_KEY`, then:

```bash
npm run doctor
npm start -- register my-project /absolute/path/to/project
npm start -- ask my-project "Start the project and verify readiness"
```

The local CLI uses a minimal DSH host with the full loop enabled. `npm run demo` is an offline Action demonstration.

**Install into an existing DSH host:** build the plugin and install the local bundle in a separate profile, using the host's model adapters, tools and permissions:

```bash
npm run build
dsh --profile jevdo-harness --from-default-profile headless --dump-config
dsh plugin --profile jevdo-harness add /absolute/path/to/jevdo-harness
dsh --profile jevdo-harness "Inspect this project and save useful operations as Actions"
```

See [configuration](docs/CONFIGURATION.md) for full settings, migration of configured startup agents and optional backends.

## Scope and limits

- The first release is verified headlessly, without MU's desktop UI or the Pi runtime.
- Tool packs need grouping configuration; skills use the native DSH registry. Archival targets tool results rather than arbitrary long conversations.
- Isolated workers start at clean Git HEAD, without parent uncommitted edits. Patches are returned for review and never merged automatically.
- Rewind proposes checkpoints rather than reverting files. Diagnostics require a configured checker. Output monitoring permits one correction per turn and does not replace permissions.
- Each judgment has a cost; a fuller harness is not automatically faster or cheaper. Use `shadow` mode for your own comparisons.

## Contributing

Contributions are welcome: reproducible issues, Action examples, judgment policies, DSH compatibility and documentation. See the [contribution guide](CONTRIBUTING.en.md) for setup, validation and working with upstream projects.

## Sources and license

MIT.

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): runtime, plugin foundation and the official Agent Loop lifecycle adapted here.
- [MU](https://github.com/qybaihe/mu): the reused judgment kernel, 35 decision points and supporting data structures, adapted to native DSH services.
- [JevDo](https://github.com/yinhong-zhou/jevdo): the Action scheduling, verification and persistent operations this project builds on.

Thanks to the authors and contributors of these projects. This repository integrates their mechanisms on DSH with main-model routing and native service adapters. Upstream copyright and provenance are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). See the [migration matrix](docs/MIGRATION.md) for sources, adaptations and behavioral evidence.

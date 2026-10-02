<p align="center"><img src="assets/brand/jevdo-icon.png" width="112" alt="JevDo" /></p>
<h1 align="center">JevDo Harness</h1>
<p align="center"><strong>The model is a tool now.</strong></p>
<p align="center">Jev orchestrates. Actions retain proven operations. The main model handles new problems.</p>
<p align="center"><em>Just Jev it.</em></p>
<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong> · <a href="docs/MIGRATION.md">35 judgment points</a> · <a href="reports/unified-v1/ANALYSIS.md">Evaluation</a></p>

Your coding agent already knows how to start the project and run its tests. Why should it generate those operations again tomorrow?

**JevDo Harness puts Jev in charge of the next step.** When a verified Action can do the work, the harness executes it through the host's tools. When a task needs new reasoning, code, or recovery, Jev calls the main model. The same judgment kernel also controls context admission, skills, permissions, memory, progress and communication between agents.

An independent **DeepSeek Harness default-loop replacement**, combining [JevDo](https://github.com/yinhong-zhou/jevdo)'s persistent Actions with all 35 pinned [MU](https://github.com/qybaihe/mu) judgment definitions, adapted to native DSH/Cordis services. Targets **DSH 0.2.0-rc.1 and Node.js 24.14+**. No Pi runtime.

## A handoff

```text
“Start the project, add a function, then run tests and build.”

Jev          → saved start Action → host execution → readiness check
Main model   → understand the request → edit code
Jev          → saved test/build Actions → verify current artifacts
Main model   → explain changes and results
```

For a pure repeat request such as “start the project,” valid Actions can finish with **zero main-model calls**. Jev requests still have a cost. The model can save useful commands or scripts as Actions while solving new tasks. Draft creation, execution, verification and activation are separate; stale implementations are revalidated.

## What is integrated

- **Orchestration:** closed-choice Actions, project bindings, model handoff, clarification and completion; optional configured model routing.
- **Context and control:** native skills, tool packs, log selection, recoverable output archives, task constraints, risk checks, goals and project lessons.
- **Teams:** native DSH workers, conversation forks, Git worktrees, publication/delivery gates and explicit disputed findings. Isolated patches include new files and are returned for review.
- **Observation:** a human progress feed outside the working transcript; optional real Chrome/Edge automation, checker diagnostics, workspace notifications and cache warming.

Jev scheduling and the main model consume the same assembled and admitted history. Native surface replacements preserve call/result pairing and raw event records. Each point supports `active`, `shadow` or `off`. No semantic verdict can override a host permission denial.

## Start

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

## Evidence and limits

Behavioral tests exercise real DSH sessions, commands, file edits, worktrees and a local browser, with deterministic judgment fixtures. They demonstrate integration behavior, not live model accuracy.

The [live comparison](reports/unified-v1/ANALYSIS.md) runs native DSH, JevDo and the combined harness on the same self-authored developer tasks, with empty initial Action libraries, fresh sessions and externally checked effects. It reports cold/warm requests, latency, token usage and fixed-rate cost estimates. One rollout per cell is not a general benchmark. Inherited `developer-workflows-*` reports belong to earlier JevDo experiments.

The first release is verified headlessly, without MU's desktop UI. Tool packs need grouping configuration. Compaction targets tool receipts, not arbitrary long conversations. Isolated workers start at clean Git HEAD; parent uncommitted edits are absent. Rewind proposes checkpoints and never automatically reverts. Diagnostics require a configured checker. Cache warming is opt-in and billed. More judgment points mean more inference, not guaranteed savings.

[Migration matrix and source pins](docs/MIGRATION.md) · [Action format](docs/ACTION_SPEC.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

MIT. Credit to MU for its judgment mechanisms and DeepSeek Harness for its runtime and plugin architecture.

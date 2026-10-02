# Contributing to JevDo Harness

[简体中文](CONTRIBUTING.md) · English

Reproductions, documentation, reusable Action examples, judgment policies and DSH compatibility fixes are welcome. You can open an issue or PR directly. For a larger behavior change, describe the use case and expected effect first so it can be discussed.

## Setup

Use Node.js 24.14+. The verified host target is DSH 0.2.0-rc.1. Read [AGENTS.md](AGENTS.md), the [configuration guide](docs/CONFIGURATION.md) and the [mechanism mapping](docs/MIGRATION.md).

```bash
npm ci
npm run check
npm test
npm run build
```

Offline tests use controlled judgments; browser integration tests need a local Chrome/Edge installation. Live API experiments require credentials and incur costs; see the [evaluation report](reports/unified-v1/ANALYSIS.md). Keep credentials in the local environment or `.env`, and remove secrets and private project content from shared logs.

## Preserve the boundaries

- Jev selects valid candidates; execution still checks project scope, implementation freshness and real effects.
- Draft Actions require validation before activation. A saved Action does not grant new authorization.
- Host permissions remain authoritative. Semantic judgments cannot override explicit denials.
- Preserve a consistent transcript, paired tool calls/results and recoverable archived output.
- Keep judgment modes, auxiliary model calls and fallbacks configurable and observable. Human progress updates stay outside the working transcript.
- Adapt MU mechanisms to native DSH services while keeping policies, tools, model interfaces and the loop separate.

## Issues and changes

In an [issue](https://github.com/yinhong-zhou/jevdo-harness/issues), include OS, Node/DSH versions, minimal configuration, reproduction steps, and expected versus observed behavior. For Actions, include a redacted definition and verifier; for judgments, name the point and its `active / shadow / off` mode.

A PR should explain the problem, resulting behavior and validation. Run the checks above for code changes and verify the new behavior or regression. Documentation-only changes need link, example and factual checks. AI assistance is welcome; contributors should understand and verify what they submit.

Update the [migration matrix](docs/MIGRATION.md) when adding or changing judgment integrations. Separate controlled fixtures from live model experiments, report failures and usage, and state task counts and cold/warm conditions. Publish only measurements actually obtained.

## Working with upstream

- **DeepSeek Harness** supplies the runtime, plugin system and adapted loop lifecycle. Report integration problems here. Problems reproducible in stock DSH can be raised through the [DSH repository](https://github.com/deepseek-ai/deepseek-harness) with a minimal reproduction and its participation guidelines.
- **MU** supplies the reused judgment kernel, 35 decision points and supporting structures. Distinguish upstream policy from our DSH adapters. General improvements can be contributed according to the [MU repository](https://github.com/qybaihe/mu)'s guidelines.
- **JevDo** is the independent lightweight Action Loop. For general Action fixes, explain whether they also apply to [the original JevDo](https://github.com/yinhong-zhou/jevdo).

Preserve upstream copyright, licenses and revision provenance, and describe local adaptations. Update the [source/hash manifest](src/vendor/mu/UPSTREAM.json) when updating MU sources; prefer keeping local changes in the adapters. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

# JevDo Harness

- Node.js 24.14+, TypeScript through tsx; use `npm run check`, `npm test`, and `npm run build`.
- On Windows invoke PowerShell 7 through `pwsh.exe -NoLogo -NoProfile -Command { ... }`.
- Never print, commit, or copy credentials into reports. `.env` is local only.
- Keep reusable action definitions separate from project-specific execution bindings.
- Jev chooses registered IDs, not arbitrary executable text. The executor validates scope and freshness.
- Always distinguish offline fixtures, live API runs, and completed benchmarks.
- Do not invent benchmark improvements or claim novelty before evaluating related work.
- This independent repository integrates JevDo's reusable Actions and scheduler with ALL 35 MU judgment points on DeepSeek Harness. Keep the original JevDo repository unchanged.
- DSH 0.2.0-rc.1 is the initial compatibility target. Adapt MU mechanisms to native DSH services; do not introduce a parallel Pi runtime.
- Keep upstream license and source provenance beside the adapted official loop. Do not rewrite its general lifecycle without a demonstrated need.
- Keep the loop independent of the model adapter, decision policy, tools, and action store.
- Use one authoritative conversation transcript. Every tool call must have a matching result.
- Context filtering, communication gateways, multi-agent orchestration, progress narration, memory, permissions and all other MU judgment points are required. Track every actual integration and its evidence in docs/MIGRATION.md. A registry entry or mocked verdict alone does not prove integration.
- Keep host permissions authoritative. Semantic decisions cannot override an explicit deny. Archived context must remain recoverable, and tool call/result pairing must survive filtering.
- No independent budget-allocation/Foreman component in this scope.
- Product text must not expose development notes or internal acceptance checklists.

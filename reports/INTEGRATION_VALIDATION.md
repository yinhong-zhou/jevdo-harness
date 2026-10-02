# 整合版交付验证

日期：2026-10-02。代码和报告均在新仓库 `jevdo-harness`，原 `jevaction` 保持不变。

| 检查 | 结果 | 证据入口 |
|---|---|---|
| TypeScript | 通过 | `npm run check` |
| 完整离线测试 | **74/74 通过** | `npm test`；`test/harness-*.test.ts` 为新增整合测试 |
| 35 判断点真实接入 | 逐点有运行路径与行为测试 | `docs/MIGRATION.md` |
| 原生 DSH profile / bundle | 初始化、安装、合成、运行均退出 0 | `native-unified-smoke.json` |
| 原生 CLI Action 路径 | 真实 Jev 选择后生成 `alpha:2` | 同上；判断无 fallback |
| 真实 API 对照 | **17/17 外部效果通过** | `unified-v1/ANALYSIS.md` |
| 暖 Action 复用 | 两个重复任务第二/三轮均零生成模型调用 | `unified-v1/results.json` |
| 构建 | DSH 插件和 headless CLI 均可构建 | `npm run build` |
| 可安装包 | tarball 在全新目录以 `--omit=dev` 安装；离线 demo 两项目完成且零模型调用 | `npm pack`；`node dist/cli.js demo` |
| 上游一致性 | 43 个 vendored MU 文件哈希一致 | `scripts/audit-release.mjs`、`UPSTREAM.json` |
| 凭据和链接检查 | 已知两个 API key 未出现在待公开文件，文档相对链接存在 | `scripts/audit-release.mjs` |

测试里的 Jev 是确定性 fixture；浏览器使用本机 Chrome 与本地 HTTP 页面。真实 API 对照使用 Jev 与 DeepSeek，但只覆盖两个重复工作流和一个混合任务。它们是不同层次的证据，不互相替代。

包只含构建产物、配置、提示、说明和许可，不含 `.env`、会话运行目录或 node_modules。尚未发布到 npm registry。首版验证范围为 DSH 0.2.0-rc.1 headless；其他宿主版本、完整 Web UI 和第三方插件组合仍需各自验证。

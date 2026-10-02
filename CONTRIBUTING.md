# 参与 JevDo Harness

简体中文 · [English](CONTRIBUTING.en.md)

欢迎提交问题复现、文档改进、可复用 Action 示例、判断策略与 DSH 兼容性修复。可以直接提交 Issue 或 PR；涉及较大的行为变化时，先说明具体场景和预期效果，方便讨论。

## 开发准备

需要 Node.js 24.14+。当前验证的宿主版本是 DSH 0.2.0-rc.1。先阅读 [AGENTS.md](AGENTS.md)、[配置指南](docs/CONFIGURATION.md) 和 [机制映射](docs/MIGRATION.md)。

```bash
npm ci
npm run check
npm test
npm run build
```

离线测试使用可控判断结果；浏览器集成测试需要本机 Chrome/Edge。真实 API 实验另行配置密钥并产生费用，复现方式见 [实验报告](reports/unified-v1/ANALYSIS.md)。密钥只放本地环境或 `.env`，分享日志前移除凭据与私人项目内容。

## 保持这些边界

- Jev 从有效候选中选择；执行器继续检查项目范围、实现版本和真实效果。
- Action 草稿需经过验证才能激活；已有 Action 不构成新的用户授权。
- 宿主权限优先。语义判断不能绕过明确拒绝。
- 保持会话记录一致、工具调用与结果配对，以及已归档结果的可恢复性。
- 判断模式、辅助模型调用和回退行为应可配置、可观察；给人看的进度不回灌工作模型。
- MU 机制适配到 DSH 原生服务。保持判断策略、工具、模型接口与 Loop 之间的边界。

## 提交问题与改动

[问题反馈](https://github.com/yinhong-zhou/jevdo-harness/issues) 请提供操作系统、Node/DSH 版本、最小配置、复现步骤，以及预期和实际结果。Action 问题附上脱敏定义与验收方式，判断问题说明对应判断点及 `active / shadow / off` 模式。

PR 请说明具体问题、行为变化和验证结果。代码改动运行上面的检查，并为新的行为或修复的缺陷提供有效验证；纯文档改动检查链接、示例和事实即可。使用 AI 辅助开发没有问题，提交者需要能解释并验证改动。

新增或修改判断机制时，更新 [迁移矩阵](docs/MIGRATION.md) 的运行路径和证据。实验报告应区分可控 fixture 与真实模型，记录失败、用量、任务数量、冷启动与复用条件；只报告实际测量过的结果。

## 与上游协作

- **DeepSeek Harness** 提供运行时、插件机制和适配的 Loop 生命周期。本项目的接入问题在这里报告；能够在原生 DSH 复现的问题，可按 [DSH 仓库](https://github.com/deepseek-ai/deepseek-harness) 的参与方式反馈，并附上最小复现。
- **MU** 提供复用的判断内核、35 个判断点与相关数据结构。改动先区分 MU 原策略与本项目的 DSH 适配；通用机制改进可以按 [MU 仓库](https://github.com/qybaihe/mu) 的贡献说明提交上游。
- **JevDo** 是 Action Loop 的独立轻量版本。只涉及通用 Action 行为的修复，可同时说明对 [原版 JevDo](https://github.com/yinhong-zhou/jevdo) 的适用性。

引入上游代码时保留原版权、许可和来源版本，说明本地适配。更新 MU 源码时同步 [来源与哈希清单](src/vendor/mu/UPSTREAM.json)；将本地适配尽量留在适配层。来源声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

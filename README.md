<p align="center">
  <img src="assets/brand/jevdo-icon.png" width="112" alt="JevDo">
</p>

<h1 align="center">JevDo Harness</h1>

<p align="center"><strong>Judge first. Model when needed.</strong></p>
<p align="center">判断先行，模型按需。</p>
<p align="center">以 Jev 为核心的新一代 Harness 架构。</p>
<p align="center"><em>Just Jev it.</em></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d8c9ed?style=flat-square&amp;labelColor=eee8f6" alt="MIT license"></a>
  <a href="docs/CONFIGURATION.md"><img src="https://img.shields.io/badge/DSH-0.2.0--rc.1-c8cdf2?style=flat-square&amp;labelColor=e9eafb" alt="DSH 0.2.0-rc.1"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-24.14%2B-c6e3f3?style=flat-square&amp;labelColor=e7f1f8" alt="Node.js 24.14+"></a>
</p>

<p align="center">
  <b>简体中文</b> · <a href="README.en.md">English</a> · <a href="docs/CONFIGURATION.md">配置</a> · <a href="docs/MIGRATION.md">35 个判断点</a> · <a href="reports/unified-v1/ANALYSIS.md">实验</a> · <a href="CONTRIBUTING.md">贡献指南</a>
</p>

**The model is a tool now.**

会做的事，为什么还要再想一遍？JevDo Harness 让 Jev 先判断：会做的事直接执行，新问题才交给主模型。执行过程中的细小决策——上下文取舍、工具筛选、进度检查、经验召回——也由 Jev 结构化地参与，可配置、有记录。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，整合 [JevDo](https://github.com/yinhong-zhou/jevdo) 的 Action 调度循环与 [MU](https://github.com/qybaihe/mu) 的 35 个判断点。以一个 **DSH 默认 Agent Loop 替换插件**交付，沿用宿主的工具、权限和会话系统。

## 一次完整接力长什么样

“CI 的集成测试挂了，定位问题修掉，跑完全量检查，通过的话准备发版。”

下面是一个场景示意：假设项目已有验证过的复现、测试和构建 Action，并保存过相关排障经验。实际测量见后文[实测](#实测)。

```text
用户输入
  ↓
Jev       明确目标：修复 CI、完成检查、准备发版
          召回“上次失败与依赖版本漂移有关”的经验，作为排查线索
  ↓
Jev       选择 Action：准备本地环境，按 CI 配置复现
          宿主执行，捕获失败日志                 [repro-ci-integration]
  ↓
Jev       筛选相关报错，将结果写入共同历史；选择调用主模型
  ↓
主模型    读日志，发起两个子任务：排查 ORM 兼容性、整理 CHANGELOG
Jev       为子任务选择已配置的角色与模型
  ↓
子 Agent  A 核查版本变更，报告迁移脚本中的字段映射不兼容
          B 在独立工作区整理合并记录，交回 CHANGELOG 补丁
Jev       网关筛选发现、按任务投递；有矛盾的证据保留待核查
  ↓
主模型    核实原因，修复迁移脚本；审阅并应用 CHANGELOG 补丁
          将稳定的兼容性检查脚本注册为 Action 草稿
          调用验证工具，宿主执行并验收，通过后激活 [check-schema-compat]
  ↓
Jev       若上下文达到阈值，归档较早的冗长工具结果
          保留最近结果与关键错误，原文仍可取回
  ↓
Jev       选择 Action：跑全量检查，确认当前代码通过 [test-all]
          若失败，将证据交回主模型，修复后再次检查
  ↓
Jev       选择 Action：构建、核对当前产物和校验值   [build-and-verify]
          宿主执行，结果回到共同历史
  ↓
主模型    根据实际结果，汇报改动、检查结果与发版就绪状态
  ↓
Jev       结束前核对验收项；遗漏则提醒继续，补做后更新汇报
Harness   满足结束条件后结束本轮，保留验证过的 Action 与有价值的经验
```

整个过程中，Jev 还会选择值得告诉你的进展，单独输出给人。这个场景把 **Action 接力、主模型推理、上下文归档、多 Agent 通信、验收检查和跨会话积累**连在同一个任务里。

沉淀的是可重复的检查与执行方法，新的故障仍由主模型分析。如果下次请求只是“跑一遍全量检查”，已有 Action 覆盖全部工作且验收通过，**可以全程零次主模型调用**。Jev 本身仍有推理请求和费用。

## 一轮是怎么走的

```text
                      Jev 决定下一步
                    ↙       ↓       ↘
                Action    主模型     澄清 / 完成检查
                    ↘       ↓
                 宿主权限 → 工具执行
                              ↓
                    真实结果回到共同历史
                              └────────→ Jev
```

- **Jev**：决定下一步。读取与主模型相同的已组装会话和工具历史，选择 Action、请求主模型、澄清或结束。
- **Action**：留下怎么做。命令或脚本，连同用途、项目绑定和验收方式，跨会话保留。创建后需执行验证才能复用；实现变化后需重新验证。
- **主模型**：解决新问题，积累新操作。写代码、做推理、处理异常，也在任务中主动维护 Action 库。

配置多个主模型后，Jev 可在任务边界选择合适的模型；用户固定的选择优先。Action 与参数都来自当前有效候选，执行器负责项目范围、版本和验收检查。

## 判断贯穿执行

> **μ · Only what's needed.** — [MU](https://github.com/qybaihe/mu)

Jev 不只决定"下一步由谁做"，也参与"这一步该怎样推进"。35 个判断点覆盖执行全程：

| 环节 | Jev 参与的判断 |
|---|---|
| **输入与任务 · 3** | 新任务还是纠正；目标和约束如何更新；新消息应该打断还是等待。 |
| **上下文 · 6** | 展示哪些技能与工具包；长日志保留哪些块；重复测试输出如何筛选；哪些旧结果可以归档。 |
| **工具与执行 · 7** | 操作是否越过用户约束、是否需要确认；文件候选怎么排序；浏览器下一步做什么；审查发现和诊断如何呈现。 |
| **经验记忆 · 6** | 召回哪些经验；哪些纠正和恢复过程值得保存；如何去重、处理冲突，并记录实际采用情况。 |
| **进度与完成 · 5** | 是否偏离目标或重复尝试；是否建议回退；输出是否违反约束；验收和持续目标是否完成。 |
| **Agent 协作 · 5** | 子任务交给谁；补丁如何交回审阅；发现是否发布、交给谁，以及与已有发现的关系。 |
| **汇报与观察 · 3** | 哪些进展值得告诉人；文件变化何时通知；启用缓存保温时是否发起保温请求。 |

每个点可配置为 `active / shadow / off`，并记录判断流水。具体名称、来源与适配方式见 [35 个判断点](docs/MIGRATION.md)。

**上下文与执行连在一起。** Jev 的 Action 调度与主模型读取同一次组装、筛选后的会话与工具记录。原始工具输出保留在 DSH 事件日志与可检索归档中。语义判断始终服从宿主明确的权限拒绝。

**Agent 之间的发现，经过网关再传递。** 子 Agent 使用 DSH 原生会话，可 fork 历史，也可在独立 Git worktree 中工作。发布、投递和关联机制决定哪些发现进入共享板、哪些 Agent 应当收到，并保留相互矛盾的证据。修改以补丁交回审阅。

**给人看的进度，单独组织。** Jev 选择值得汇报的事件；配置写作模型后，由它生成简洁说明。进度输出不进入工作模型的上下文。

## 一次任务，如何连起来

```text
用户输入 ──→ 任务框架 / 中途打断 / 经验召回
                         ↓
            DSH 组装会话 + 技能 + 工具
                         ↓
              日志准入 / 可恢复的归档
                         ↓
                    Jev 调度
                ↙       ↓       ↘
            Action    主模型     澄清 / 结束
                ↘       ↓
            宿主权限 → 工具执行 → 真实结果
                         └──────────↺

子 Agent ↔ 共享发现板 ↔ Jev 通信网关
人话进度 → 用户（不进入工作模型上下文）
```

## 实测

在同一个自建开发项目中，对照原生 DSH、原版 JevDo 和 JevDo Harness。两种插件从空 Action 库开始，在新会话中重复"启动并验收"和"测试后构建"两类任务，另测一次混合开发任务。

| 观察 | 结果 |
|---|---|
| 三组实验的外部效果检查 | **17 / 17 通过** |
| JevDo Harness 第二、三轮重复任务 | **4 / 4 零生成模型调用** |
| JevDo Harness 混合开发任务 | **4 次快速 Action 选择**，修改、服务与构建产物通过外部检查 |

这是一次自建场景采样。整合版保留了 Action 复用路径，但新增判断带来了更多 Jev 请求；首轮积累和混合任务的费用高于原生组，不能据此宣称整体更快、更便宜。完整过程与用量见 [实验报告](reports/unified-v1/ANALYSIS.md)。

## 快速开始

需要 **Node.js 24.14+**。当前验证版本：**DSH 0.2.0-rc.1**。

```bash
git clone https://github.com/yinhong-zhou/jevdo-harness.git
cd jevdo-harness
npm ci
```

复制 `.env.example` 为 `.env`，填写 `TYPESAFE_API_KEY` 和 `DEEPSEEK_API_KEY`，然后：

```bash
npm run doctor
npm start -- register my-project /absolute/path/to/project
npm start -- ask my-project "启动项目，确认就绪"
```

本地 CLI 使用一个精简 DSH 宿主，默认启用完整循环。`npm run demo` 是不调用 API 的离线 Action 演示。

**接入现有 DSH**：构建后，在独立 profile 中安装本地 bundle，沿用宿主的模型适配器、工具和权限：

```bash
npm run build
dsh --profile jevdo-harness --from-default-profile headless --dump-config
dsh plugin --profile jevdo-harness add /absolute/path/to/jevdo-harness
dsh --profile jevdo-harness "检查项目，把适合复用的操作保存为 Action"
```

完整配置、原 profile 的 Agent 迁移方式、可选后端见 [配置指南](docs/CONFIGURATION.md)。

## 范围与边界

- 首版验证集中在 headless。没有移植 MU 桌面 UI，不依赖 Pi 运行时。
- 工具包按配置分组；技能接入原生 DSH registry。归档侧重工具结果，不承诺任意超长会话都能自动适配模型窗口。
- 子 Agent 的隔离工作区从 Git `HEAD` 创建；父目录未提交改动不会自动复制。补丁交回供审阅，不自动合并。
- 回退判断提供检查点建议，不自动撤销文件。诊断来自明确配置的检查器；输出监控最多纠正一次，不构成权限保障。
- 每个判断都有成本。完整整合不会自动比轻量循环更便宜或更快，可用 `shadow` 做自己的对照。

## 参与贡献

欢迎提交问题复现、Action 示例、判断策略、DSH 适配与文档改进。开发准备、验证要求和上游协作方式见 [贡献指南](CONTRIBUTING.md)。

## 来源与协议

MIT。

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：运行时与插件基座，以及本项目适配的官方 Agent Loop 生命周期代码。
- [MU](https://github.com/qybaihe/mu)：本项目复用的判断内核、35 个判断点及相关数据结构，已适配到 DSH 原生服务。
- [JevDo](https://github.com/yinhong-zhou/jevdo)：本项目延续的 Action 调度、验证与跨会话操作积累。

感谢这些项目的作者与贡献者。本仓库将这些机制整合到 DSH，并加入主模型路由与原生服务适配。上游版权与来源固定在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。完整来源、适配差异和行为证据见 [迁移矩阵](docs/MIGRATION.md)。

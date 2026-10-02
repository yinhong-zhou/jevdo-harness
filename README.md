<p align="center"><img src="assets/brand/jevdo-icon.png" width="112" alt="JevDo" /></p>
<h1 align="center">JevDo Harness</h1>
<p align="center"><strong>The model is a tool now.</strong></p>
<p align="center"><strong>一个会判断、会积累、会协作的 Agent Harness。</strong></p>
<p align="center">以 Jev 为调度核心的新一代 Harness 架构。<br/>Action 沉淀经验 · Jev 决定下一步 · 大模型只是选项之一</p>
<p align="center"><em>Just Jev it.</em></p>
<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a> · <a href="docs/CONFIGURATION.md">配置</a> · <a href="docs/MIGRATION.md">35 个接入点</a> · <a href="reports/unified-v1/ANALYSIS.md">实验</a></p>

下一步做什么，哪些信息该留下，哪个 Agent 需要知道这个发现，任务什么时候才算完成——一个 Agent 的工作，由这些判断连接起来。

**JevDo Harness 把 Jev 放在这套工作的调度中心。** 已有经过验证的 Action，就直接执行；需要理解新问题、修改代码、处理异常，再调用主模型。执行过程中，Jev 同时参与上下文取舍、任务约束、经验记忆和 Agent 通信。主模型解决新问题时，又能把跑通的做法沉淀为下一次直接使用的能力。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，整合 [JevDo](https://github.com/yinhong-zhou/jevdo) 的 Action 调度循环与 [MU](https://github.com/qybaihe/mu) 的 35 个判断点。以一个 **DSH 默认 Agent Loop 替换插件**交付，沿用宿主的工具、权限和会话系统。

## 一次完整接力长什么样

“CI 的集成测试挂了，定位问题修掉，跑完全量检查，通过的话准备发版。”

下面是一个场景示意：假设项目已有验证过的复现、测试和构建 Action，并保存过相关排障经验。实际测量见后文[实验](#实验)。

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

## 把 Agent Loop 的核心交给 Jev

**调用大模型，成为 Jev 手里的一个选项。**

我们替换了 DSH 的默认 Loop 驱动：每次准备决定下一步时，先让 Jev 读取已组装的会话、工具记录和有效 Action 候选。它可以选择执行 Action、调用主模型，或进入澄清与完成路径。Action 的结果回到共同历史，Jev 再决定下一步；需要主模型时，主模型接着同一份记录工作。

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

配置多个主模型后，Jev 还可以在任务边界选择合适的模型；用户固定的选择优先。Action 与参数都来自当前有效候选，执行器负责项目范围、版本和验收检查。

**Action：把一次做成的事，变成下一次会做的事。**

一条命令、一段启动脚本、一组测试和构建步骤，都可以沉淀为 Action。主模型通过提示与工具主动维护操作库；用户也可以明确要求保存。每条操作有用途、项目绑定、验收方式和版本凭证。创建草稿后，执行并验证通过才能复用；实现文件变化后需要重新验证。简单命令直接保存，复杂行为优先调用项目脚本。

## 让判断贯穿整个执行过程

> **μ · Only what's needed.** — [MU](https://github.com/qybaihe/mu)

MU 把 Jev 带进了 Agent 工作中的许多细小决策。我们复用其判断内核与 35 个判断点，将执行效果接到 DSH 原生服务，再与 Action Loop 共用判断基础设施。Jev 既参与“下一步由谁做”，也参与“这一步该怎样推进”。

| 环节 | Jev 参与的判断 |
|---|---|
| **输入与任务 · 3** | 新任务还是纠正；目标和约束如何更新；新消息应该打断还是等待。 |
| **上下文 · 6** | 展示哪些技能与工具包；长日志保留哪些块；重复测试输出如何筛选；哪些旧结果可以归档。 |
| **工具与执行 · 7** | 操作是否越过用户约束、是否需要确认；文件候选怎么排序；浏览器下一步做什么；审查发现和诊断如何呈现。 |
| **经验记忆 · 6** | 召回哪些经验；哪些纠正和恢复过程值得保存；如何去重、处理冲突，并记录实际采用情况。 |
| **进度与完成 · 5** | 是否偏离目标或重复尝试；是否建议回退；输出是否违反约束；验收和持续目标是否完成。 |
| **Agent 协作 · 5** | 子任务交给谁；补丁如何交回审阅；发现是否发布、交给谁，以及与已有发现的关系。 |
| **汇报与观察 · 3** | 哪些进展值得告诉人；文件变化何时通知；启用缓存保温时是否发起保温请求。 |

这 35 个点在相关事件发生时触发。每个点都可配置为 `active / shadow / off`，并记录判断流水。具体名称、来源与适配方式见 [35 个判断点](docs/MIGRATION.md)。

**上下文与执行连在一起。** Jev 的 Action 调度与主模型读取同一次组装、筛选后的会话与工具记录；各专门判断点读取与自身问题相关的状态。原始工具输出保留在 DSH 事件日志与可检索归档中。语义判断始终服从宿主明确的权限拒绝。

**Agent 之间的发现，经过网关再传递。** 子 Agent 使用 DSH 原生会话，可 fork 历史，也可在独立 Git worktree 中工作。MU 的发布、投递和关联机制决定哪些发现进入共享板、哪些 Agent 应当收到，并保留相互矛盾的证据。修改以补丁交回审阅。

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

## 运行

当前验证版本：**DSH 0.2.0-rc.1 / Node.js 24.14+**。

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

本地 CLI 使用一个精简 DSH 宿主，默认启用完整循环。`npm run demo` 是不调用 API 的离线 Action 演示。浏览器、文件监视、诊断命令和缓存保温需要按需配置；缓存保温默认关闭。

**接入现有 DSH**：构建后，在独立 profile 中安装本地 bundle，沿用宿主的模型适配器、工具和权限：

```bash
npm run build
dsh --profile jevdo-harness --from-default-profile headless --dump-config
dsh plugin --profile jevdo-harness add /absolute/path/to/jevdo-harness
dsh --profile jevdo-harness "检查项目，把适合复用的操作保存为 Action"
```

DSH 原生启动时从进程环境读取 Jev 密钥。完整配置、原 profile 的 Agent 迁移方式、可选后端见 [配置指南](docs/CONFIGURATION.md)。

## 实验

在同一个自建开发项目中，对照原生 DSH、原版 JevDo 和 JevDo Harness。两种插件从空 Action 库开始，在新会话中重复“启动并验收”和“测试后构建”两类任务，另测一次混合开发任务。

| 观察 | 结果 |
|---|---|
| 三组实验的外部效果检查 | **17 / 17 通过** |
| JevDo Harness 第二、三轮重复任务 | **4 / 4 零生成模型调用** |
| JevDo Harness 混合开发任务 | **4 次快速 Action 选择**，修改、服务与构建产物通过外部检查 |

这是一次自建场景采样。整合版保留了 Action 复用路径，但新增判断带来了更多 Jev 请求；首轮积累和混合任务的费用高于原生组，不能据此宣称整体更快、更便宜。完整过程与用量见 [实验报告](reports/unified-v1/ANALYSIS.md)。

离线行为测试另使用可控判断结果，执行真实 DSH 生命周期、文件操作、命令、Git worktree 和浏览器交互，验证各判断点的连接与行为。此前 `developer-workflows-*` 等报告属于 **JevDo 历史实验**，与本仓库的新结果分开记录。

## 范围与来源

- 这是完整判断机制在 DSH 上的整合，首版验证集中在 headless。没有移植 MU 桌面 UI，也不依赖 Pi 运行时。
- 工具包按配置分组；技能接入原生 DSH registry。归档侧重工具结果，不承诺任意超长会话都能自动适配模型窗口。
- 子 Agent 的隔离工作区从 Git `HEAD` 创建；父目录未提交改动不会自动复制。补丁交回供审阅，不自动合并。
- 回退判断提供检查点建议，不自动撤销文件。诊断来自明确配置的检查器；输出监控最多纠正一次，不构成权限保障。
- 每个判断都有成本。完整整合不会自动比轻量循环更便宜或更快，可用 `shadow` 做自己的对照。

**来源与致谢：** [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供运行时与插件基座；[MU](https://github.com/qybaihe/mu) 提供本仓库复用的判断内核、35 个判断点及相关数据结构；[JevDo](https://github.com/yinhong-zhou/jevdo) 提供 Action 调度与跨会话操作积累。本仓库将这些机制整合到 DSH，并加入主模型路由与原生服务适配。

完整来源、适配差异和行为证据见 [迁移矩阵](docs/MIGRATION.md)。MIT 许可；上游版权与来源固定在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

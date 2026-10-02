<p align="center"><img src="assets/brand/jevdo-icon.png" width="112" alt="JevDo" /></p>
<h1 align="center">JevDo Harness</h1>
<p align="center"><strong>The model is a tool now.</strong></p>
<p align="center">以 Jev 为调度核心的 DeepSeek Harness。<br/>Action 沉淀做法 · Jev 决定下一步 · 大模型处理新问题</p>
<p align="center"><em>Just Jev it.</em></p>
<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a> · <a href="docs/CONFIGURATION.md">配置</a> · <a href="docs/MIGRATION.md">35 个接入点</a> · <a href="reports/unified-v1/ANALYSIS.md">实验</a></p>

你的 Agent 已经会启动项目、运行测试、发布构建。为什么下次打开项目，它还要重新思考一遍？

**JevDo Harness 把“下一步怎么做”的位置交给 Jev。** 已有经过验证的 Action，就通过宿主工具直接执行；需要理解新问题、修改代码、处理异常，再唤起主模型。与此同时，Jev 参与上下文取舍、权限判断、经验记忆、进度汇报和 Agent 协作。一个调度核心，一份会话记录，做过的事情可以成为下一次直接使用的能力。

这是一个独立的 **DSH 默认 Agent Loop 替换插件**：整合 [JevDo](https://github.com/yinhong-zhou/jevdo) 的 Action 循环与 [MU](https://github.com/qybaihe/mu) 的 35 个判断点，全部运行在 DSH/Cordis 中。兼容 **DSH 0.2.0-rc.1 / Node.js 24.14+**。

## 看一次接力

你说：“启动项目，补一个函数，跑完测试和构建再交给我。”

```text
Jev      选择已保存的启动 Action → 宿主执行 → 检查服务就绪
  ↓
主模型   理解需求 → 修改代码
  ↓
Jev      选择测试、构建 Action → 宿主执行 → 验证当前产物
  ↓
主模型   说明改动与结果
```

如果只是“启动项目”，有效 Action 已存在、执行和验收通过，**整个请求可以零次调用主模型**。Jev 本身仍有推理请求。“零主模型调用”不等于没有模型费用。

遇到新问题时，主模型可以把跑通的操作保存为 Action：简单操作是一条命令，复杂操作适合写成脚本。Action 有用途、项目绑定、验收方式和版本凭证。保存与激活分开；实现文件发生变化时重新验证。

## 一个循环，三层能力

| 层 | 负责什么 |
|---|---|
| **调度与复用** | Jev 选择 Action、主模型或澄清；参数从有效候选中选择；执行后再次决定继续或结束。可配置主模型路由。 |
| **上下文与控制** | 技能和工具包按需展示；长日志筛选、旧结果归档；用户约束、风险判断、完成检查、目标续跑、经验记忆。 |
| **协作与观察** | 原生 DSH 子 Agent、会话 fork、隔离 Git worktree；发现发布、按接收者投递、矛盾保留；独立的人话进度；可选浏览器、诊断和文件变化通知。 |

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

Jev 和主模型读取**同一次组装、筛选后的会话与工具记录**。原始工具输出保留在 DSH 事件日志与可检索归档中。每个判断点都可切换 `active / shadow / off`，宿主的明确权限拒绝始终有效。

## 运行

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

## 验证到哪一步了

离线集成测试使用可控判断结果，真实执行 DSH 生命周期、文件操作、命令、Git worktree 和浏览器交互，覆盖各判断点的实际效果。这证明连接和行为，不代表 Jev 在真实任务中的判断准确率。

真实 API 对照使用同一个自建开发项目：原生 DSH、原版 JevDo、整合版各自隔离；插件从空 Action 库开始，重复三轮，原生组只跑一次。另测“启动 → 改代码 → 测试构建”的混合任务。结果、原始记录、费用假设与限制见 [实验报告](reports/unified-v1/ANALYSIS.md)。此前 `developer-workflows-*` 等报告是继承的 **JevDo 历史实验**，不能作为本仓库的新性能结果。

## 范围与来源

- 这是完整判断机制在 DSH 上的整合，首版验证集中在 headless。没有移植 MU 桌面 UI，也不依赖 Pi 运行时。
- 工具包按配置分组；技能接入原生 DSH registry。归档侧重工具结果，不承诺任意超长会话都能自动适配模型窗口。
- 子 Agent 的隔离工作区从 Git `HEAD` 创建；父目录未提交改动不会自动复制。补丁交回供审阅，不自动合并。
- 回退判断提供检查点建议，不自动撤销文件。诊断来自明确配置的检查器；输出监控最多纠正一次，不构成权限保障。
- 每个判断都有成本。完整整合不会自动比轻量循环更便宜或更快，可用 `shadow` 做自己的对照。

完整来源、适配差异和行为证据见 [迁移矩阵](docs/MIGRATION.md)。感谢 MU 的判断机制与 DeepSeek Harness 的插件基座。MIT 许可；上游版权与来源固定在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

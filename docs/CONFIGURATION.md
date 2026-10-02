# 配置与使用

JevDo Harness 是 DSH 0.2.0-rc.1 的 Loop 替换 bundle。需要 Node.js 24.14+。CLI 是便于开发和复现的精简宿主；原生 DSH 安装则沿用其模型适配器、工具注册、权限和会话存储。

## 本地 CLI

复制 `.env.example` 为 `.env`，配置 Jev 和主模型密钥。不要提交 `.env`。

```bash
npm ci
npm run doctor
npm run demo
npm start -- register demo /absolute/path/to/project
npm start -- ask demo "检查这个项目，把常用操作保存为 Action"
npm start -- list
```

`doctor` 只显示配置状态，不请求 API。`demo` 使用确定性选择器，不验证 Jev 准确率。`ask` 默认启用整合版；结果中的 `modelRequests` 包含通过宿主 adapter 的辅助写作调用，不应直接称作主 Agent 推理次数。

CLI 的 Action 库默认在 `.jevdo/`，可用 `JEV_ACTION_HOME` 修改。完整判断配置默认读取 `config/harness.json`，可通过 `JEV_HARNESS_CONFIG` 指定其他 JSON 文件。子服务数据在 Action 库的 `harness/` 目录：判断审计、记忆、归档、进度、检查点、团队板和工作区。它们可能含有项目内容，应按本地会话数据管理。

## 安装进原生 DSH

```bash
npm run build
dsh --profile jevdo-harness --from-default-profile headless --dump-config
dsh plugin --profile jevdo-harness add /absolute/path/to/jevdo-harness
dsh --profile jevdo-harness "启动项目，确认可访问"
```

原生 DSH 不自动读取本仓库 `.env`；在启动它的环境中配置 `TYPESAFE_API_KEY`。主模型使用 DSH 本身的模型设置。bundle 禁用 `agent-loop`，新增 `jevdo-harness`，不会同时运行两个 Loop。

若原 profile 的 `agent-loop.config.agents` 有自定义启动 Agent，需要把该数组移到 `jevdo-harness.config.agents`。headless profile 通常由入口创建 Agent，保持 `agents: []` 即可。不要同时加载旧版 `jevaction` bundle，它也会注册替换 Loop。

可在 profile patch 或 `--patch` 文件中设置：

```yaml
- id: jevdo-harness
  config:
    home: /absolute/path/to/shared-action-store
    agents: []
    commandMode: bash # Windows 用 pwsh；argv 适用于提供该工具的自定义宿主
    commandTool: bash
    apiKeyEnv: TYPESAFE_API_KEY
    model: jev-latest
    harness:
      mode: active
      permissionMode: host
      admissionChars: 4000
      compactChars: 100000
      keepRecentResults: 3
      modes:
        output.drift: shadow
        cache.warming: off
```

DSH 默认库在 `~/.dsh/jevdo-harness`；`config.home` 优先于 `JEV_ACTION_HOME`。项目会依据实际 Agent cwd 绑定。Action 的命令执行始终经过宿主 ToolRuntime 和 `commandTool`。不能把语义批准当作沙箱。

## 判断模式

| 模式 | 请求 Jev | 应用判断 |
|---|---|---|
| `active` | 是，触发该功能时 | 是 |
| `shadow` | 是 | 否，采用该点的保守 fallback；记录判断供对照 |
| `off` | 否 | 采用 fallback |

这些模式控制判断，不卸载整个服务。例如 `context.compact: off` 保留结果，`skills.disclosure: off` 保留技能展示，`tool.risk: off` 对已命中破坏性规则的操作仍可能要求确认。`action.next: off` 会把调度回退给主模型。可在 `modes` 为 35 个 MU 点及 `action.next`、`model.select` 单独配置；未知名称在启动时拒绝。

`harness.enabled: false` 关闭整合服务，保留轻量 Action Loop。顶层 `enabled: false` 仅关闭 Action 快速调度，不关闭 MU 机制。恢复原生 Loop 应从 profile 移除这个 bundle，而不是仅关闭某个判断模式。

## 按需配置

以下片段放在 `harness` 下；CLI 则放在 JSON 配置顶层。

### 模型路由

```yaml
models:
  - id: fast
    provider: your-dsh-provider
    model: your-fast-model
    description: 常规读写与短任务
  - id: deep
    provider: your-other-provider
    model: your-reasoning-model
    description: 多文件分析与困难修复
# fixedModel: deep
```

Provider 必须已在宿主注册。Jev 在任务边界选择，固定选项优先；子 Agent 使用 `swarm.routing` 的强度选择。不要把这些 provider 名直接照抄为可用模型。本地精简 CLI 默认只注册单个 DeepSeek transport，多 provider 路由应在原生 DSH 中配置。

### 技能和工具包

原生 `ctx.skills` 与 `dsh-tool-skill` 自动接入；Jev 筛选目录的描述，显式加载仍可访问隐藏技能。也可以额外配置本地技能和已经注册的工具包：

```yaml
skills:
  - name: project-release
    description: 当前项目的发版流程
    path: /absolute/path/to/SKILL.md
capabilities:
  - id: browser
    title: Browser
    description: 访问网页、操作页面并检查结果
    tools: [jevdo_browse, jevdo_browser_snapshot, jevdo_browser_act]
```

工具包只控制模型看到哪些已有 schemas；不启动 MCP 服务器，不赋予被宿主拒绝的权限。主模型用 `jevdo_capability` 发现/打开，`jevdo_skill` 发现/加载。跨任务已打开的包保留，避免正在进行的工具调用失效。

### 子 Agent 与进度

```yaml
team:
  maxWorkers: 4
  maxDepth: 1
  timeoutMs: 180000
  roles:
    reviewer: 检查实现与验收证据
# boardWriter:
#   provider: your-dsh-provider
#   model: your-summary-model
#   maxTokens: 500
```

`jevdo_swarm` 支持 `read` 和 `isolated`，以及 `fork: true`。只读 Agent 采用严格工具集合；工作区隔离从 clean HEAD 创建，未提交父目录改动不复制。取消父请求会取消子任务。补丁不自动合入；工作区保留供审阅，当前无自动垃圾回收命令。

`board.read` 选有用事件，`jevdo/progress` 输出给宿主 UI/CLI，并写入 `progress.jsonl`。配置 `boardWriter` 才额外调用写作模型；这些输出不进入工作模型历史。

### 浏览器、诊断与观察

```yaml
browser:
  enabled: true
  channel: chrome # 或 msedge；也可 executablePath 指定本机浏览器
  headless: true
  maxSteps: 12
observations:
  enabled: true
  debounceMs: 350
diagnostics:
  format: tsc
  command:
    command: npx
    args: [tsc, --noEmit, --pretty, 'false']
    cwd: .
    timeoutMs: 60000
```

浏览器使用本机 Chrome/Edge，不自动下载。`jevdo_browse` 根据实际页面元素选择操作，逐步执行、观察、再判断；输入文字如需生成，会请求无工具的辅助写作模型。

诊断使用上述 checker 的真实输出，支持 `tsc` 文本或 JSON 数组 `[{"file":"a.ts","line":1,"severity":"error","message":"..."}]`。DSH 本版 LSP seam 没有 publishDiagnostics，所以本插件不假装监听一个不存在的接口。自动检查围绕直接文件编辑工具；shell 产生的文件变化没有全覆盖。错误可暂缓，但结束前会复查投递；checker 失败不会被当成检查通过。

文件通知只说明观测到哪些路径变化，不声称是谁修改或某个操作成功。观察器默认关闭，启用后会过滤 `.env` 和常见生成目录。缓存保温另配 `cacheWarming.enabled: true`；一次空闲边界最多一次、最长输出 1 token、忽略所有返回工具调用，仍会计费，默认关闭。

## 可恢复性与限制

- 长工具结果先做准入；超过字符预算再尝试归档旧结果，最近若干结果和结构化失败保护。字符数是工程阈值，不能精确代替 token 预算。
- `jevdo_archive` 按 id 读取原文；DSH 原始事件不改，投影变化可跨进程恢复。fork 可以读取继承记录的归档，不能任意读兄弟会话。
- `turn.rewind` 返回建议和直接编辑工具的检查点；不会自动回滚。shell 副作用、外部文件改动不在检查点覆盖中。
- 宿主 guard 始终优先。`permissionMode: jev` 只增加语义询问；默认 `host`。
- 输出监视检查文本和工具参数；每轮最多纠正一次，无法替代确定性约束或宿主权限。

## 开发与复现

```bash
npm run check
npm test
npm run build
npm pack --dry-run
npm run eval:unified -- --id=my-run --live
```

评测使用真实 API，会产生费用。已有 run id 不覆盖；省略 `--live` 只生成方案。记录所有失败，完整解释见 `reports/unified-v1/ANALYSIS.md`。原生 Windows CLI 安装烟测脚本为 `scripts/dsh-unified-smoke.ts`，使用独立临时 DSH_HOME，不改变已有 profile。

# MU → DeepSeek Harness：实现与证据矩阵

## 来源和边界

- JevDo 基线：`0a2e116b5737449f141ad2a03b83ff792092b4a9`，原仓库保持独立。
- MU：`qybaihe/mu@8dfebe36508ac0c2508735bb866756dab9283e74`。43 个框架无关源码文件按原字节保留，哈希清单在 `src/vendor/mu/UPSTREAM.json`，MIT 许可相邻存放。
- DSH：`0.2.0-rc.1`，适配官方 Loop `4878cdabd87d4041bdaff61d04c966883b9fd07a`，Cordis `4.0.4`。

`catalog.ts` 包含 35 个唯一 spec，其中 `tool.admission.test-log` 在 MU 该版本源码中是单独实验机制；本仓库把它接入可识别的测试日志。下表的“实现”是本仓库的运行路径与行为证据，不等于复刻 MU 的所有 UI、默认参数或产品功能。没有 Pi 运行时，也没有移植桌面端。

## 统一结构

`Kernel` 共享 transport、typed questions、逐点模式、默认回退、取消和判断流水。MU 原策略保留各自的概率解释，Action 调度不增加全局置信度门槛。适配层负责把结果落到 DSH 原生 hook、tool、session、worker 上。

DSH 官方持久化对事件种类有固定校验。本仓库不扩展其未知事件白名单，归档用原生 `tool/result` surface replacement：保留调用 ID、配对和原始 append-origin 记录。恢复会话继续得到同一份投影。Jev Action 调度与主模型共用这份已准入请求。

## 35 个点

测试链接缩写：C=`harness-context`，S=`harness-services`，P=`harness-policies`，T=`harness-team`，I=`harness-io`；均在 `test/*.test.ts`，使用可控判断输出，但实际执行 DSH 和外部效果。

| # | MU point | 本仓库运行效果 | 集成位置 | 行为证据 |
|---|---|---|---|---|
| 1 | `input.preflight` | 新输入分类、努力提示与澄清提示进入后续请求 | `runtime.beforeStep` | P：输入框架与约束 |
| 2 | `task.frame` | 创建/更新任务框架、约束、验收项并持久化 | `runtime.beforeStep` / `tools` | P：新约束阻止写入 |
| 3 | `input.interjection` | 运行中输入分配到下一步/下一轮；纠正可取消当前生成 | `runtime.routeInput` / adapted Loop | P：旧请求取消、新指令生效 |
| 4 | `skills.disclosure` | 原生 skill catalog 的正文与 entries 同时过滤；手动可加载 | `disclosure` | S：原生 registry/catalog 去重、隐藏技能加载 |
| 5 | `capability.disclosure` | 按需暴露已注册工具包与 sections，不覆盖宿主 deny | `disclosure.assemble` | S：隐藏、打开、宿主限制 |
| 6 | `tool.admission` | 长文本按块选择，省略部分有原文指针 | `context.project` | C：共同历史、原文、持久化恢复 |
| 7 | `tool.admission.test-log` | 保护失败/摘要，选择可省略状态行；规则折叠也服从 shadow | `context.project` + upstream parser | C：active/shadow/off 三种实际输出 |
| 8 | `context.forget` | 容量压力下归档较早回合的工具结果 | `context.project` | C：跨回合遗忘、调用配对、归档取回 |
| 9 | `context.compact` | 按需归档较旧结果，保护最近结果与结构化错误 | `context.project` | C：两次工具调用、失败保护 |
| 10 | `memory.recall` | 项目范围候选记忆经判断后注入 | `memory.input` | S：跨 Agent 召回 |
| 11 | `memory.capture` | 捕获用户纠正/偏好，保留原话 | `memory.input` | S：用户规则入库 |
| 12 | `memory.outcome` | 失败后有验证的恢复才提炼候选经验 | `memory.finish` | P：恢复经验调用 writer 并保存 |
| 13 | `memory.worth` | 不值得复用的模型候选不保存 | `memory.remember` | S：候选准入 |
| 14 | `memory.merge` | 去重、细化/冲突旧项状态；模型不能覆盖用户规则 | `memory.remember` | S：替代关系与用户优先 |
| 15 | `memory.applied` | 对召回记忆记录本轮是否实际采用 | `memory.finish` | S：应用计数变化 |
| 16 | `cache.warming` | 启用时决定一次空闲保温，丢弃全部生成和工具调用 | `warming` | I：计数、会话不变、工具未执行 |
| 17 | `tool.risk` | 规则先找到危险命令，再决定是否额外确认 | `runtime.beforeTool` | P：git reset 命令未派发 |
| 18 | `tool.approval` | 可选语义权限层，对不确定/超范围请求询问 | `runtime.beforeTool` | S：批准不能覆盖最终 host guard |
| 19 | `tool.constraint` | 用户约束与变更调用冲突时阻止执行 | `runtime.beforeTool` | P：文件未被写入 |
| 20 | `files.locate` | 枚举真实工作区候选并排序 | `jevdo_locate` | P：真实文件候选与优先级 |
| 21 | `browser.step` | 从当前页面元素选择操作，执行后重新观察 | `browser` / `jevdo_browse` | I：真实 Chrome 点击本地页面并结束 |
| 22 | `review.triage` | 给发现分级排序，不丢掉原始 findings | `jevdo_review` | P：重排与保留 |
| 23 | `diagnostics.delivery` | checker 增量诊断立即/暂缓/丢弃；错误结束前复查 | `diagnostics` | I：真实 checker 暂缓、投递、解决 |
| 24 | `turn.drift` | 定期发现重复或偏离，注入重新评估提示 | `runtime.beforeStep` | P：重复动作后提示 |
| 25 | `turn.rewind` | 死路时给检查点回退建议，保留文件等待审阅 | `runtime` / `checkpoints` | P：建议；I：真实编辑前快照 |
| 26 | `turn.completion` | 未验收就结束时追加一次验证提醒 | `runtime.stopping` | P：提醒后实际执行检查命令 |
| 27 | `output.drift` | 监视生成文本/工具参数；中止违规尝试并修正 | `monitor` / adapted Loop | T：违规工具未执行、继续成功 |
| 28 | `goal.met` | 有持久目标时判断完成或继续，次数有上限 | `runtime.stopping` | P：继续到完成、状态落盘 |
| 29 | `board.read` | 选当前有意义事件，为人输出进度 | `board` | S：人话不进入工作上下文 |
| 30 | `notify.routing` | 实际文件变化观察决定立即提示/排队/省略 | `observer` / `runtime.notify` | I：闲置时不唤起模型，通知入队 |
| 31 | `swarm.routing` | 子任务按角色/强度选配置模型，创建原生 Agent | `team.run` | T：子任务创建、执行、清理 |
| 32 | `swarm.patch` | 根据真实 Git 差异给合并审阅建议，交回补丁 | `team.run` | T：新文件补丁可 git apply --check |
| 33 | `hive.publish` | 工具/最终发现进入团队共享板前判断 | `team.publish` | T：真实 worker findings 发布 |
| 34 | `hive.deliver` | 对接收者任务决定投递，DSH inbox 接收 | `team.publish` | T：父/子消息与只读限制 |
| 35 | `hive.relate` | 保留支持/替代/矛盾关系，并通知旧消息接收者 | `team.publish` | T：相互矛盾的端口发现同时保留 |

完整细节见 [配置指南](CONFIGURATION.md) 和各实现文件。不同触发条件才调用不同点；不表示每次用户输入都要调用全部 35 点。

## JevDo 的额外机制

- `action.next`：共享 Jev kernel 的闭集选择；有效 Action 经宿主执行，独立验证后再次判断是否委派或结束。
- `model.select`：任务边界在配置好的宿主模型中选择，固定选择优先。不能凭空添加没有 provider 的模型。
- Action 作者提示由 `systemPrompt.section` 注入，创建、验证、目录和运行通过原生工具实现；不要求修改宿主系统 prompt 文件。
- 正在执行的主模型流先完整收集/监控后才结算工具调用。拦截的尝试保留原始流与 attempt 记录，不产生悬空 tool/result。

## 适配差异和限制

1. 原生 DSH 0.2.0-rc.1 LSP 不提供诊断推送；实现独立 checker snapshot adapter，未冒充上游事件。直接编辑 hook 自动触发，shell 编辑未全覆盖。
2. 浏览器是 Playwright-core + 本机 Chrome/Edge 的实际工具后端，不是 MU 桌面 UI。网页文字输入可能使用辅助模型生成。
3. 工具包由配置组织，作用于宿主已注册的 schemas/sections，不自动管理 MCP 进程。技能使用原生 registry，显式 invocation 不被筛掉。
4. `turn.rewind` 只建议回退。检查点保护直接文件编辑的原始字节；不自动处理 shell/远端副作用。
5. 工作区从 clean HEAD 分叉；不自动复制父目录未提交改动。私有临时 index 生成包含新文件的二进制补丁，不动真实 index；不自动合并、删除工作区或创建 PR。
6. 团队矛盾会持久化和投递；复核由主 Agent 决定，没有自动生成第三个仲裁者的独立流程。
7. 归档改动缓存前缀，并有误删有效上下文的风险；保留恢复工具不能保证模型会主动恢复。字符阈值不是精确 token 窗口控制。
8. native host 工具权限是最终边界。语义输出监控单轮纠正一次，不作为确定性安全保证。
9. JevDo 的 `jevaction_*` 工具名保持兼容；新包/插件 ID 为 `jevdo-harness`。旧轻量库不被修改。

## 验证类型

本轮完整测试 74/74，包含原 JevDo 回归与新增整合行为。真实 API 实验单独记录在 `reports/unified-v1`，不得把 fixture judge 的输出当作实际模型表现。原生 DSH bundle 安装与运行另见 `reports/native-unified-smoke.json`。

先前 `docs/DELIVERY*`、`reports/developer-workflows-*` 等保留为历史记录。它们的性能和交付状态不代表本整合版；本文件、当前 README 与新报告为本版入口。

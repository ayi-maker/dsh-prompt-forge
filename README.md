# dsh-prompt-forge · 提示词锻造台

把「模糊想法」锻造成「完整、可靠、高效」的提示词的 DSH 插件。

## 它做什么

你在对话里说一句模糊的想法 → 助手每轮问你 **3-5 个带选项的问题** → 你点选项或补充 → 十项要素逐项确认 → 定稿成一份可直接复制使用的提示词。

主面板的「提示词」页实时显示：完整度百分比、十项要素的确认状态、实时草稿、还缺哪些信息、历史记录。

## 三种入口

| 入口 | 用法 |
|---|---|
| 直接说 | 「我想做个 X，但描述不清」→ 助手自动进入锻造流程 |
| 斜杠命令 | `/prompt 我的想法` |
| 侧边栏 | 点侧边栏的铅笔图标 → 打开锻造台面板 |

## 十项要素

`outcome` 目标与成功标准 · `deliverable` 交付物形态 · `constraints` 硬约束 · `context` 背景与输入 · `quality` 质量标准 · `audience` 受众 · `role` 角色 · `method` 方法 · `examples` 参考样例 · `risks` 失败模式

priority 1（outcome / deliverable / constraints / context）与 priority 2（quality / audience）齐了才算「可定稿」；priority 3-4 未确认时，定稿会**整节省略**而不是留「待补」占位。

为什么是这十个、顺序和权重怎么来的：[WHY-THESE-SLOTS.md](WHY-THESE-SLOTS.md)。

## 给 agent 用的工具

`prompt_forge` 工具，action：`start` / `update` / `draft` / `finalize` / `status` / `list` / `get` / `delete`。

会话 id 自动取当前 Agent 的会话，所以 `/prompt` 和面板看到的永远是同一条记录。

## 数据存放

`$DSH_HOME/prompt-forge/store.json`（默认 `~/.dsh/prompt-forge/store.json`），最多保留 200 条。全部是普通 JSON，可以直接备份/编辑。

## 架构

- **Host**（`index.js`）：`prompt_forge` 工具、`prompt-forge` 技能、`/prompt` 命令、`store.json` 持久化、面板 RPC 渠道、`sessionProjections` 投影。
- **Client**（`client.js`）：侧边栏图标、主面板、输入区 dock。
- **slots.js**：十项要素的唯一事实来源——改了它，工具和面板同步生效。

### 为什么不用轮询

面板通过 **session projection**（`promptForge`，一个每次 `prompt_forge` 工具调用就 +1 的计数器）感知变化：dock（session 作用域）订阅这个投影，变化时只拉一次全量；主面板从浏览器内共享 store 读取。没有 `setInterval`。

### 依赖

运行时只依赖 [`zod`](https://www.npmjs.com/package/zod)（供 projection 的 schema 用）。无构建步骤，无其他运行时依赖。

## 开发

```powershell
node --check index.js
node --check client.js
node test/host.test.mjs      # Host：注册 + 全流程 + projection 语义
node test/client.test.mjs    # Client：模块加载 + slot 注册 + 组件渲染 + 无轮询断言
```

安装：

```
plugin_manager { action: "install_bundle", target: "<绝对路径>/dsh-prompt-forge" }
```

Client 改动通过软链即时生效，刷新页面即可；Host 改动需要重装或重启。

## 许可

MIT，见 [LICENSE](LICENSE)。

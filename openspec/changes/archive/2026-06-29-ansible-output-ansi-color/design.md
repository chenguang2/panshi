## Context

节点操作结果输出框（`NodeExecutionResultDrawer.vue`）当前通过 `{{ line }}` 插值表达式直接显示 Ansible 的输出文本。Ansible 默认启用颜色输出，stdout 中包含了 ANSI SGR 转义序列（如 `[0;32m`、`[0;31m` 等），这些序列在终端中被解释为颜色，但在纯文本 `pre` 标签中显示为原始字符。

后端 `ansible_service.py` 已有 `_strip_ansi()` 函数，但仅用于解析 nginx 状态和统计信息阶段，返回前端的 `stdout`/`stderr` 仍包含原始 ANSI 码。

已有显示流程：
- 后端 → 返回 `{ stdout, stderr, rc, command }` 给前端
- `useClusterNodes.ts` → 调用 API 后将输出写入 `execLogs` 和 `execResult`
- `NodeExecutionResultDrawer.vue` → 通过插值显示日志文本

## Goals / Non-Goals

**Goals:**
- ANSI 颜色码在输出框中渲染为对应的颜色样式
- 支持 Ansible 使用的常用 ANSI 颜色：绿(ok)、红(fatal)、蓝(play)、青(task)、黄(warning)、紫(skipped)
- 不丢失任何文本内容（颜色码只影响显示，不裁剪文本）
- XSS 安全：先 HTML 转义，再替换颜色码

**Non-Goals:**
- 不支持完整的终端仿真（如光标移动、擦除序列）
- 不改变后端 API 返回格式
- 不替换现有 `extractKeyInfo` 的关键信息提取逻辑
- 不修改 Ansible 配置来关闭颜色输出

## Decisions

### Decision 1: 前端渲染 vs 后端去码

**选择：前端渲染（保留 ANSI 码到前端，由前端转 HTML）**

理由：
- 后端已有 `_strip_ansi()`，但一旦去掉颜色码就无法恢复
- 前端渲染可以让颜色方案和组件样式更灵活（可换主题）
- ANSI→HTML 转换是纯展示逻辑，放在前端更合适
- 未来如果有其他消费方（如导出日志）可以选带颜色或不带颜色

### Decision 2: 工具函数位置

**选择：在 `src/utils/ansi.ts` 中新增 `ansiToHtml()` 函数**

理由：
- 与组件逻辑解耦，可测试
- 可能被多个组件引用（`NodeExecutionResultDrawer.vue`、`NodeList.vue`）
- 保持 composable 聚焦于业务逻辑

### Decision 3: 颜色映射方案

**选择：使用 CSS color 关键词，适配深色/浅色主题**

| ANSI 码 | CSS 颜色 | 含义 |
|---|---|---|
| `[1;34m` | `#268bd2` / blue | PLAY 头 |
| `[0;36m` | `#2aa198` / cyan | TASK 标题 |
| `[0;32m` | `#859900` / green | ok / changed |
| `[0;33m` | `#b58900` / yellow | WARNING |
| `[0;31m` | `#dc322f` / red | fatal / FAILED |
| `[0;35m` | `#d33682` / magenta | skipped / unreachable |
| `[0m` | (reset) | 回到默认色 `#d4d4d4` |

颜色值选用 Solarized 调色板，与当前 log-box 深色背景 (`#1e1e1e`) 搭配良好。

### Decision 4: XSS 防护策略

**选择：先 HTML 转义（`&` → `&amp;`, `<` → `&lt;` 等），再替换 ANSI 码为 `<span>`**

因为最终渲染使用 `v-html`，必须确保用户/Ansible 输出的文本中不包含可执行的 HTML。先转义再替换保证了 ANSI 码生成的 `<span>` 是唯一 HTML 标签。

### Decision 5: v-html 影响范围

**选择：只对日志具体行内容使用 v-html，外部容器和标题行保持文本插值**

`NodeExecutionResultDrawer.vue` 中：
- `summary` tab 的 log-box 行：`v-html="ansiToHtml(line)"`
- `stdout` tab 的 pre 块：`v-html="ansiToHtml(logs.join('\n'))"`
- 标题行、时间戳、分隔线：保持 `{{ line }}`

## Risks / Trade-offs

- **[安全] v-html 引入 XSS 风险** → 通过先 HTML 转义再 ANSI 替换来消除，确保任何用户可控文本不会产生未预期的 HTML
- **[兼容性] 现有 extractKeyInfo 和 summary 卡片中的文本仍是无样式的纯文本** → 期望行为，关键信息提取不需要颜色
- **[性能] 大量日志行时 v-html 渲染比纯文本慢** → 日志量通常 <500 行，性能影响可忽略
- **[可维护性] ANSI 解析正则可能遗漏边缘情况** → 覆盖 Ansible 实际输出的所有序列类型，迭代补充

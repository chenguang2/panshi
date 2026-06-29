## Why

当前节点操作结果输出框中，Ansible 的彩色输出以原始 ANSI 转义序列（如 `[0;32m`、`[0;31m`）展示，干扰阅读且丢失了颜色信息。用户需要直观的颜色高亮来快速区分成功/失败/警告信息。

## What Changes

- 引入一个 `ansiToHtml` 工具函数，将 ANSI 转义码转换为 HTML `<span style="color:...">` 标签
- `NodeExecutionResultDrawer.vue` 的日志展示区域从纯文本 `{{ line }}` 改为 `v-html` 渲染
- `useClusterNodes.ts` 中 `addLog` 和 `extractKeyInfo` 传出的日志文本在显示时带颜色
- 颜色方案映射 Ansible 的默认配色（绿=ok, 红=fatal, 蓝=play, 青=task, 黄=warning, 紫=skipped）

## Capabilities

### New Capabilities
- `ansi-color-render`: 在节点操作结果输出框中渲染 ANSI 颜色代码，使日志展示带颜色标记

### Modified Capabilities

- `node-action-result-display`: 展示方式从纯文本改为支持颜色渲染
- `node-action-progress-dialog`: 进度对话框的日志展示同步支持颜色（通过共享的显示组件）

## Impact

- 前端新增一个工具函数 `ansiToHtml`（放在 `src/utils/` 或现有 composable 中）
- `NodeExecutionResultDrawer.vue` 增加 `v-html` 渲染路径，需注意 XSS 防护（先 HTML 转义再替换颜色码）
- 无后端改动，无 API 变更

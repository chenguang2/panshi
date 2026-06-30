## Context

工具箱已有 Lua 互转、URL 编解码、JSON 格式化、SM4 加解密、Base64 编解码、YAML 格式化六个工具。版本管理（VersionManagementModal.vue）中已有成熟的 JSON diff 逻辑（computeDiff + renderDiffTree），直接提取复用。

## Decisions

### Decision 1: 提取 diff 函数到独立工具模块
将 VersionManagementModal.vue 中的 computeDiff、renderDiffTree、escapeHtml、formatValue、sortValue 提取到 frontend/src/utils/tools/diff.ts。
- computeDiff：递归对比两个 JSON 对象，返回 DiffResult 树
- renderDiffTree：将 DiffResult 渲染为彩色 HTML 字符串（树形缩进）
- escapeHtml / formatValue / sortValue：辅助函数

### Decision 2: UI 布局
- 上方：双栏输入（左侧 JSON A，右侧 JSON B），各带独立的复制/粘贴按钮
- 中间：「对比」按钮
- 下方：差异树展示区，使用 v-html 渲染
- 支持 JSON 解析失败的错误提示

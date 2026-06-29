## 1. 工具函数

- [x] 1.1 创建 `src/utils/ansi.ts`，实现 `ansiToHtml(text)` 函数：HTML 转义 → ANSI 正则匹配 → 替换为 `<span style="color:...">`
- [x] 1.2 定义 ANSI 颜色映射表：覆盖 Ansible 使用的 6 种颜色（绿/红/蓝/青/黄/紫）+ 重置

## 2. 组件改造

- [x] 2.1 `NodeExecutionResultDrawer.vue`：summary tab 的 log-box 行渲染改为 `v-html="ansiToHtml(line)"`
- [x] 2.2 `NodeExecutionResultDrawer.vue`：stdout tab 的 `<pre>` 块改为 `v-html="ansiToHtml(logs.join('\n'))"`
- [x] 2.3 复制日志（`copyAll`）保留纯文本格式，不包含 HTML 标签
- [x] 2.4 确保 stderr tab 和 command tab 保持纯文本（ANSI 码少，不需要颜色渲染）
- [x] 2.5 `useClusterNodes.ts` `extractKeyInfo` 中调用 `stripAnsi` 去除 ANSI 码以保持关键信息干净

## 3. 集成与验证

- [x] 3.1 验证 `v-html` 渲染效果：确保颜色正确显示且 XSS 安全
- [x] 3.2 验证复制日志功能：复制结果不含 HTML 标签
- [x] 3.3 LSP diagnostics 无错误 + 构建通过

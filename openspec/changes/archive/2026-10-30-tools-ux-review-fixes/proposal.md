# tools-ux-review-fixes 提案

> 2026-10-30 工具箱模块 UX 评审（同审计日志/用户管理流程：真实代码 + 真实页面 Playwright 探测为据）

## 背景与问题

工具箱（`/tools`，`Tools.vue` 611 行）提供 7 个纯前端工具：Lua 互转 / URL / JSON / SM4 / Base64 / YAML / JSON 对比。评审发现 **P1 功能缺陷 2 项、P2 可用性 4 项、P3 观感/文案 4 项**，全部经真实页面探测或代码行号证实（详见 design.md）。

最严重两项：
1. **复制/粘贴按钮在 http 内网环境全部失效**——`navigator.clipboard` 仅 secure context（https/localhost）可用，平台内网经 `http://<ip>:12345` 访问 → 全部 28 个复制/粘贴按钮点了只报「复制失败」，错误文案不解释原因、无替代方案（Playwright 实测 `COPY_HTTP_TOAST: ["复制失败","复制失败"]`）
2. **YAML 面板输入框旁「复制」按钮复制错对象**——复制的是 `yamlOutput` 而非 `yamlInput`（Tools.vue:176，复制/粘贴语义颠倒）

另有 spec 漂移：布局 requirement 写「6 个工具」，代码实际 7 个；JSON 对比工具完全无 spec 条目。

## 改造清单（三批）

### 批 1 — 功能缺陷（P1）
1. 剪贴板 fallback：`navigator.clipboard` 不可用时回退 `textarea + document.execCommand('copy')`（http 内网可用）；粘贴回退聚焦 textarea 让用户 Ctrl+V 并明示原因；错误文案补因（「当前页面非 HTTPS，浏览器限制剪贴板 API，已用兼容方式复制」类）
2. YAML 复制对象 bug 修复（yamlInput）；全页面各面板复制按钮语义钉死：输入框旁复制输入、输出框旁复制输出

### 批 2 — 可用性（P2）
3. 左侧图标栏加文字标签（图标+短名，sider 56px→~120px），当前项高亮不变
4. 工具深链：`activeTool` 同步 `?tool=<key>` query（replaceState 不刷页面）；进页读 query 恢复、非法值回退 lua；切换更新（浏览器返回可用）
5. SM4 短密钥警告：非 16 字节时结果框顶部黄条提示「密钥非 16 字节，已自动补齐/截断——与 Edge 通道真实加解密行为可能不一致」（不阻断，往返仍一致）
6. 各工具「清空」按钮（一键清当前工具输入+输出）；Lua 面板按钮文案改「转换为字符串 →」/「→ 转换为函数」并补一行用途说明

### 批 3 — 文案与观感（P3）
7. JSON/YAML/Base64/URL 错误文案补中文指引（如 JSON 失败附「请检查引号/逗号/括号是否配对」；Base64 失败附「常见原因：含空格或非 Base64 字符」）；保留原始 detail（V8 message 的 position 信息有价值）
8. SM4「恢复默认」按钮补 tooltip（「恢复为 Edge 通道默认 SM4 密钥，用于调试平台↔Edge 加密链路」）
9. diff 面板「格式化 ↘」改「两边格式化」；差异统计行样式与主 UI 一致
10. 工具头部补一行用途说明（Lua/YAML 已有 hint 的保持，其余补齐）

## spec 变更摘要

- **MODIFIED**：工具箱页面布局（6→7 工具、图标栏加文字）、JSON 格式化与压缩（错误场景中文指引）、SM4 加解密（短密钥警告 + 恢复默认语义）、Lua 函数转配置字符串（按钮文案）、YAML 格式化工具（无场景增删，仅复制粘贴场景补输入侧语义→交由 ADDED requirement 承载，本条不改）——最终 MODIFIED：布局/JSON/SM4/Lua 四条
- **ADDED**：剪贴板兼容性与回退（http 环境）/ 面板复制按钮语义 / 工具深链（?tool=）/ JSON 数据对比（补录漂移）
- **REMOVED**：无

## 待决项（推荐 A）

1. **剪贴板方案**：A execCommand 回退（http 可用，推荐）／B 仅改文案说明限制
2. **SM4 短密钥**：A 黄条警告不阻断（推荐，往返一致仅提示与通道行为差异）／B 硬校验阻断
3. **图标栏**：A 图标+文字（推荐，辨识度优先）／B 保持纯图标
4. **深链**：A 加 ?tool= query（推荐）／B 不做

## 影响

- 前端单文件为主（Tools.vue + utils/tools/*.ts 错误文案），测试 Tools 组件测试新增 + dev-tools spec delta
- 无后端改动；无数据/权限影响

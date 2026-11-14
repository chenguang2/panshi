# Tasks

## 1. 兜底（B）：横向滚动 + 关键列固定

- [x] 1.1 `NodeList.vue` 表格加 `:scroll="{ x: 'max-content' }"` 与 `tableLayout: 'fixed'`，`#`/IP 列 `fixed: 'left'`、操作列 `fixed: 'right'`，全部列补默认 px 宽（D3 档）。验证：NodeList 组件测试断言列宽/固定标记存在 + `npx vue-tsc -b` 零错误。

## 2. 拖拽调宽（A）：composable 扩展与交互

- [x] 2.1 扩展 `useColumnConfig`：`columnWidths` / `setColumnWidth(key, px)` / `resetWidths()`，与既有个性化同 key 持久化（旧存储缺 widths 字段按默认档兼容）。验证：useColumnConfig 单测（set/persist/reset/旧数据兼容）全绿。
- [x] 2.2 `NodeList.vue` 接入：表头右缘拖拽柄（`#headerCell` 插槽，`#` 列不渲染），mousedown/mousemove/mouseup 实时调宽 + 最小 80px clamp + 松开持久化；处理器提取为 script 函数（#25）。验证：NodeList 组件测试——模拟 mousedown/mousemove 后列宽变化、持久化调用、`#` 列无拖拽柄。
- [x] 2.3 `ColumnConfigPopover` 加「重置列宽」入口。验证：popover 组件测试（入口渲染 + 触发 resetWidths）。

## 3. 回归与真机验收

- [x] 3.1 `npx vue-tsc -b` 零错误 + 全量 `npx vitest run --maxWorkers=4` 无新增失败。验证：两命令输出。
- [x] 3.2 Playwright 真机验收（复用常驻服务）：窄视口出现横向滚动且 IP/操作固定；拖拽「Edge 安装路径」表头右缘列宽实时变化；刷新后宽度保持；popover「重置列宽」恢复默认。截图留档。验证：脚本断言全 PASS + 截图。

## 4. 列顺序（用户评审追加：方案 A 表头拖拽）

- [x] 4.1 useColumnConfig 扩展 `columnOrder` / `setColumnOrder`（存储清洗：未知 key 剔除、缺失 key 按默认序补位）。验证：单测（持久化/重载/清洗/补位）先红后绿。
- [x] 4.2 NodeList 接入拖拽移动：标题区 mousedown 启动（`#`/IP/操作豁免）、document mousemove 按中间列边界显示 `.drop-before` 指示线、mouseup 提交新顺序并持久化；`customHeaderCell` 注入 `data-col`。验证：组件测试——模拟拖拽后列顺序变化、固定列豁免、指示线出现、持久化落盘；`vue-tsc -b` 零错误。
- [x] 4.3 全量回归 + 真机验收：真实鼠标拖拽「Edge 安装路径」到「状态」前，顺序生效、刷新保持；截图留档。验证：脚本断言全 PASS + 截图。

## Workflow follow-up

- 用户确认后归档变更，`table-column-resize` 合入主 spec，`openspec validate --all` 收口。
- 路由/上游列表接入复用（另行立项，不在本变更）。

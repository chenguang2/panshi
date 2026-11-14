# Tasks

## 1. 抽取共享 composable（NodeList 行为零变化）

- [ ] 1.1 新建 `composables/useColumnDragColumns.ts`：自 NodeList 抽出调宽/移动/FLIP/光标逻辑（入参：列键序只读源、宽度与顺序读写器、例外键集合、表头选择器；返回 wrap 类绑定、拖拽处理器、dragSourceKey）。验证：抽取后 NodeList 全部既有用例（66）原样通过 + `vue-tsc -b` 零错误。

## 2. 上游列表接入

- [ ] 2.1 `UpstreamList.vue`：个性化存储 key `upstream_standalone`；`#`/名称 fixed left、操作 fixed right；全列默认宽；scroll + tableLayout；接入 composable；页头「重置列宽」按钮；竖线共享类。验证：UpstreamList 组件测试（调宽/移动/固定列/竖线类/重置）先红后绿。

## 3. 路由列表接入

- [ ] 3.1 `RouteList.vue`：同 2.1（key `route_standalone`；默认档按路由列内容定档）；**sorter 手势冲突**：拖拽位移后在 click capture 拦截一次误排序点击。验证：RouteList 组件测试——拖拽移动后顺序生效且排序状态未变（先红后绿）。

## 4. 竖线共享单点

- [ ] 4.1 节点页竖线规则上移全局样式（`.grid-table` 类），三页挂同一类，NodeList 原 scoped 规则删除。验证：三页表格根元素均含该类（组件测试）+ 视觉截图。

## 5. 回归与真机验收

- [ ] 5.1 `npx vue-tsc -b` 零错误 + 全量 `npx vitest run --maxWorkers=4` 无新增失败。验证：两命令输出。
- [ ] 5.2 Playwright 真机验收扩展上游/路由段：窄视口滚动+固定列、拖宽持久化、拖拽移动（路由含排序不触发断言）、重置列宽。截图留档。验证：脚本断言全 PASS。

## Workflow follow-up

- 用户确认后归档合入主 spec，`openspec validate --all` 收口并推送。
- 集群 Tab 子表接入另行立项。

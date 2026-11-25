# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `pageHeaderActions.source.test.ts` PAGES 清单加 `['EdgeClient.vue', 'edge-client.html']`，运行确认：徽标一致性断言转红（设计有 `.ph-inline` / 实现无 `PageStatBadges`）、页头动作断言两侧「无动作」通过
- [x] 1.2 `mockupParity.source.test.ts` 增 edge-client 段红线（资源表必须 `grid-table` / 必含 `ec-tabs` 且禁 `a-tabs` 回流 / 必含 `ec-warn` 且该横幅禁 `a-alert` 回流 / 必含 `PageStatBadges`），确认对现状 RED

## 2. 页头与调试横幅（GREEN-1）

- [x] 2.1 页头接入 `PageStatBadges`（单枚「8 类资源」accent 静态事实），验证 1.1 徽标断言转绿
- [x] 2.2 `a-alert` 调试横幅 → 自绘 `ec-warn`（token 警示 + 可关闭 `dismissed` ref）；弹窗内 `.debug-note` 样式 token 对齐（文案不动）；验证 1.2 横幅红线转绿

## 3. 连接条（GREEN-2）

- [x] 3.1 `.edge-filter-bar` → `l5-card` + `l5-toolbar`（模式 130 / 集群 120 / 节点 220，form-input→l5-select）；查询按钮内联 svg 放大镜替换 SearchOutlined、取消查询改 tool-btn（禁用态保留）；「已连接」改 pill-run 胶囊 + mono 地址；ip-hint 加虚线下划线弱化类（`data-test="ip-hint"` 保留）

## 4. 资源卡 tab 条与 8 张表格（GREEN-3）

- [x] 4.1 `a-tabs`/8 个 `a-tab-pane` → 自绘 `ec-tabs` tab 条（活动 accent 底线 + 条目计数角标）+ 8 个 `v-show` 内容区（`activeTab` 语义不变）；`.table-toolbar` → `ec-tabbar`（添加按钮去 PlusOutlined、SearchInput 240→150）
- [x] 4.2 8 张 a-table 挂 `grid-table` + `:table-layout="'fixed'"`；ID 列 cell 改 `c-mono c-dim` + title 全文；操作列 ghost → op 图标族（JSON/编辑/删除红，8 处）
- [x] 4.3 既有 EdgeClient 测试按断言反转清单更新（tab 切换/操作列选择器），验证 1.2 全部转绿

## 5. 回归收口

- [x] 5.1 `npx vue-tsc -b` 通过 + EdgeClient 相关测试全绿 + 全量 `npx vitest run --maxWorkers=4`（漂移失败按 #58 隔离复跑定性）
- [x] 5.2 parity 五步法收口：双侧截图 + 连接条/tab 条/表格/弹窗逐元素量测（九维度），差异清单复核全 ✓，脚本与截图存档至本变更 verification/ 目录

## 4c. 真机缺陷修复 + 列宽拖拽接线（2026-11-25 用户实测反馈）

- [x] 4.14 Bug1：全失败分支清除 `loadedNode`/`routeInfo`（旧连接标注不再残留）+ 回归用例（成功后查失败地址标注消失）+ 全失败断言收紧（`已连接:` → `已连接`）
- [x] 4.15 Bug2：方法单元格 `.methods-tags` flex-wrap（fixed 布局下不再侵占邻列）+ 本页 td 裁剪 ellipsis
- [x] 4.16 列宽拖拽接线 ×8 表：`useColumnConfig`（键 `edge_client_<tab>`）+ `useColumnDragColumns` + `#headerCell` 把手 + 固定布局/scroll.x；连接条「重置列宽」入口（当前活动 Tab）；`columnWiring` reactive 解包
- [x] 4.17 测试随迁：中继批 describe 文件级 Pinia 兜底；守卫 ec-① 正则随类名组合更新

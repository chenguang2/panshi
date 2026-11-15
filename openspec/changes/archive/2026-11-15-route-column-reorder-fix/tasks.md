# Tasks

## 1. 共享层：顺序清洗按全量列清单 + 缺键槽位回填

- [x] 1.1 `useColumnConfig` 新增可选 `allColumns`（全量列键，默认序），`setColumnOrder` 白名单取 `allColumns ?? defaultColumns`。验证：`composables/__tests__/useColumnConfig.test.ts` 新增用例——传入 `allColumns` 后 `setColumnOrder` 保留默认隐藏列键，先红后绿；未传时行为与旧版一致。
- [x] 1.2 `resolveOrderedColumns` 缺失键处理改为槽位回填（已定位列按存储序填回各自槽位、未定位列留在设计位）。验证：新增三例——残缺顺序按设计位落座、完整顺序等价原样重排、未知/重复键剔除且槽位不错位；`useColumnDragColumns.test.ts` 全绿（手势侧零改动）。

## 2. 三张 Tab 子表接线

- [x] 2.1 `useClusterNodes.ts` / `useClusterUpstreams.ts` / `useClusterRoutes.ts` 的 `useColumnConfig` 调用补传 `allColumns`（`allNodeColumns` / `allUpstreamColumns` / `allRouteColumns` 的键集）。验证：`useClusterRoutes.test.ts` 新增「启用方法/上游后不排到操作列之后」用例先红后绿；`useClusterUpstreams.test.ts` 旧「追加末尾」断言随语义修正。
- [x] 2.2 独立列表页（NodeList / RouteList / UpstreamList）回归确认：其传入的本就是全量列，行为不变。验证：三页组件测试全绿。

## 3. 真机验收与全量回归

- [x] 3.1 真机（Playwright，连已运行实例 localhost:12345，1800×900）注入旧 bug 产物后验收：刷新即愈合（表头 `名称 URI 方法 上游 优先级 发布状态 操作`）、拖「方法」左移生效且存储写成完整 10 键、拖「优先级」右移生效、刷新后渲染与存储一致、节点页签启用「Edge 安装路径」落在「管理端口」与「状态」之间。截图 /tmp/opencode/fix-1-healed.png、fix-2-drag-methods.png、fix-3-route-reloaded.png、fix-4-node-edgepath.png。
- [x] 3.2 `npx vitest run --maxWorkers=4` 205 文件 / 2836 用例全绿；`npx vue-tsc -b` exit 0。
- [x] 3.3 AGENTS.md 约定 #79 补记该教训（清洗集合与缺键落位两处错误、槽位回填修法、操作列为右锚点的设计边界）。

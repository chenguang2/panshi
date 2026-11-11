# Tasks

## 1. 前置：断言反转清单与基线（#217/#208）

- [ ] 1.1 盘点消费方与既有断言，产出 `assertion-inventory.md`（本变更目录）：grep `frontend/src`（`__tests__`、`*.test.ts`、`*.spec.ts`）中所有断言集群下拉/`clusterFilter`/`filteredClusters`/`ASelectOptGroup`/原生 select setValue 的用例，另盘点 `frontend/e2e/` 操作集群筛选的用例；逐条列出「用例 → 现断言 → 反转后断言」。验证：清单覆盖 12 资源页 + EdgeEnv + 相关弹窗/扁平页的测试文件，无一遗漏。
- [ ] 1.2 记录全量单测基线：`cd frontend && npx vitest run --no-file-parallelism`（#208 串行跑法），把用例总数/通过数记入 assertion-inventory.md。验证：基线为全绿，否则先修复再进入批 1。

## 2. 批 1：ClusterSelect 组件 + 12 资源页筛选条

- [x] 2.1 TDD 红：新建 `frontend/src/components/__tests__/ClusterSelect.test.ts`，用例覆盖：① optGroup 分组展示（具名分组按名排序、未分组「未分组」header 兜底末尾）；② 搜索按 display_name/name 大小写不敏感过滤、空组隐藏；③ allow-all 模式首选项「全部集群」value `''` 且选中后正确回显该 label；④ 必选模式无全部项、不可清空、placeholder「请选择集群」；⑤ 注入 clusters 变化选项跟随（不发请求）；⑥ 选项 label `display_name || name`。运行 `cd frontend && npx vitest run src/components/__tests__/ClusterSelect.test.ts` 确认失败（组件不存在）。
- [x] 2.2 实现 `frontend/src/components/ClusterSelect.vue`：a-select + show-search + filterOption + a-select-opt-group；props `clusters` / `modelValue` / `allowAll`（默认 false）/ `placeholder`（默认「请选择集群」）；emit `update:modelValue`；组件内零请求。验证：2.1 用例全绿（GREEN）。
- [x] 2.3 12 资源页筛选条换装（NodeList/RouteList/UpstreamList/StreamProxyList/DnsUdpProxyList/StaticResourceList/PluginMetadataList/GlobalRuleList/PluginConfigList/DnsQueryList/ServerCertList/CaCertList）：模板中集群原生 select 替换为 `<ClusterSelect v-model="clusterFilter" :clusters="filteredClusters" allow-all />`；`useStreamProxyList` 两页只改模板、composable 状态机不动；多语句模板属性提取为函数（#25）；各页 `loadClusters`/组下拉/级联清空逻辑零改动。验证：`npx vue-tsc -b` 零错误（#27）。
- [x] 2.4 按 1.1 清单逐条落地消费方测试反转（native setValue → stub 断言 props/事件，a-select stub 参照 EdgeEnv.test.ts 先例）。验证：反转清单内每个测试文件单跑绿。
- [x] 2.5 e2e 适配：grep `frontend/e2e/` 中操作集群筛选的用例，涉及的改为 antd 下拉交互（点击展开 → 点选项）。验证：`cd frontend && npx playwright test <涉及 spec>` 绿。
- [x] 2.6 批 1 全量收口：`cd frontend && npx vitest run --no-file-parallelism` 全绿（对比 1.2 基线无新增失败）；git 提交（独立可回滚）。

## 3. 批 2：EdgeEnv 必选模式 + 表单/内联弹窗

- [x] 3.1 EdgeEnv 换装 ClusterSelect（`allowAll=false`），行为等价迁移：分组展示/搜索/深链 `?cluster_id=` 回显/切组确认流不变；删除页内 `clusterGroups`/`filterClusterOption` 内联实现。验证：EdgeEnv.test.ts 更新绿 + 手动访问 `/edge-env?cluster_id=<id>` 回显正确。
- [x] 3.2 表单弹窗换装（必选模式）：RouteFormModal、UpstreamFormModal、DnsQueryFormModal、PluginEntityFormModal、SslFormDrawer、SslGenerateDialog、CaCreateDialog、StreamProxyFormWizard、ClusterBackupDialog。验证：各弹窗既有测试更新绿（含 #56 占位匹配类用例按 a-select placeholder 语义反转）。
- [x] 3.3 内联弹窗换装：PluginMetadataList 添加插件弹窗、NodeList 添加/编辑节点弹窗与批量导入弹窗。验证：对应测试绿。
- [x] 3.4 批 2 全量收口：`npx vitest run --no-file-parallelism` 全绿；git 提交。（2026-11-11 终轮 2653/2654，唯一失败 CentralList.test.ts 隔离复跑 21/21 绿 → #58/#208 波动家族，判定通过；DnsQueryFormModal 4 例已按组件契约反转（fillCluster helper）。）

## 4. 批 3：扁平筛选页

- [x] 4.1 NodeTaskCenter：筛选条集群下拉与创建任务弹窗集群选择换装（弹窗从原生 disabled 占位迁移为 a-select placeholder 语义）。验证：对应测试绿；筛选条选中后任务过滤正常。（筛选条 allow-all、弹窗必选；0=未选在字段层表达，`onCreateClusterFieldChange` 收 emit 后转 number/null）
- [x] 4.2 EdgeClient、EdgeImport、EdgeAutostart 集群下拉换装（必选/筛选模式按各页现状语义）。验证：对应测试绿。（三页均必选/带「全部集群」筛选语义迁移完成；EdgeAutostart 测试无集群下拉直引，换装后零改动即绿）
- [x] 4.3 批 3 全量收口 + 手动链路抽查（复用常驻服务，不自行启停；#8）：连 `http://localhost:12345` 抽查节点管理、四层代理、edge.env 三页——组级联、搜索、「全部集群」、切组清空各一遍。验证：抽查记录写入本变更目录 acceptance-notes.md；vitest 全量绿；git 提交。（抽查记录见 acceptance-notes.md；全量 2653/2654，唯一失败 RelayGateways.test.ts 隔离复跑 63/63 绿 → #58/#208 波动）

## 5. 收口

- [ ] 5.1 `openspec validate --all` 0 error；如需改侧边栏/权限外文档同步（本变更预期无）。
- [ ] 5.2 交付用户界面验收：按 acceptance-notes.md 清单逐页演示（12 页筛选条、EdgeEnv、代表弹窗 1 个、NodeTaskCenter）。

## Workflow follow-up

- 用户验收通过后归档变更（`openspec archive`），按 #53 以主 spec 现文合并 delta 并复跑 `openspec validate --all`。
- 可选后续批（未在本变更范围）：Metrics 两页集群下拉接 ClusterSelect（哨兵值 + URL 同步状态机需单独设计）。

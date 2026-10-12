# Tasks: node-management-ux-batch3

## 1. 共享层收敛（前置）

- [x] 1.1 RED：`utils/nodeInstallCommand.ts` 提取 `buildNodeInstallCommand` 纯函数（以 NodeList :855 相对路径形态为唯一实现）+ 单测 → GREEN：NodeList/ClusterNodes 两视图引用；Tab 命令预览回归相对路径形态（硬编码 `/home/qcg/panshi/...` 清零，源码守卫钉住）
- [x] 1.2 RED：`createCancelNodeInstallHandler(deps)` 共享工厂（以两份现文为基线，行为差异以更完备方为准并逐条记录偏差）+ 单测 → GREEN：两视图工厂实例化替换本地实现（差异裁决记录于工厂注释）
- [x] 1.3 RED：`showDangerConfirm` 上移 `useOverlayModal.ts` 具名导出 + 单测 → GREEN：NodeList 本地包装迁走改引用（先于 1.2 实施——D2 的确认机制依赖 D3 产物）
- [x] 1.4 RED：批量核心参数化（`useBatchNodeAction.ts`：进度状态工厂 + `runBatchNodeAction`/`runBatchNodeStatus` 并发引擎 + `runClusterGroupedBatchAction` 集群分组执行）+ 单测 → GREEN：Tab `batchNodeAction`/`batchNodeStatus` 变薄适配（选中清理+委托+重载），**Tab 既有批量用例全绿回归**（并发上限/clamp/失败隔离/空选警告/状态表格）

## 2. NodeList 批量操作（跨集群）

- [x] 2.1 RED：a-table 行选择 + 工具栏批量钮（启动/停止/reload/状态查询，未勾选禁用）→ GREEN
- [x] 2.2 RED：双路径执行——启动/停止/reload 按 `cluster_id` 分组、逐集群调用批量端点（items 合并进共享进度弹窗）；批量状态查询逐节点 statistic（与 Tab `batchNodeStatus` 同款，断言不出现批量端点调用）→ GREEN
- [x] 2.3 RED：提交前 `showDangerConfirm` 确认（全动作危险红）+ 完成后按集群汇总（集群级调用失败不中断整体、该集群记「集群级失败（原因）」，失败明细进进度日志）→ GREEN

## 3. NodeList 复制与批量导入

- [x] 3.1 RED：「更多」菜单加「复制」→ 打开本页添加弹窗预填行配置（IP 清空待填；打开时清空校验残留 formErrors）→ GREEN（菜单序：详情/编辑/复制/删除/对比）
- [x] 3.2 RED：批量导入弹窗（集群下拉占位 `value=""` ↔ 模型 `''`，未选禁提交；粘贴/CSV 上传双 tab + CSV 模板下载，`parseIpList`/`parseNodeCsv`/`buildNodeCsvTemplate` 同一 utils；提交走共享 `submitNodeBatchImport` → 刷新清选区）→ GREEN

## 4. NodeList 列配置

- [x] 4.1 RED：`useColumnConfig` 本页实例（独立 storage key：列显隐/动作钮选择/搜索框开关）+ 与 Tab 同款 popover；动作钮集采用共享 `allNodeActionButtons`（「✓ 状态」→「状态查询」词汇统一，✓/ⓘ emoji 清零）→ GREEN

## 5. Tab 确认弹窗迁移（#25 收口）

- [x] 5.1 RED：ClusterNodes 全部动作确认（:726-771 调用点）走 `showDangerConfirm` → GREEN；删除 `confirmState`/`showConfirm`/`executeConfirm`（:682-693）与手写确认模板（:461-473），源码守卫钉住不再回潮

## 6. 验证

- [x] 6.1 `npx vue-tsc -b` 零错误；vitest 全量（并行失败按 #196 协议串行复跑判定）；Tab 批量/节点域既有用例全绿
- [x] 6.2 实页验收：NodeList 批量跨集群（分组执行+进度弹窗+汇总）、复制预填、批量导入全流程、列配置持久化、Tab 确认弹窗形态与 loading、Tab 命令预览无硬编码路径；截图留人工复核（2026-10-12 实页 9/9 PASS；验收揪出并已修 2 缺陷：批量导入文本路径丢弃 parse 层 valid/error〔submitNodeBatchImport 会把非法 IP 真正提交〕、工具栏「状态查询」前缀与兄弟钮不一致→「批量状态查询」；Tab 行级状态查询无确认直达抽屉为单/批同钮设计，非缺陷）；**第二轮实页验收（2026-10-12 复验，Playwright 直连 12345，14/14 PASS）**：复验全部通过并新增修复第三缺陷——动作钮默认全选 7 钮时「复制/编辑/删除/数据库对比」既不在行内（行内只渲染 start/stop/status）也不在更多菜单（更多只显示未勾选钮），D6 要求的更多菜单「复制」默认不可达；修复为默认动作集=三钮 + popover 勾选组只列行内可调三钮 + 编辑/复制/删除/对比恒驻更多（RED→GREEN，NodeList.test.ts 57/57）

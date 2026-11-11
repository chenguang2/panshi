# 断言反转清单（任务 1.1 · #217）

> 基线：任务 1.2 全量 `npx vitest run --no-file-parallelism` 结果见文末。
> 原则：组筛选下拉、级联清空、`''`=全部集群 值契约、`loadClusters` 数据路径全部不变 → 相关断言尽量保留；仅「定位原生 select + option 文本/setValue」类断言需要反转为「定位 ClusterSelect 组件 + props/emit 断言」。

## 批 1：12 资源页筛选条

> **实施注记（2026-11-11）**：顺序断言「组下拉在集群下拉前」实际收敛在共享套件 `helpers/groupFilterSuite.ts`（8 个页测试文件复用）——已在该套件单点反转（`.cluster-select` 根类 + compareDocumentPosition），8 页同时修复。选择模拟统一为对 `findComponent(ClusterSelect)` 依序 emit `update:modelValue` → `change`（值先于事件，组件契约）；选项集断言用原生 `querySelectorAll('a-select-option')`（未解析标签以原生元素落 DOM）。**collation 注记**：排序跟随默认 locale（en-US/ICU 下「乙」先于「甲」、「测」先于「生」），RouteList 授权收敛用例断言已按实际 collation 钉死。

| # | 文件:行 | 现断言 | 反转后断言 | 状态 |
|---|---|---|---|---|
| 1 | NodeList.test.ts:134-138 | `findAll('select')` 找含「全部集群」的 select；options 文本精确列表 | `.cluster-select` 存在 + 文本含「全部集群/生产集群/预发集群/开发集群」 | ✅ 已反转 |
| 2 | groupFilterSuite.ts:28-39（NodeList:190 内联副本同步） | 双原生 select 索引 groupIdx < clusterIdx | 组原生 select 在 `.cluster-select` 之前（compareDocumentPosition） | ✅ 已反转 |
| 3 | StreamProxyList.test.ts:189-205 | 原生 select 赋值 + dispatch change | findComponent(ClusterSelect) 依序 emit `update:modelValue`/`change` `'1'`；请求参数断言原样保留 | ✅ 已反转 |
| 4 | RouteList.test.ts:339-356 | setValue('1')/setValue('') | emit 数字 1 / 空串（对齐真实组件 emit number 契约）；params 断言原样保留 | ✅ 已反转 |
| 5 | RouteList.test.ts:775-790 | options 文本+value 精确列表 | 原生查询 `a-select-option`：标签与 value（['','9','5']，collation 序）精确列表 | ✅ 已反转 |
| 6 | UpstreamList.test.ts:434 | `vm.clusterFilter` 为 `''` | **无需反转**（值契约不变），保留 | ✅ 核验 |
| 7 | PluginConfigList.publishState.test.ts:180 | `vm.clusterFilter = 1` 赋值 | **无需反转**，保留 | ✅ 核验 |
| 8 | 组下拉类断言（GlobalRuleList/StaticResourceList/PluginMetadataList/PluginConfigList/NodeList 组断言） | 组原生 select setValue/option 文本 | **无需反转**（组下拉不动），保留 | ✅ 核验 |

## 批 2：EdgeEnv + 表单/内联弹窗

| # | 文件:行 | 现断言 | 反转后断言 |
|---|---|---|---|
| 9 | EdgeEnv.test.ts:62+ | `ASelectOptGroup` stub + 分组断言（线上/预发 + 未分组兜底） | EdgeEnv 换装后分组逻辑移入 ClusterSelect；页面级断言改为「ClusterSelect 注入 clusters」+ 深链回显 vm 状态；分组结构断言由 ClusterSelect.test.ts 承担 |
| 10 | StaticResourceList.test.ts:369-375 | 添加静态资源 overlay 内 `selects[0].setValue(1)` + 路由下拉重置守卫（selectedIndex=0、占位「请选择路由」） | overlay 集群控件改 emit `'1'`；路由重置守卫断言原样保留 |
| 11 | PluginMetadataList.test.ts:160 | overlay `findAll('select')`（添加插件弹窗集群下拉，含 #56 占位 selectedIndex===0 用例） | 改 a-select placeholder 语义：vm 空串 + placeholder「请选择集群」+ allowAll=false |
| 12 | NodeList.test.ts:1290（批量导入弹窗 #204 守卫） | 占位 option `value=''` + `selectedIndex===0` + `vm.importClusterId===''` | a-select 等价守卫：`vm.importClusterId===''` + placeholder 文案 + 无「全部集群」项 |
| 13 | NodeList 添加/编辑节点弹窗「所属集群」（~L211-219） | 批 2 实施时逐条补录 | 同 #12 模式 |
| 14 | 表单弹窗组件测试 9 个（RouteFormModal/UpstreamFormModal/DnsQueryFormModal/PluginEntityFormModal/SslFormDrawer/SslGenerateDialog/CaCreateDialog/StreamProxyFormWizard/ClusterBackupDialog） | 批 2 实施时逐个 grep `select` 补录 | 同 #12 模式（必选模式） |

## 批 3：扁平筛选页

| # | 文件:行 | 现断言 | 反转后断言 |
|---|---|---|---|
| 15 | NodeTaskCenter.test.ts:1745 | clusterSel options `['全部集群','生产集群','预发集群']` | 同 #1 模式 |
| 16 | NodeTaskCenter.test.ts:2068/2073 | 「请选择集群」错误文案 | 页面校验文案（非控件），预计无需反转；实施时确认 |
| 17 | e2e/edge-client.spec.ts:34 | `clusterSelect.selectOption({label})` | antd 下拉交互（点开 → 点选项）；nodeSelect（L54）不动 |
| 18 | EdgeImport.test.ts / EdgeAutostart*.test.ts | 批 3 实施时逐个 grep 补录 | 届时按 #1/#12 模式 |

## 范围外（本变更不动）

- Metrics.test.ts / MetricsDashboard.test.ts（哨兵值页，范围外）
- UserList / RelayGateways / CentralList / ClusterListPage（范围外）
- useStreamProxyList.test.ts（composable 状态机不动，无 select 断言，已确认）

## 任务 1.2 基线

- 2026-11-11 14:56 全量 `npx vitest run --no-file-parallelism`：188 文件 / 2645 用例，2644 passed / **1 failed**。
- 失败项 `DbBackupCard.ux.test.ts:867`（期望 `mockGetHistory` 最近调用 `(2,20)` 实得 `(1,20)`）**与本变更无关**：隔离复跑 44/44 全绿，判定为时序波动（防抖链路在满负载下两次 flushPromises 未走完，#208 同型）。
- 结论：基线有效；批 1 收口（任务 2.6）时复跑全量，若该用例再红以隔离复跑判定。

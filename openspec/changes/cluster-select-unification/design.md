# Design

## Context

现状实现盘点（2026-11-11，只读调查）：

- 唯一的分组展示先例：`views/EdgeEnv.vue`（a-select + opt-group，`clusterGroups` computed 具名分组排序 + 未分组兜底末尾，`filterClusterOption` 按 display_name/name 匹配，`PAGE_SIZE_DROPDOWN=500` 拉取集群，`?cluster_id=` 深链回显）。组件测试 `views/__tests__/EdgeEnv.test.ts` 已有 stub `ASelectOptGroup` 的先例。
- 12 个资源页（NodeList/RouteList/UpstreamList/StreamProxyList/DnsUdpProxyList/StaticResourceList/PluginMetadataList/GlobalRuleList/PluginConfigList/DnsQueryList/ServerCertList/CaCertList）筛选条为原生 `<select>` 双下拉：`groupFilter`（`__all__`/组名/`__ung__`）→ `filteredClusters` → `clusterFilter`（`''`=全部集群）；仅 StreamProxy/DnsUdpProxy 两页共享 `composables/useStreamProxyList.ts`，其余 10 页内联复制同构三件套。全部无搜索。
- 分组是 `ps_cluster.group_name` 字符串属性（非实体），组选项全部前端派生；8 个全局列表端点支持服务端 `group_name` 过滤（`group-name-api-filter` 规格）。
- 扁平集群下拉：NodeTaskCenter 筛选条与创建弹窗、EdgeClient、EdgeImport、EdgeAutostart、约 10 个表单/内联弹窗（多数经 props 注入 clusters）。

约束：`.vue` 模板内多语句属性会被 prettier 重排（约定 #25，handler 须提取为函数）；无分号、ESLint flat config；共享组件语义变更须先产出断言反转清单再全量单测收口（#217/#208）。

## Goals / Non-Goals

**Goals:**

- 一个共享 `ClusterSelect` 组件承载全站集群选择交互，12 页筛选条、EdgeEnv、扁平筛选页与表单弹窗全部换用。
- 保留既有全部过滤语义：组筛选下拉、级联清空、服务端 `group_name` 过滤、`''`=全部集群、深链回显。
- 消灭 10 处内联复制的集群下拉实现。

**Non-Goals:**

- 不改 UserList 多选 picker、ClusterList/CentralList 卡片浏览、RelayGateways 挂接集群（数据源不同）。
- Metrics 两页（哨兵值 + URL 同步状态机 `useMetricsFilter`）本变更不动，列为可选后续批。
- 不做分组名搜索（搜索只匹配集群 display_name/name）。
- 不改各页组筛选下拉/状态下拉等其余原生控件（避免批量视觉变更扩大化）。
- 无后端改动。

## Decisions

1. **控件基座选 a-select（AntDV）而非增强原生 select**——搜索与 optGroup 是本次统一的核心收益，原生 select 无法支持；EdgeEnv/UserList 已有 a-select 先例，主题系统（theme-system）下样式随 antd token。备选「原生 select + 自绘过滤」否决（重复造轮子、无分组能力）。
2. **组件不发请求，clusters 由消费方注入**——各页已有自己的 `loadClusters`（数据源略有差异：`/clusters` vs `/clusters/my` vs `listClusters()`），保持数据加载单路径归属页面；组件纯展示+选择。备选「组件内自取」否决（会引入第二套数据源语义）。
3. **「全部集群」用显式首选项（value `''`）而非 allow-clear + placeholder**——保持既有值契约 `'' = 全部集群` 不变，各页 `clusterFilter` 状态与请求组装逻辑零改动；allow-clear 有误清风险且需逐页映射 undefined↔''。必选模式（EdgeEnv、表单必填字段）则无全部项、不可清空，placeholder「请选择集群」。
4. **值类型契约**：`modelValue: number | string`（filter 页维持 string `''`/id 字符串；必选页 number）。组件不感知语义，仅透传。
5. **排序与兜底沿用 EdgeEnv 先例**：具名分组按名称排序、未分组「未分组」header 兜底末尾、组内按 display name 排序、选项 label `display_name || name`。
6. **useStreamProxyList 不动状态机，只换模板控件**——该 composable 已是两页共享的级联状态单点；换控件不动逻辑，回归面最小。
7. **筛选条内其余原生下拉不改**——本变更只统一集群控件；混排（原生 select + a-select 同条）接受轻微风格差异，高度对齐在样例页验证（均为 ~32px），如观感突兀再立项统一整条筛选条。
8. **验证顺序遵循 #217**：落地前先 grep 全域消费方与既有断言、产出断言反转清单（消费方测试中所有断言原生 select 选项/选值方式的用例），再动手；全量收口 `npx vitest run --no-file-parallelism`（#208）。

## Risks / Trade-offs

- [筛选条混排观感（原生 select 与 a-select 并存）] → 样例页先验证高度/边框对齐；必要时给 ClusterSelect 一层对齐 `.form-input` 的样式微调，不动其余控件。
- [消费方组件测试大面积依赖原生 select 交互（`find('select').setValue`）] → 断言反转清单先行；a-select 用 stub（EdgeEnv.test.ts 先例）断言 props/事件而非模拟 antd 下拉 DOM。
- [a-select `value=''` 的显示歧义（不匹配 option 时显示空白而非 placeholder）] → 显式渲染「全部集群」option（value `''`），组件单测钉死该行为。
- [12 页 × E2E 若有用例操作集群筛选] → 实施时 grep `e2e/` 对 select 的操作，涉及页补 antd 下拉交互（点击展开后点选项）。
- [批量触达 ~27 处消费点] → 分三批落地（见 tasks），每批独立可回滚（纯前端控件替换，git revert 即回滚，无数据/API 影响）。
- [vite 陈旧模块（#250）] → 验证时 touch 改动文件强刷转换缓存。

## Migration Plan

1. 批 1：组件 + 组件测试 + 12 资源页筛选条换装（核心统一）。
2. 批 2：EdgeEnv 换装（必选模式）+ 表单弹窗/内联弹窗换装。
3. 批 3：扁平筛选页（NodeTaskCenter 两处、EdgeClient、EdgeImport、EdgeAutostart）。
每批全量单测收口后独立提交；主 spec 合入（archive）在批 1 验收后执行。

## Open Questions

（无——组级过滤去留已由用户裁决：保留并升级控件。）

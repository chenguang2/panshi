# Proposal: cluster-select-unification

## Why

全站「选择/筛选集群」交互分裂成三种形态：12 个资源列表页用双下拉级联（原生 `<select>`、无搜索、其中 10 页是内联复制的同构实现），edge.env 配置页用单下拉分组展示（optGroup + 搜索），其余 10+ 处（筛选条与表单弹窗）为扁平单下拉。同一个「选集群」动作三种做法且无共享组件，既造成学习成本，也造成维护负担（改一处行为需同步多份拷贝）。集群规模上限约 18 个，「分组展示 + 搜索」的单控件形态已被 EdgeEnv 页验证可用，具备全站统一的条件。

## What Changes

- 新增共享组件 `ClusterSelect`（`frontend/src/components/ClusterSelect.vue`）：a-select + opt-group 按分组展示 + show-search + 可选「全部集群」项 + 未分组兜底；作为全站集群选择控件的唯一实现，组件自身不发请求（集群列表由消费方传入）。
- 12 个资源列表页（节点/路由/上游/四层代理/DNS 代理/静态资源/插件元数据/全局规则/插件配置/DNS 查询/服务器证书/CA 证书）筛选条中的集群下拉换用该组件；**分组筛选下拉保留**、级联清空与服务端 `group_name` 过滤语义不变（能力不回退，已确认保留）。
- EdgeEnv 页集群选择器换用该组件（必选模式：无「全部集群」项、不可清空），交互与 URL 深链行为不变。
- 表单弹窗「所属集群」字段与扁平筛选页（NodeTaskCenter 筛选条/创建任务弹窗、EdgeClient、EdgeImport、EdgeAutostart、NodeList 两个弹窗、PluginMetadataList 内联弹窗）换用该组件。
- 修正 `group-filter-on-resource-pages` 主规格中 EdgeEnv 场景与实现的历史漂移（现文仍描述 EdgeEnv 含分组筛选下拉，实际实现与 `edge-env-remote-editing` 规格均为单下拉分组、无组筛选）。
- 明确不动范围：UserList 集群权限多选 picker（多选语义）、ClusterList/CentralList 卡片浏览（浏览语义）、Metrics 两页（哨兵值 + URL 同步，列为可选后续批）、RelayGateways 挂接集群（选项来自中继拓扑，数据源不同）。

## Capabilities

### New Capabilities

- `cluster-select-component`: 全站共享集群选择控件的交互契约——分组展示、搜索、「全部集群」可选项、未分组兜底、必选/可清空两种模式、数据由消费方注入。

### Modified Capabilities

- `group-filter-on-resource-pages`: 资源页集群筛选下拉的控件形态由原生双下拉中的集群 `<select>` 变更为共享 `ClusterSelect`（分组展示 + 搜索 + 「全部集群」项）；组筛选下拉的存在性、选项值（`__all__`/组名/`__ung__`）、级联清空、服务端过滤语义全部保留；EdgeEnv 场景按现行实现修正（无组筛选下拉，集群选择器为分组 optGroup + 搜索，细节归属 `edge-env-remote-editing`）。

## Impact

- 前端消费点约 27 处：12 资源页筛选条、EdgeEnv、4 个扁平筛选页 + NodeTaskCenter 创建弹窗、约 10 个表单/内联弹窗；新增 `components/ClusterSelect.vue` 与对应组件测试。
- 无后端改动、无 API 契约变化（`group_name` 参数、`GET /clusters` 数据源不变）。
- 共享组件替换涉及既有组件测试断言反转/失效（消费方模板从原生 select 变为 a-select），需按共享组件语义变更流程先盘消费方与既有断言再落地（详见 design.md 断言清单）。
- 12 资源页中原生 select 换 a-select 有轻微视觉变化（向 EdgeEnv 现状对齐）。

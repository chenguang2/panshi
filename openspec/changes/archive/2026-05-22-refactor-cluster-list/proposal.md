## Why

`frontend/src/views/ClusterList.vue` 当前 4508 行，集成了集群、节点、上游、路由、插件配置、全局规则、静态资源共 7 个模块的全部逻辑和模板。单文件过大导致：

- 任何模块的修改都需要在同一个 4500 行文件中定位和编辑，极易引入回归
- 新人上手成本高，理解业务边界困难
- TypeScript 类型推导在大文件中表现下降，编辑器卡顿
- 无法单独测试某个资源模块的逻辑

## What Changes

**Phase 1 - Composables 抽取**：将 6 个资源模块（节点、上游、路由、插件配置、全局规则、静态资源）的 Script 逻辑从 ClusterList.vue 提取到独立 composable 文件。

**Phase 2 - 子组件拆分**：将每个 tab 下的模板拆成独立 Vue 子组件，ClusterList.vue 降级为容器组件，只负责列表展开/折叠和 tab 切换。

每个 composable 和组件文件控制在 500 行以内，职责单一。

## Capabilities

### New Capabilities
- `cluster-nodes-composable`: 集群节点相关状态与操作（加载、增删改查、发布）
- `cluster-upstreams-composable`: 上游相关状态与操作（加载、增删改查、发布、版本管理）
- `cluster-routes-composable`: 路由相关状态与操作（加载、增删改查、发布、版本管理）
- `cluster-plugin-configs-composable`: 插件配置相关状态与操作（加载、增删改查）
- `cluster-global-rules-composable`: 全局规则相关状态与操作（加载、增删改查）
- `cluster-static-resources-composable`: 静态资源相关状态与操作（加载、增删改查、上传、发布、版本管理）
- `cluster-nodes-component`: 节点 tab 子组件
- `cluster-upstreams-component`: 上游 tab 子组件
- `cluster-routes-component`: 路由 tab 子组件
- `cluster-plugin-configs-component`: 插件配置 tab 子组件
- `cluster-global-rules-component`: 全局规则 tab 子组件
- `cluster-static-resources-component`: 静态资源 tab 子组件

### Modified Capabilities
无。所有现有能力的行为不变，仅代码组织方式变化。

## Impact

- `frontend/src/views/ClusterList.vue`: 从 4508 行大幅缩减，仅保留容器逻辑
- `frontend/src/composables/`: 新增目录，6 个 composable 文件
- `frontend/src/views/clusters/`: 新增目录，6 个子组件文件
- 无 API 变更，无路由变更，无数据库变更
- 无外部依赖变更

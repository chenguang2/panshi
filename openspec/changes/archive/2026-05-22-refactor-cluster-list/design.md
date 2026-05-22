## Context

`frontend/src/views/ClusterList.vue` 是一个 4508 行的单文件组件，包含集群列表展示以及 6 个子模块（节点、上游、路由、插件配置、全局规则、静态资源）的全部逻辑和模板。随着功能持续添加，该文件已难以维护。

当前架构：
- 模板通过 `activeTab` 变量切换 6 个 tab 的内容区块（`v-if="activeTab === 'nodes'"` 等）
- Script 中所有状态（ref/computed）和操作函数平铺在 `<script setup>` 顶层，无模块划分
- 各模块间通过共享 `cluster` 对象耦合

## Goals / Non-Goals

**Goals:**
- ClusterList.vue Script 从 3143 行降至 ~500 行
- ClusterList.vue 模板从 995 行降至 ~200 行（仅容器和 tab 切换）
- 每个 composable 和子组件控制在 500 行以内
- 6 个资源模块彼此独立，可单独维护和测试
- 运行时行为零变化

**Non-Goals:**
- 不改变 UI 布局和交互逻辑
- 不改变 API 调用方式
- 不改变路由结构
- 不引入新的外部依赖
- 不涉及样式重构

## Decisions

### Decision 1: Composable 优先于 Store

**选择**：用 Vue composable（函数返回响应式状态 + 方法）而非 Pinia store 抽取逻辑。

**理由**：
- Composables 接受 `cluster` 参数，天然适合"选中某个集群后操作其资源"的场景
- 不需要全局单例，每个 ClusterList 实例独立
- Pinia store 更适合跨页面共享的状态（如 auth），而节点/上游等都是页面级
- 迁移成本低：把 `<script setup>` 中的代码块移到独立函数即可

### Decision 2: 按资源模块划分文件，不按操作类型分层

**不选**：`composables/useFetch.ts`、`composables/useDelete.ts` 这种按 CRUD 操作分。  
**选择**：`composables/useClusterNodes.ts`、`composables/useClusterUpstreams.ts` 按资源分。

**理由**：每个资源模块有自己的加载时机、发布流程、版本管理，按资源聚合更内聚。

### Decision 3: 子组件接收 Props 而非直接从父级读取

子组件通过 props 接收 `cluster` 对象，通过 emits 向父级通知事件（如删除后刷新列表）。不直接从父级作用域读取变量，保持组件独立性。

### Decision 4: Phase 1 和 Phase 2 可独立交付

Phase 1（composables）结束后模板仍然在 ClusterList.vue 中，但 Script 已大幅缩减。  
Phase 2（子组件）结束后 ClusterList.vue 仅剩容器框架。

## Risks / Trade-offs

- **[风险] 函数签名变更** → Composable 设计时要考虑参数扩展性，避免 breaking changes
- **[风险] 模板中仍有大量 `v-if` 切换** → Phase 2 拆分组件后自然解决
- **[风险] composable 间共享状态** → 通过参数传递 cluster 对象，同时保持响应式
- **[风险] 大文件 git diff 冲突** → 建议 Phase 1 逐个模块抽取，每次提交一个 composable

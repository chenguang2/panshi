## Context

代码库包含前端 Vue 3 + TypeScript 和后端 FastAPI 两部分。前端有 6 个资源 composable 管理表格/卡片 CRUD 操作，后端有 EdgeClient 和 EdgeLogger 两个服务类。经过多次迭代，这些文件积累了大量结构重复的代码——publish/delete 流程的进度弹窗在 5 个 composable 里 copy-paste，EdgeLogger 的 5 个 log 方法几乎一样，EdgeClient 的 29 个资源方法全是 `_request` 的一行包装。

同时，`ClusterList.vue` 在重构提取子组件后残留了约 265 行死代码（内联弹窗/抽屉和未使用的 composable 解构）。

## Goals / Non-Goals

**Goals:**
- 删除 `ClusterList.vue` 中 265 行死代码（残留弹窗 + 未用解构）
- 将前端 publish 进度弹窗和 delete 确认回调提取到 `useClusterUtils.ts`，5 个 composable 统一调用
- 将后端 `EdgeLogger` 的 5 个 `log_xxx_operation` 合并为 1 个参数化方法
- 将后端 `EdgeClient` 的 29 个资源方法合并为通用 `resource_request` 方法
- 去掉 `h` 导入（不再需要手工创建 VNode）

**Non-Goals:**
- 不改业务逻辑
- 不改 API 契约
- 不改数据库 schema
- 不改测试文件
- 后端 CRUD endpoint 统一暂不纳入（改动太大，需要独立 changelist）

## Decisions

1. **前端 publish/delete 抽取到 useClusterUtils.ts**：复用已有的 `buildDeleteProgressContent` 模式，新增 `executePublish` 和 `buildDeleteProgressHandler` 两个工厂函数。所有资源 composable 统一调用。
2. **后端 EdgeLogger 合并为参数化方法**：不再按资源类型定义 5 个重复方法，改用 `log_operation(resource_type, **kwargs)` + 字典映射 `resource_type → (log_file, label_template)`。
3. **后端 EdgeClient 合并为通用 resource_request**：不再定义 `get_upstream / update_route / delete_plugin_config` 等 29 个方法，改用 `api(resource, action, resource_id, data)` + `RESOURCE_PATHS` 字典。
4. **改动顺序**：死代码清理 → EdgeLogger 统一 → EdgeClient 统一 → 前端 publish/delete 抽取。低风险优先，逐步推进。

## Risks / Trade-offs

- [向后兼容] EdgeLogger/EdgeClient 的旧方法名被多处引用，重构后需保留旧方法作为别名过渡，或一次性改所有调用点。优先选择一次性改所有调用点（方法调用者集中在 api/v1/ 各 endpoint）。
- [前端] publish/delete 抽取到 `useClusterUtils.ts` 后，需要确保 5 个 composable 都正确导入并使用新函数。
- [测试] 不会改动测试文件，但需要确保现有测试通过。

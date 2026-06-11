## Context

路由列表页（`RouteList.vue`）当前支持方法芯片、搜索框、集群下拉、上游下拉、发布状态下拉共 5 种过滤方式。插件过滤缺失，导致用户无法快速定位使用了特定插件的路由。后端路由 API（`list_all_routes`）当前按 `search`、`cluster_id`、`upstream_id`、`published` 参数过滤，未支持 `plugin` 参数。

## Goals / Non-Goals

**Goals:**
- 前端路由列表过滤栏增加「插件」下拉框
- 后端支持按插件名称过滤路由（查询 `route_plugin` 表关联）
- 下拉选项数据来自 `/plugins/builtin` 接口

**Non-Goals:**
- 不修改路由表单/编辑页面
- 不修改插件元数据管理
- 不涉及多选插件过滤（仅单选）

## Decisions

1. **插件数据源复用 `/plugins/builtin`** — 前端已有此接口加载内置插件列表，无需新增接口。下拉框额外增加"全部"选项表示不过滤。
   - 响应格式: `{"plugins": [{"name": "limit-req", "display_name": "限流", ...}]}`
   - value 用 `name`，label 用 `display_name`，回退用 `name`

2. **后端过滤使用 EXISTS 子查询** — 采用 `sqlalchemy.exists()` 方式，只有传了 `plugin` 参数时才执行子查询：
   ```python
   if plugin:
       from sqlalchemy import exists
       query = query.where(
           exists().where(
               RoutePlugin.route_id == Route.id,
               RoutePlugin.plugin_name == plugin
           )
       )
   ```
   - 无需 `.distinct()` 去重（一个路由挂多个插件时 JOIN 会产生多行）
   - 无 JOIN 性能开销，只在有 `plugin` 参数时执行
   - `route_plugin` 表已有索引，EXISTS 性能优于 JOIN
   - 分页前（COUNT 之前）执行，确保分页数据准确

3. **前端放在上游下拉之后** — 过滤栏布局顺序：搜索框 → 集群 → 上游 → 插件 → 发布状态。插件过滤放在上游和发布状态之间，符合过滤粒度从粗到细的排列。

4. **非受控组件模式** — 下拉框使用 `v-model` + `@change` 触发 `loadRoutes()`，与现有上游/发布状态下拉模式一致，无额外状态管理复杂度。

5. **不跟随集群联动** — 切换集群时不清空插件下拉选择。插件选项来自全局接口 `/plugins/builtin`，不依赖集群上下文，与集群切换解耦。

6. **前端传参模式** — 在 `loadRoutes()` 的 params 中添加 `if (pluginFilter.value) params.plugin = pluginFilter.value`，与其他过滤参数模式一致。

## Risks / Trade-offs

- 路由未挂载任何插件时，`route_plugin` 表中无对应记录，按插件过滤会直接排除这些路由 → 符合预期行为
- 插件名可能因大小写不一致导致过滤不准确 → 查询时使用 `plugin_name` 精确匹配（Edge 插件名规范统一）
- 过滤后如有大量路由（千级别）性能不受影响，`route_plugin` 表已有索引

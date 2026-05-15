## Context

当前配置对比（`clusters.py:diff_cluster_config`）在对比 DB 与 Edge 配置时，只有 `_UPSTREAM_DEFAULTS` 硬编码字典处理了 3 个上游字段的默认值等效。实测发现 6 个对比 bug，且 JSON 字段（timeout/checks/keepalive_pool）、插件配置等完全没有等效处理。

等效规则需要持续收集和完善，需要一个集中的、易扩展的管理方式。

## Goals / Non-Goals

**Goals:**
- 新增 YAML 规则文件，集中管理所有字段的等效规则
- 新增 `EquivalenceRules` 引擎类，加载规则并填充缺省值后对比
- 引擎支持：标量字段默认值、字段别名映射、JSON 嵌套递归填充、列表字段格式化、忽略 Edge 内部字段
- 修复对比逻辑中的 6 个已知 bug
- 补充单元测试

**Non-Goals:**
- 不改动前端
- 不改动数据库表结构
- 不改动 API 响应格式
- 不涉及 UI 管理页面（后续可加）

## Decisions

- **YAML over JSON**：YAML 支持注释，便于维护者在规则旁写说明
- **单例模式加载**：`EquivalenceRules` 用单例，避免每次请求重新读取文件
- **递归填充代替扁平映射**：JSON 字段可能多层嵌套（`checks.active.unhealthy.http_failures`），递归 `_deep_fill` 自然支持
- **插件 JSON 按 name 拆分对比**：每个插件有独立默认值，拆开对比可精确定位到哪个插件有差异

## Risks / Trade-offs

- [规则文件滞后] 规则收集速度跟不上使用 → 初始放已知规则，遇到误报再补充
- [缺省值变化] Edge 版本升级可能改变内置默认值 → 规则文件需要配套更新
- [性能] 递归填充在大 JSON 上可能有开销 → 规则文件不大，实测无影响

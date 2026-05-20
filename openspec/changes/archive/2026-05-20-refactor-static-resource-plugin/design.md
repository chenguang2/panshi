## Context

当前 `static_resource.lua` 插件代码由 AI 辅助生成，存在多个不符合 Edge 插件开发规范的问题：

1. **`attr_schema` 变量未定义** — 第 123 行引用了 `attr_schema` 但从未定义，会导致 runtime error
2. **`_M.check_schema()` 不合规** — 直接使用 `core_schema.check` 检查完整 schema，但应根据 Edge 框架标准模式实现
3. **access 阶段使用 `ngx.exit()`** — 其他插件均返回 `status, body` 而非直接 ngx.exit，后者会在插件链中跳过后续插件
4. **`priority = 990` 不恰当** — 与其他插件（如 `pre_functions` 9999、`proxy_rewrite` 6508）的优先级策略不一致
5. **文件读取方式** — 使用 `file:read("*all")` 将整个文件读入内存，对 >10MB 文件有 OOM 风险

`docs/edge/code/admin_static_resources.lua`（Admin API handler）是正确的参考实现，`static_resource.lua` 需要与之配合工作。

## Goals / Non-Goals

**Goals:**
- 修复所有现有代码缺陷，使其符合 Edge 插件规范
- 遵循其他插件的 `plugin.new` + 标准接口模式
- 保留完整的静态文件服务功能（MIME、缓存控制、304 条件请求）
- schema 校验完善，确保配置参数在生产环境中的正确性

**Non-Goals:**
- 不改变 `admin_static_resources.lua` 控制 API 逻辑
- 不修改后端 Python 代码或前端
- 不引入新的外部依赖
- 不实现增量文件更新（仍为全量 zip 重新上传）

## Decisions

1. **遵循 `plugin.new()` 标准模式**
   - 参考 `traffic_limit_count.lua`、`response_rewrite.lua` 等插件
   - 使用 `plugin.new({...})` 注册插件元信息
   - 实现 `check_schema` 方法进行配置校验

2. **access 阶段返回状态码而非 `ngx.exit()`**
   - 遵循其他插件惯例（如 `traffic_limit_count.lua` 的 `return conf_status, conf_message`）
   - 正确使用 `return 404`、`return 403` 等返回值，让 Edge 框架统一处理响应
   - `ngx.exit()` → `return status_code[, body]`

3. **优先级设为 `priority = 990` 保持原值**（该值在 access 阶段执行，足够晚以在路由匹配后处理）

4. **大文件处理采用分块读取策略**：超过阈值时使用 `ngx.print` 分块，而非全部读入内存

5. **Schema 定义明确类型约束**
   - `base_path`：string，默认 `/data/edge/static`
   - `cache_max_age`：integer ≥ 0，默认 3600
   - `index_file`：string，默认 `index.html`

## Risks / Trade-offs

- [大文件内存占用] 插件使用 `file:read("*all")` 加载大文件 → 对 >10MB 的文件改用分块读取（每次 8KB），或限制单文件大小（通过文档说明而非代码硬限制）
- [路径遍历攻击] 用户可通过精心构造的路径访问上级目录 → 严格的 `..` 检测和路径规范化
- [MIME 类型覆盖不全] 映射表可能遗漏某些扩展名 → 默认回退为 `application/octet-stream`
- [文件并发读取] 高并发下 `io.open` 可能竞争 → 当前 Edge 插件框架下可接受，暂不引入文件锁

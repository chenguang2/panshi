## Why

当前 `static_resource.lua` 插件代码存在变量引用未定义、Schema 校验缺失、不符合 Edge 插件规范等问题，无法在生产环境中正常工作。需要重构该插件使其遵循 Edge 插件的标准模式（`plugin.new`、`check_schema`、`access` 阶段返回状态码而非 `ngx.exit`），并修复所有功能性缺陷，确保满足已定义的静态资源服务需求。

## What Changes

- **修复 `static_resource.lua` 代码缺陷**：补全未定义的 `attr_schema` 变量，修正 `check_schema()` 校验逻辑
- **重构 access 阶段**：将 `ngx.exit()` 直接退出改为返回标准状态码（遵循其他插件的 `return status, body` 模式）
- **完善 Schema 定义**：添加配置参数的完整校验规则（`base_path`、`cache_max_age`、`index_file`）
- **保留控制 API 功能**：`admin_static_resources.lua` 不受影响，维持现有上传/删除/列表功能
- **路径遍历防护**：加强对 `..` 路径穿越攻击的防护

## Capabilities

### New Capabilities
- `static-resource-serving`: Edge 节点侧通过 APISIX 插件提供静态文件访问，含缓存控制（ETag、Cache-Control、304 条件请求）和 MIME 类型处理

### Modified Capabilities

<!-- 不涉及现有 spec 的需求变更 -->

## Impact

- Edge 节点插件：重构 `docs/edge/code/static_resource.lua`，修正代码结构和规范问题
- 不影响 `admin_static_resources.lua`（控制 API）
- 不涉及后端或前端代码变更

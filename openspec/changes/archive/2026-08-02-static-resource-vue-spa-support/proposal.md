## Why

静态资源功能目前只能服务"文件路径与部署 URL 完全对应"的普通 HTML 包。Vue 等前端框架构建出的 SPA 包（如 `webTrade.zip`）无法正常访问：白屏、一直转圈、资源 404。

实测证据（节点 192.168.0.13:16610，路由 uri=`/*`，包内 `index.html` 以 `base: '/webTrade/'` 构建）：

| 请求 | 结果 | 原因 |
|---|---|---|
| `/index.html` | 200 | 文件存在，正常服务 |
| `/` | 404 | 目录索引缺失（`relative_path=""` 时直接打开目录失败） |
| `/webTrade/assets/js/index-DAVGGJ_A.js` | 404 | 绝对路径前缀剥离缺失（解析为 `webTrade/assets/...`，磁盘上不存在） |
| `/webTrade/` | 404 | 目录索引 + base 剥离双重缺失 |

该包在用户 nginx 中可正常显示，因为 nginx 配置了 `try_files $uri $uri/ @router` + `index index.html`（目录索引 + SPA 回退）。`static_resource` 插件缺少这三层兜底语义。

## What Changes

- **`edge_node/handlers/static_resource.lua`**：实现 nginx `try_files` 等价语义：
  - 目录索引：请求路径解析为空、以 `/` 结尾、或解析到的路径是目录时，返回对应目录下的 `index_file`（默认 `index.html`）
  - SPA 回退（新增配置 `spa_fallback`，默认 `true`）：文件不存在且请求为**导航请求**（无扩展名或扩展名不在 MIME 表中）时，回退返回根 `index.html`；扩展名在 MIME 表中的资源请求（`.js/.css/.png/.json/...`）仍严格 404，避免资源缺失被静默替换为 HTML
  - base 前缀剥离：请求的 relative_path 以 `app_base`（新增配置，默认空）开头时剥离后再解析；`app_base` 为空时默认对单段前缀做**剥离试探**（无状态，无缓存，天然兼容多 worker）
- **`backend/app/config/plugin_definitions.py`**：`static_resource` 插件 schema 增加 `spa_fallback`、`app_base` 字段，暴露给前端插件编辑器
- **`edge_node/handlers/static_resource.lua` schema**：同步增加 `spa_fallback`、`app_base` 字段声明
- **`openspec/specs/static-resource-serving/spec.md`**：细化"访问不存在的文件 → 404"行为（目录索引回退、SPA 回退条件、资源请求严格 404）；新增 schema 校验场景
- **文档**：`docs/edge/framework/static-resource-implementation.md` 补充 Vue SPA 包支持说明（`spa_fallback`、`app_base` 配置、构建 base 与路由 uri 的关系、zip 根目录约束）

## Capabilities

### New Capabilities

- `static-resource-spa-serving`: 静态资源对 SPA（Vue 等前端框架构建包）的访问支持，包括目录索引、history 路由回退、构建 base 前缀剥离（单段自动、多段配置）

### Modified Capabilities

- `static-resource-serving`: 访问行为从"仅服务存在的文件路径"扩展为支持目录索引、SPA 回退和 base 前缀剥离；"访问不存在的文件 → 404"细化（目录索引回退、无扩展名导航请求在开启 spa_fallback 时回退 index.html，资源请求仍 404）；schema 校验新增字段场景

## Impact

- **edge_node/handlers/static_resource.lua** — 核心改动，文件解析逻辑重构为两阶段（解析 → 响应），删除 shell 调用
- **backend/app/config/plugin_definitions.py** — 插件 schema 增加 2 个字段（前端表单自动生成）
- **openspec/specs/static-resource-serving/spec.md** — 行为规格更新
- **docs/edge/framework/static-resource-implementation.md** — 部署文档补充
- 不影响：`admin_static_resources.lua`（上传/解压链路无需改动）、后端发布链路、前端页面（插件编辑器自动适配新字段）
- 测试：节点 192.168.0.13:16610 上已发布 webTrade 包可直接验证

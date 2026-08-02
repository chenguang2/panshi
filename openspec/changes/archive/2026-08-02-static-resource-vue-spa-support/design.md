## Context

`static_resource` 插件（`edge_node/handlers/static_resource.lua`）当前的文件解析逻辑：

```lua
local relative_path = extractPath(uri, base_uri) or index_file   -- L217
local filepath = base_path .. "/" .. route_id .. "/" .. relative_path  -- L225
local f, err = io.open(filepath, "r")  -- L260，失败返回 404
```

三个已知缺陷（已通过节点 192.168.0.13:16610 实测验证）：

1. **目录索引缺失**：请求 `/` 时 `extractPath` 返回空串 `""`（Lua 中 truthy，`or index_file` 不触发）→ `filepath` 指向目录 → `io.open` 失败 → 404。nginx 靠 `index index.html` 处理。
2. **SPA history 回退缺失**：请求 `/webTrade/some/route`（无对应文件）→ 404。nginx 靠 `try_files $uri $uri/ @router` + `rewrite ^.*$ /index.html last` 处理。
3. **构建 base 前缀剥离缺失**：webTrade 包以 `base: '/webTrade/'` 构建，`index.html` 内资源引用 `/webTrade/assets/...` 绝对路径。路由 uri 为 `/*` 时，插件把 `/webTrade/assets/x.js` 解析为 `webTrade/assets/x.js`，而 zip 解压后 `assets/` 在包根目录 → 404。

约束：插件运行在 access 阶段，返回标准状态码（`plugin.new` 规范），不使用 `ngx.exit`。配置经 `conf` 传入（路由插件配置），需同步后端 `plugin_definitions.py` 的 schema 才能在前端插件编辑器暴露。

## Goals / Non-Goals

**Goals:**
- 目录请求（`/`、`/webTrade/`、`/docs`、任意以 `/` 结尾的路径）返回对应目录下的 `index.html`
- 开启 `spa_fallback` 后，无扩展名的导航请求（如 `/webTrade/login`）回退到根 `index.html`
- 请求 URI 带构建 base 前缀（如 `/webTrade/assets/...`）时正确剥离前缀并命中文件（单段 base 自动剥离，多段 base 需配置 `app_base`）
- 带扩展名的资源请求（`.js/.css/.png/...`，扩展名在 MIME 表中）找不到文件时**始终 404**，绝不静默回退成 HTML

**向后兼容说明（精确表述）：**
- 常规文件访问（`/index.html`、`/js/app.js`、`/css/style.css`）行为**完全不变**——候选 1 直接命中
- **目录索引**（根路径/目录请求 404 → 200）与**剥离试探**（未知前缀可命中包根文件）为默认生效的**修复性增强**：前者修复现有目录 404 缺陷，后者按 A1/B2 决策接受语义模糊（不新增信息暴露面，行为与 nginx `@router` 一致）
- **SPA 回退**为默认开启的新行为（`spa_fallback` 默认 true，与 nginx `@router` 兜底语义一致；显式设为 false 可恢复严格 404）

**Non-Goals:**
- 不修改上传/解压链路（`admin_static_resources.lua` 无需改动）；zip 根目录约束仅文档化，上传校验留待后续独立 change
- 不实现 index.html 内容改写（不 rewrite HTML 内的绝对路径——浏览器按原路径请求，服务端剥离即可）
- 不做 URL 解码增强、不处理 `%2E%2E` 等编码绕过（超出本次范围）
- 不改动路由匹配核心（edge core 不在本仓库内）

## Decisions

### D1: 文件解析逻辑重构为"try_files 等价语义"（候选路径探测，无目录判定）

`access()` 中 `relative_path` 确定后，构造候选路径列表并**依次用 `io.open` 探测**——第一个能作为普通文件成功打开（open 成功 + seek 成功）的即命中：

```
相对路径 relative_path 确定后（空串 → index_file）：

候选 1: base/route_id/relative_path                      ← 文件本身
候选 2: base/route_id/relative_path/index_file           ← 目录索引
         （relative_path 以 / 结尾时拼接去重斜杠）
候选 3: base/route_id/index_file                          ← SPA 回退根（仅 spa_fallback）

顺序 = 原始 → 目录索引 → SPA 回退
```

**为何不需要 `is_directory`（shell `test -d`）**：Linux 下 `io.open(目录, "r")` 成功但 `f:seek("end")` 失败——现有代码正是靠此区分目录与不存在（L265-269 `get_file_size` 返回 nil → 404）。目录探测能力已存在，只需改变用途：`relative_path = "docs/"` 时候选 1 `docs/`（目录，seek 失败跳过）→ 候选 2 `docs/index.html` 命中；`relative_path = "docs"` 无尾斜杠时同样候选 2 命中。目录存在但无 index.html → 404，与"路径不存在"结果一致，无需区分。**删除 `is_directory`、`io.popen`、shell 转义**——`static_resource.lua` 不再需要任何 shell 调用。

**实现细节**：候选探测与最终服务**共用同一文件句柄**（探测成功即用该句柄计算 etag/读取，不关闭重开），比现状（打开 3 次）更省。

### D2: 剥离试探 + 显式 `app_base` 双通道（统一在 relative_path 层）

**剥离层级**：剥离发生在 `extractPath` 之后的 **relative_path 层**，与路由 uri 完全解耦——无论路由是 `/*` 还是 `/static/{name}/*`，`extractPath` 产出的 relative_path 相同，剥离逻辑一致。

**双通道**（二选一，均在 relative_path 层剥离）：

- **显式 `app_base`**（配置优先）：`app_base = "/webTrade"` 时，若 relative_path 以归一化前缀开头（边界为 `/` 或结尾），精确剥离后再走候选探测。配置值归一化（去掉尾部 `/`），容忍 `/webTrade` 与 `/webTrade/` 两种写法
- **剥离试探**（`app_base` 为空时，默认）：**只剥离第一段**（如 `webTrade/assets/x.js` → 剥 `webTrade` → `assets/x.js`），再走候选探测。**不递归剥离**（多段 base 靠显式 `app_base`）

**统一解析流程**（替换原 D1+D3）：

```
1. extractPath(uri, base_uri) → relative_path（空串 → index_file；含 .. → 403）
2. 候选探测：候选 1 → 候选 2（目录索引）→ 命中则返回
3. base 剥离（app_base 精确 或 剥离第一段试探）→ 重复步骤 2
4. SPA 回退（spa_fallback=true 且非资源扩展名）→ 候选 3
5. 全部失败 → 404（此时才返回，无响应头污染）
```

**为何用剥离试探而非"检测 base + 缓存"**：多 worker 环境下，浏览器并行发起 index.html 与资源请求，可能落到不同 worker——进程级缓存导致资源请求先到则未命中 → 404（"刷新后命中"的缓解在多 worker 下无效）。剥离试探**无状态、无缓存、无竞态**，每个请求独立完成。

**语义模糊代价（已确认接受）**：包根下真实文件可通过任意未知前缀访问（`/whatever/config.json` 也能命中根 `config.json`）——但不新增信息暴露面（`/config.json` 本就可直接访问），且行为与用户已验证的 nginx `@router` 一致。

**多段 base 边界（B2）**：剥离试探仅支持单段前缀自动剥离；多段 base（如 `/apps/webTrade/`）必须显式配置 `app_base`，未配置时 404（失败模式安全，可自愈）。

### D3: 新增配置 `spa_fallback`（bool，默认 true）

- **默认开启**：所有静态资源默认采用 SPA 兜底语义（导航请求找不到文件时回退 index.html），与 nginx `try_files $uri $uri/ @router` 行为一致
- 显式设为 `false` 可恢复严格 404（与现有 spec "访问不存在的文件 → 404" 兼容）
- 资源请求（扩展名在 MIME 表）不受影响，始终严格 404
- 配置未设置（`config = {}`）时经 `conf.spa_fallback == nil` 判断回退到 `DEFAULT_SPA_FALLBACK = true`
- schema 声明于插件 Lua schema + 后端 `plugin_definitions.py`，前端插件编辑器自动渲染开关

### D4: 资源/导航请求判定用 MIME 表反向判定

**判定对象**：剥离 base 后的最终 relative_path（最后路径段）。发生在所有文件候选失败后、SPA 回退前；文件命中（候选 1/2 成功）无需判定。

```lua
local last_seg = relative_path:match("([^/]+)/?$") or ""
local ext = last_seg:match("%.([^%.]+)$")           -- 无点 → nil → 导航
return ext and MIME_TYPES[ext:lower()] ~= nil       -- 点在 MIME 表 → 资源
```

**为何反向判定（非"含点即资源"）**：`/v1.0`、`/user.v2` 等导航路径最后段带点但非资源类型，正向判定会误判为资源 → 不回退 → 404。反向判定下：扩展名在 MIME 表中的（`.js/.css/.png/.json/...`）→ 资源 → 严格 404；不在表中（`.0/.v2/.xyz`）或无语 → 导航 → 可回退。未知扩展名缺失时回退 HTML 与 nginx `@router` 行为一致。大小写：`ext:lower()` 后查表（与现有 `get_mime_type` L69 一致）。

### D5: 响应头与回退路径解耦（两阶段分离）

**问题**：现有代码在**打开文件前**就按 `relative_path` 扩展名设置 content_type（L233）、计算 etag（L238）、做 304 判断——重构后存在回退路径，初始猜测全部失效：SPA 回退返回根 index.html 时 MIME 应为 `text/html`（按 `login` 猜是 octet-stream）；etag 基于不存在的初始路径会导致 304 逻辑错乱。

**方案：两阶段分离**

```
阶段一（纯解析，不做任何响应头操作）:
  D1/D2 的候选探测流程 → 得到最终 filepath（或 404 返回）

阶段二（基于最终 filepath 设置响应）:
  ext ← 从【最终 filepath】提取
  content_type ← get_mime_type(ext)
  etag ← get_file_etag(【最终 filepath】)
  304 判断 → Content-Length → 读取返回
```

MIME/etag/304 **永远基于实际返回的文件**。路径遍历防护（`..` → 403）在阶段一剥离之前做（剥离只删前缀段，不会引入 `..`）；目录索引拼接的 `index_file` 是配置值，拼接前同样校验不含 `..`（防御配置误填）。

### D6: 后端 schema 同步

`backend/app/config/plugin_definitions.py` 的 `static_resource` 插件定义增加：

```python
spa_fallback = {"type": "boolean", "default": True, "description": "SPA history 路由回退：无扩展名导航路径不存在时返回 index.html（默认开启）"}
app_base = {"type": "string", "default": "", "description": "构建 base 前缀，如 /webTrade；relative_path 以此开头时剥离后再解析（多段 base 必须配置）"}
```

前端插件编辑器（PluginSelector → schema 驱动）自动渲染表单，无需前端代码改动。

## Risks / Trade-offs

- **[剥离试探语义模糊]** → 未知前缀可访问包根文件 → 不新增信息暴露面（包根文件本可直接访问），行为与 nginx `@router` 一致（A1/B2 已确认接受）。如未来需严格 404 语义，可加配置关闭试探
- **[多段 base 失效]** → 剥离试探只剥第一段，`/apps/webTrade/` 场景 404 → 显式配置 `app_base` 兜底；失败模式为 404 不产生错误内容（B2 已确认）
- **[SPA 回退误伤]** → 无扩展名/未知扩展名的真实 404（如 `/favicon` 目录缺失）被回退成 index.html → 仅 `spa_fallback=true` 时发生，属用户显式选择；回退内容为 200 + HTML，浏览器可正常渲染
- **[向后兼容]** → 常规文件访问完全不变；目录索引与剥离试探为默认生效的修复性增强；SPA 回退为唯一配置门控（C2 已确认）
- **[extractPath 空串 truthy 陷阱]** → 本次修复正是针对此，重构时用显式 `== ""` 判断，不再依赖 `or` 的 truthiness
- **[zip 根目录约束]** → zip 解压后 index.html 必须在包根（内嵌一层 `dist/` 则 404）→ 本次仅文档化（C3 已确认），上传校验留待后续 change

## Migration Plan

1. 修改 `edge_node/handlers/static_resource.lua`（新增 `spa_fallback`/`app_base` 到 schema + `default_attr`，重构 `access()` 为两阶段解析，新增 `strip_app_base`/`is_resource_request` 辅助函数；删除目录探测/shell 调用）
2. 修改 `backend/app/config/plugin_definitions.py` 插件 schema
3. 更新 spec 与文档
4. 部署到节点 192.168.0.13：覆盖 `/work/jboss/uapm/openresty/lualib/edge-root/edge/plugins/static_resource.lua` → `bin/edge stop` → `bin/edge start`
5. 验证：`/`、`/index.html`、`/webTrade/assets/js/index-DAVGGJ_A.js`、`/webTrade/`、SPA 路由路径
6. 回滚：恢复原 `static_resource.lua` 重启节点（配置字段向后兼容，回滚无需清理数据）

## Open Questions

- 无（A1~A4、B1~B2、C1~C3、D1~D2 全部决策已与用户逐一讨论确认）

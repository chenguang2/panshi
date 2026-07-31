# 静态资源发布功能 — Edge 节点实现

> 本文档记录 Edge 节点侧 Lua 代码的实现说明，供部署到 Edge 节点时参考。
> 参考实现文件：`edge_node/handlers/static_resource.lua`、`edge_node/handlers/admin_static_resources.lua`

---

## 架构概览

```
管理平台上传 zip
      │
      ▼
后端解压 + 记录元数据
      │
      ▼ （通过 PUT /edge/admin/static_resources/{name}，SM4 加密传输）
      ├──► Edge 节点 1（解压到 /data/edge/static/{name}/）
      ├──► Edge 节点 2
      └──► Edge 节点 3
      
用户请求：
浏览器 ──GET /static/{name}/index.html──► Edge 节点
                                            │
                                   PANSHI 路由匹配
                                   （uri: /static/{name}/*）
                                            │
                                   static_resource 插件
                                   （access 阶段读取本地文件返回）
```

---

## 文件 1：Admin API Handler

**文件**：`admin_static_resources.lua`
**用途**：处理管理端上传/删除静态资源的请求

### 端点

| 方法 | 路径 | 行为 |
|---|---|---|
| `PUT` | `/edge/admin/static_resources/{name}` | 接收加密 zip body，解压到 `/data/edge/static/{name}/` |
| `DELETE` | `/edge/admin/static_resources/{name}` | 删除 `/data/edge/static/{name}/` 目录 |
| `GET` | `/edge/admin/static_resources` | 列出已部署资源 |

### 注册方式

通过 `control_api()` 注册路由，与 `data_center.lua` 使用相同的 Edge 框架模式：

```lua
function _M.control_api()
  return {
    {
      methods = {"PUT"},
      uris = {"/edge/admin/static_resources/*"},
      handler = function(params)
        return handle_upload(params.name)
      end,
    },
    {
      methods = {"DELETE"},
      uris = {"/edge/admin/static_resources/*"},
      handler = function(params)
        return handle_delete(params.name)
      end,
    },
    {
      methods = {"GET"},
      uris = {"/edge/admin/static_resources"},
      handler = function()
        return handle_list()
      end,
    },
  }
end
```

### PUT 处理流程

1. 校验 resource name（非空、无 `..` 路径穿越）
2. 通过 `req_get_body()` 获取请求体（已由 Edge 框架解密为原始 zip 二进制）
3. 保存为临时文件 `/tmp/edge_static_upload_{timestamp}_{random}.zip`
4. 删除旧资源目录 `rm -rf /data/edge/static/{name}/`
5. 解压 `unzip -o {temp_zip} -d /data/edge/static/{name}/`
6. 清理临时文件
7. 返回 Edge 标准响应格式

### DELETE 处理流程

1. 校验 resource name
2. 删除目录 `rm -rf /data/edge/static/{name}/`
3. 返回 Edge 标准响应格式

---

## 文件 2：PANSHI 插件

**文件**：`static_resource.lua`
**用途**：在 PANSHI 请求处理 `access` 阶段拦截匹配路由，从本地文件系统读取文件返回

### 注册方式

```lua
local _M = plugin.new({
  version = 0.1,
  priority = 990,        -- 较高优先级，在通用处理前执行
  name = "static_resource",
  schema = schema,
  attr_schema = attr_schema,
  default_attr_schema = default_attr_schema,
  default_attr = default_attr,
})
```

### 插件配置参数

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `base_path` | string | `/data/edge/static` | 静态资源根目录 |
| `cache_max_age` | integer | 3600 | Cache-Control max-age（秒） |
| `index_file` | string | `index.html` | 目录默认首页文件 |
| `spa_fallback` | boolean | `true` | SPA history 路由回退：无扩展名（或扩展名不在 MIME 表）的导航请求找不到文件时返回根 `index.html`（默认开启，与 nginx `@router` 兜底一致；显式设为 `false` 恢复严格 404） |
| `app_base` | string | `""` | 构建 base 前缀：`extractPath` 解析出的相对路径以此前缀开头时剥离后再解析；多段 base（如 `/apps/webTrade`）必须配置 |

### 请求处理流程（access 阶段，两阶段解析）

```
请求 /static/myapp/css/app.css
  │
  ├─ 阶段一：纯解析（不设置响应头）
  │   ├─ extractPath → relative_path（空串 → index_file；含 ".." → 403）
  │   ├─ 候选探测 1：base_path/route_id/relative_path
  │   ├─ 候选探测 2：relative_path 指向目录时 → relative_path/index_file
  │   ├─ base 剥离：app_base 精确剥离 / 单段前缀试探（webTrade/assets/x.js → assets/x.js）
  │   │   └─ 剥空后：目录请求（原路径以 / 结尾）走目录索引；导航请求并入 SPA 回退
  │   ├─ SPA 回退（spa_fallback 且非资源请求）→ 根 index_file
  │   └─ 全部失败 → 404
  │
  ├─ 阶段二：基于最终文件设置响应
  │   ├─ Content-Type（按最终文件扩展名）
  │   ├─ Cache-Control: public, max-age=3600
  │   ├─ ETag / Last-Modified
  │   ├─ 304 条件请求判断（If-None-Match）
  │   └─ 200 + 文件内容
```

### 请求解析行为

| 请求 | 行为 |
|---|---|
| `/static/myapp/index.html` | 返回文件（Content-Type: text/html） |
| `/static/myapp/` | 目录索引 → 返回 `index.html` |
| `/static/myapp/docs/` | 目录索引 → 返回 `docs/index.html` |
| `/static/myapp/login`（spa_fallback 开启） | SPA 回退 → 返回根 `index.html` |
| `/static/myapp/assets/missing.js` | 资源请求（`.js` 在 MIME 表）→ 404 |
| `/webTrade/assets/x.js`（app_base 空，包以 `/webTrade/` 构建） | 单段剥离试探 → 返回包内 `assets/x.js` |
| `/apps/webTrade/assets/x.js`（app_base 空） | 多段 base 单段剥离失败 → 404（需配置 `app_base=/apps/webTrade`） |

### Vue SPA 包部署说明

Vue（Vite）等框架构建的 SPA 包与普通 HTML 包的关键差异：

1. **构建 base**：`index.html` 内资源引用可能是绝对路径（如 `base: '/webTrade/'` 时引用 `/webTrade/assets/...`）。`app_base` 为空时插件会对单段前缀自动剥离试探；**多段 base 必须显式配置 `app_base`**（与路由 uri 解耦，在 relative_path 层剥离）。
2. **history 路由**：Vue Router 使用 `createWebHistory()` 时，刷新/直达子路由（如 `/webTrade/login`）需要服务端回退到 `index.html`——在插件配置中开启 `spa_fallback`。
3. **zip 根目录约束**：解压后 `index.html` 必须在包根目录。若打包时多包了一层目录（如 zip 内是 `dist/index.html`），需重新打包（上传校验留待后续版本）。

### MIME 类型映射表

| 扩展名 | Content-Type |
|---|---|
| `.html` / `.htm` | `text/html; charset=utf-8` |
| `.js` | `application/javascript; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.xml` | `application/xml; charset=utf-8` |
| `.txt` | `text/plain; charset=utf-8` |
| `.svg` | `image/svg+xml` |
| `.ico` | `image/x-icon` |
| `.png` | `image/png` |
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.woff` | `font/woff` |
| `.woff2` | `font/woff2` |
| `.ttf` | `font/ttf` |
| `.otf` | `font/otf` |
| `.eot` | `application/vnd.ms-fontobject` |
| `.pdf` | `application/pdf` |
| 其他 | `application/octet-stream` |

---

## 部署说明

### 在 Edge 节点上部署

```bash
# 1. 将插件文件复制到 Edge 节点插件目录
cp static_resource.lua /path/to/edge/plugins/static_resource.lua

# 2. 在 edge.cfg 的 plugins 列表中加入 static_resource
# plugins = {
#   ...,
#   "static_resource",
# }

# 3. 重新加载插件
curl -X PUT 'http://127.0.0.1:9990/edge/admin/plugins/reload' \
  -H 'X-API-KEY: {admin_key}'
```

### 在 PANSHI 路由中启用

创建或更新路由时，在 `plugins` 字段中加入：

```json
{
  "uri": "/static/*",
  "name": "static-resources",
  "plugins": {
    "static_resource": {
      "base_path": "/data/edge/static",
      "cache_max_age": 3600,
      "spa_fallback": true,
      "app_base": "/webTrade"
    }
  },
  "status": 1
}
```

---

## 与现有框架的集成点

| 组件 | 集成方式 |
|---|---|
| Edge 框架 | 复用 `edge.core`、`edge.plugin` 标准模块 |
| Admin API | 通过 `control_api()` 注册 PUT/DELETE/GET 端点 |
| 加密通道 | 请求/响应 SM4 加解密由 Edge 框架自动处理，handler 操作原始数据 |
| 插件系统 | 标准 `plugin.new()` 注册，在 `edge.cfg` 中启用名字 |
| 文件存储 | 本地文件系统 `/data/edge/static/{name}/`，不依赖外部存储 |

# 静态资源发布功能 — Edge 节点实现

> 本文档记录 Edge 节点侧 Lua 代码的实现说明，供部署到 Edge 节点时参考。
> 参考实现文件：`docs/edge/code/static_resource.lua`、`docs/edge/code/admin_static_resources.lua`

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
                                   APISIX 路由匹配
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

## 文件 2：APISIX 插件

**文件**：`static_resource.lua`
**用途**：在 APISIX 请求处理 `access` 阶段拦截匹配路由，从本地文件系统读取文件返回

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

### 请求处理流程（access 阶段）

```
请求 /static/myapp/css/app.css
  │
  ├─ 解析 URI segments → resource_name="myapp", path="css/app.css"
  │
  ├─ 安全检查：拒绝包含 ".." 的路径
  │
  ├─ 构建文件路径：/data/edge/static/myapp/css/app.css
  │
  ├─ 打开文件
  │   ├─ 失败 → 404
  │   └─ 成功 → 读取全部内容
  │
  ├─ 设置 Content-Type
  │   ├─ .html  → text/html; charset=utf-8
  │   ├─ .js    → application/javascript; charset=utf-8
  │   ├─ .css   → text/css; charset=utf-8
  │   ├─ .png   → image/png
  │   ├─ ...    → 内置 20+ 映射
  │   └─ 未知   → application/octet-stream
  │
  ├─ 设置缓存头
  │   ├─ Cache-Control: public, max-age=3600
  │   ├─ ETag: "{sha1_prefix}-{size}"
  │   └─ Last-Modified
  │
  ├─ 304 条件请求判断
  │   ├─ If-None-Match 匹配 → 304 No Content
  │   └─ 不匹配 → 200 + 文件内容
  │
  └─ 返回响应
```

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

### 在 APISIX 路由中启用

创建或更新路由时，在 `plugins` 字段中加入：

```json
{
  "uri": "/static/*",
  "name": "static-resources",
  "plugins": {
    "static_resource": {
      "base_path": "/data/edge/static",
      "cache_max_age": 3600
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

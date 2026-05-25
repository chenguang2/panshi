# response_rewrite

## 1. 插件概览

`response_rewrite` 插件用于在 API 网关将响应发送给客户端之前，动态重写响应报文的内容。典型的应用场景包括：
- 修改或覆盖后端的响应状态码（HTTP Status）。
- 动态添加、修改或删除响应头（Response Headers），例如添加安全标头或跨域配置。
- 修改或替换响应体（Response Body），支持纯文本替换、变量注入以及基于正则表达式的内容替换。
- 能够依据条件表达式（Expressions）针对特定的响应内容执行重写操作。

## 2. 配置详情

### 2.1 插件静态属性 (Attr Config)

无。

### 2.2 插件数据属性 (Metadata Config)

通过管理接口全局配置（路径：`/edge/admin/plugin_metadata/response_rewrite`）。

| 字段名 | 类型 | 默认值 | 描述 | 设置示例 |
| :--- | :--- | :--- | :--- | :--- |
| `status` | Integer | 无 | 重写的 HTTP 响应状态码，支持 `200` 到 `599`。 | `200` |
| `add_headers` | Object | 无 | 在原有响应头基础上追加的标头键值对配置。 | `{"X-Add-Header": "Edge"}` |
| `headers` | Object | 无 | 覆盖或设置的响应标头键值对配置（如果原来已有则修改）。 | `{"Server": "Edge-Gateway"}` |
| `body` | String/Array/Object | 无 | 用来替换原始后端响应体的内容。 | `"New Body Content"` |
| `regex_body` | Array | 无 | 包含用于在原始响应体上执行正则匹配与替换的规则列表。 | `[["world", "Edge", 1]]` |
| `plain_text` | Boolean | `false` | 设置为 `true` 时，表示 `body` 内容为纯文本，不对其中的变量进行解析。 | `true` |

> **说明**: `regex_body` 规则列表每一项的格式为 `[ "正则表达式", "替换字符串", "替换次数" ]`。其中，“替换次数”默认值为 `0`（表示全部替换）。

### 2.3 插件基础属性 (Config)

路由级配置，不仅包含上述数据属性（`_schema`），还额外支持根据 HTTP 请求方法或基于表达式来进行匹配重写。

| 字段名 | 类型 | 默认值 | 描述 | 设置示例 |
| :--- | :--- | :--- | :--- | :--- |
| `status` | Integer | 同上 | 同上 | 同上 |
| `add_headers` | Object | 同上 | 同上 | 同上 |
| `headers` | Object | 同上 | 同上 | 同上 |
| `body` | String/Array/Object | 同上 | 同上 | 同上 |
| `regex_body` | Array | 同上 | 同上 | 同上 |
| `plain_text` | Boolean | 同上 | 同上 | 同上 |
| `include_add_headers_expr` | Array | 无 | 条件表达式规则，仅在满足该条件时执行 `add_headers`。 | `[ ["status", "==", 200] ]` |
| `include_headers_expr` | Array | 无 | 条件表达式规则，仅在满足该条件时执行 `headers` 修改。 | `[ ["status", "==", 200] ]` |
| `include_body_expr` | Array | 无 | 条件表达式规则，仅在满足该条件时执行 `body` 和 `regex_body` 替换。 | `[ ["status", "==", 200] ]` |
| *(HTTP Method)* | Object | 无 | 可以指定特定的请求方法（如 `"GET"`, `"POST"`）作为键名，值为包含 `status`, `body`, `headers` 等配置的对象，表示仅针对该方法的特定重写规则。 | `{"GET": {"status": 201}}` |

> **说明**：条件表达式（如 `include_*_expr` 等）设置示例必须严格使用标准的 Edge 表达式格式。

### 2.4 注意事项

- **动态变量支持**: 在 `add_headers`、`headers` 的值中，以及 `body` 字段（当 `plain_text` 不为 `true` 时）支持注入 Nginx/Edge 变量，如 `${host}` 或 `${remote_addr}`。
- **响应体过滤限制**: 使用 `body` 或 `regex_body` 修改响应体时，如果后端的响应是流式的或被分块传输（Chunked），网关会先缓冲响应体内容再执行替换，可能会增加一定的内存消耗或请求延迟。
- **配置覆盖**: 路由级别的配置与基于 HTTP 方法（如 `GET`）的配置如果存在冲突，以具体方法块内的配置为准。

## 3. 调用与验证示例

### 3.1 覆盖响应头并修改响应体

**通过管理接口配置包含该插件的路由**:

> 注意：实际调用管理接口时，请求体需要先经过 SM4 加密，返回结果也需要进行解密。

```bash
curl -L -X PUT 'http://[ADMIN_ADDR]/edge/admin/routes/3001' \
-H 'X-API-KEY: API_KEY' \
-H 'Content-Type: application/json' \
-d '{
    "uri": "/test_rewrite",
    "plugins": {
        "response_rewrite": {
            "status": 200,
            "headers": {
                "X-Powered-By": "OpenResty Edge",
                "Server": "CustomServer/1.0"
            },
            "body": "This request was intercepted and rewritten by Edge. Client IP: ${remote_addr}"
        }
    },
    "upstream": {
        "nodes": {
            "127.0.0.1:8111": 1
        }
    }
}'
```

**访问网关验证**:

```bash
# 发起请求
$ curl -i http://127.0.0.1/test_rewrite

# 预期响应
HTTP/1.1 200 OK
Content-Type: text/plain
Connection: keep-alive
X-Powered-By: OpenResty Edge
Server: CustomServer/1.0

This request was intercepted and rewritten by Edge. Client IP: 127.0.0.1
```

### 3.2 使用正则表达式替换响应体

假设后端（上游）服务返回内容为 `"Hello, World!"`，我们希望将响应体中的 `World` 动态替换为 `Edge`。

**通过管理接口配置包含该插件的路由**:

```bash
curl -L -X PUT 'http://[ADMIN_ADDR]/edge/admin/routes/3002' \
-H 'X-API-KEY: API_KEY' \
-H 'Content-Type: application/json' \
-d '{
    "uri": "/test_regex",
    "plugins": {
        "response_rewrite": {
            "regex_body": [
                [
                    "World",
                    "Edge",
                    1
                ]
            ]
        }
    },
    "upstream": {
        "nodes": {
            "127.0.0.1:8111": 1
        }
    }
}'
```

**访问网关验证**:

```bash
# 发起请求
$ curl -i http://127.0.0.1/test_regex

# 预期响应
HTTP/1.1 200 OK
Content-Type: text/plain
...
Hello, Edge!
```

# security_corerule

## 1. 插件概览

`security_corerule` 插件是一个基于 OWASP Core Rule Set (CRS) 的安全检查引擎，用于拦截恶意的 HTTP 请求（如 SQL 注入、跨站脚本攻击、命令注入等）。其典型应用场景包括：
- 启用基础 Web 应用防火墙（WAF）来保护后端服务。
- 针对特殊场景在路由级别上配置白名单和黑名单，跳过特定的请求检查或强制进行拦截。
- 指定针对 URI、参数、Cookie 和请求体的解析方式，以适应特定业务场景的数据格式。

## 2. 配置详情

### 2.1 插件静态属性 (Attr Config)

该属性定义在 `edge.env` 文件的 `plugin_attr` 配置中。

| 字段名 | 类型 | 默认值 | 描述 | 设置示例 |
| :--- | :--- | :--- | :--- | :--- |
| `rules` | String | 无 | 安全规则所在的相对或绝对路径，需要部署在 `conf/security/` 以外的路径，请在相对路径末尾添加 `/` 或使用双层目录结构，例如：配置 `my_rules`，仍会查找 `conf/security/my_rules`，配置 `my_rules/` 或 `security/my_rules`，则会在当前目录（`edge.env`所在目录）对应的子目录查找，如果未配置，将默认加载 `conf/security/rules` 目录下的规则集。 | `"security/rules/"` |

### 2.2 插件数据属性 (Metadata Config)

通过管理接口全局配置（路径：`/edge/admin/plugin_metadata/security_corerule`）。

| 字段名 | 类型 | 默认值 | 描述 | 设置示例 |
| :--- | :--- | :--- | :--- | :--- |
| `status` | Integer | `403` | 被安全规则拦截后的 HTTP 响应状态码，支持 `200` 到 `599`。 | `403` |
| `message` | String | 无 | 被安全规则拦截后返回的错误信息内容。 | `"Request blocked by security rules."` |
| `log_matched_maxsize` | Integer | `128` | 最大写入日志的匹配内容。 | `128` |
| `ignore_rule` | String/Array | 无 | 忽略（不检查）的规则 ID 列表。 | `["920420"]` |
| `ignore_ruleset` | String/Array | 无 | 忽略的整个规则集名称列表。 | `["REQUEST-920-PROTOCOL-ENFORCEMENT"]` |
| `parseargs_decoders` | Array | `["hex", "base64"]` | 用于参数解析的解码器列表。 | `["hex", "base64"]` |
| `parseargs_collections` | Array | `["URI_ARGS", "REQUEST_ARGS"]` | 参与参数解析的采集集合项。 | `["REQUEST_ARGS"]` |
| `disable_parseargs_decoders` | Boolean | `true` | 是否完全禁用参数解码处理器。 | `true` |

### 2.3 插件基础属性 (Config)

路由级配置，不仅包含上述数据属性，还支持通过动态变量提取进行规则检查配置。

| 字段名 | 类型 | 默认值 | 描述 | 设置示例 |
| :--- | :--- | :--- | :--- | :--- |
| `status` | Integer | 同上 | 同上 | 同上 |
| `message` | String | 同上 | 同上 | 同上 |
| `log_matched_maxsize` | Integer | 同上 | 同上 | 同上 |
| `ignore_rule` | String/Array | 同上 | 同上 | 同上 |
| `ignore_ruleset` | String/Array | 同上 | 同上 | 同上 |
| `parseargs_decoders` | Array | 同上 | 同上 | 同上 |
| `parseargs_collections` | Array | 同上 | 同上 | 同上 |
| `disable_parseargs_decoders` | Boolean | 同上 | 同上 | 同上 |


### 2.4 注意事项

- **性能开销**：由于 OWASP 核心规则集较大且部分采用了复杂的正则表达式匹配，请合理设置 `ignore_ruleset` 与 `ignore_rule`，以降低 CPU 损耗，或仅在对安全要求较高的路由下开启此插件。

## 3. 调用与验证示例

### 3.1 开启插件并配置返回信息

**通过管理接口配置包含该插件的路由**:

> [!IMPORTANT]
> 实际调用管理接口时，请求体需要先经过 SM4 加密，返回结果也需要进行解密。
> 下面调用示例中的 `ADMIN_ADDR` 和 `API_KEY` 均为环境占位符，执行时请替换为实际地址与真实密钥值。

```bash
curl -L -X PUT 'http://ADMIN_ADDR/edge/admin/routes/3001' \
-H 'X-API-KEY: API_KEY' \
-H 'Content-Type: application/json' \
-d '{
    "uri": "/secure_api",
    "plugins": {
        "security_corerule": {
            "status": 403,
            "message": "Access Denied by WAF.",
            "ignore_rule": ["920350"]
        }
    },
    "upstream": {
        "nodes": {
            "127.0.0.1:8111": 1
        }
    }
}'
```

**访问网关验证（发送带有恶意注入特征 of 请求）**:

```bash
# 发起带有 SQL 注入攻击特征的请求
$ curl -i 'http://127.0.0.1/secure_api?id=1%20OR%201=1'

# 预期响应
HTTP/1.1 403 Forbidden
Content-Type: text/plain
Connection: keep-alive

Access Denied by WAF.
```

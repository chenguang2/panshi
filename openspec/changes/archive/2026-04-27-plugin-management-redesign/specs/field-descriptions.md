# 插件字段中文注释规范

## 概述

为每个插件配置字段添加中文说明、示例值和配置提示，帮助用户理解每个字段的作用和用法。

## Schema 扩展字段

在原有 APISIX schema 基础上扩展以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 字段功能描述（中文） |
| `examples` | `array` | 常用配置示例 |
| `hints` | `string` | 配置注意事项和提示 |

## 示例

```python
{
    "name": "limit-req",
    "description": "请求速率限制（令牌桶算法）",
    "schema": {
        "rate": {
            "type": "number",
            "description": "速率限制（每秒请求数）",
            "examples": [100, 200, 500, 1000],
            "hints": "每秒允许的请求数，必须大于 0"
        },
        "burst": {
            "type": "number",
            "description": "突发容量（令牌桶容量）",
            "examples": [50, 100, 200],
            "hints": "允许瞬时爆发的请求数，通常设为 rate 的 50%-100%"
        },
        "key": {
            "type": "string",
            "description": "限流维度",
            "enum": ["remote_addr", "server_addr", "uri"],
            "examples": ["remote_addr", "header:X-Real-IP"],
            "hints": "remote_addr 按客户端 IP 限流，可自定义 header 如 X-Api-Key"
        }
    }
}
```

## 前端渲染规范

### 表单模式显示

```
┌─────────────────────────────────────────────┐
│ rate                                        │
│ 速率限制（每秒请求数）                        │
│ ┌───────────────────────────────────────┐   │
│ │ 100                                    │   │
│ └───────────────────────────────────────┘   │
│ 示例：100                                   │
│ 💡 每秒允许的请求数，必须大于 0              │
└─────────────────────────────────────────────┘
```

### 显示层级

1. **标签**：`key` + 中文描述（description）
2. **帮助信息**：
   - 示例值（examples）- 第一项
   - 配置提示（hints）- 带 Info 图标

## 插件配置示例

### limit-req（请求限流）

```
rate: 每秒请求数，示例: 100, 200, 500
burst: 突发容量，示例: 50, 100
key: 限流维度，示例: remote_addr, header:X-Real-IP
```

### proxy-rewrite（代理重写）

```
uri: 目标 URI
regex_uri: 正则匹配 [pattern, replacement]
headers.set: 设置 Header
headers.add: 追加 Header
headers.remove: 删除 Header
host: 目标 Host
scheme: http 或 https
```

### jwt-auth（JWT 认证）

```
secret: 签名密钥
algorithms: 签名算法，示例: HS256, RS256
```
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db

router = APIRouter(prefix="/plugins", tags=["plugins"])


BUILTIN_PLUGINS = [
    {
        "name": "ip-restriction",
        "description": "IP 黑白名单限制",
        "enable_metadata": True,
        "schema": {
            "whitelist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IP 白名单",
                "examples": [["127.0.0.1", "10.0.0.0/8"]],
                "hints": "允许访问的 IP 或 IP 段，支持 CIDR 格式"
            },
            "blacklist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IP 黑名单",
                "examples": [["1.2.3.4", "192.168.0.0/16"]],
                "hints": "禁止访问的 IP 或 IP 段，优先级高于白名单"
            }
        }
    },
    {
        "name": "cors",
        "description": "跨域资源共享（CORS）",
        "enable_metadata": True,
        "schema": {
            "allow_origins": {
                "type": "string",
                "description": "允许的源站",
                "examples": ["https://example.com", "*", "https://*.example.com"],
                "hints": "支持精确域名、*（允许所有）或通配符子域名"
            },
            "allow_methods": {
                "type": "array",
                "items": {"type": "string"},
                "description": "允许的 HTTP 方法",
                "examples": [["GET", "POST", "PUT", "DELETE"]],
                "hints": "逗号分隔，如需允许所有方法可设为 *"
            },
            "allow_headers": {
                "type": "array",
                "items": {"type": "string"},
                "description": "允许的请求头",
                "examples": [["Content-Type", "Authorization", "X-Request-ID"]],
                "hints": "实际请求中需要的自定义 Header"
            },
            "allow_credentials": {
                "type": "boolean",
                "description": "允许携带凭证",
                "examples": [True, False],
                "hints": "设为 true 时，allow_origins 不能为 *"
            }
        }
    },
    {
        "name": "proxy_rewrite",
        "description": "代理重写（修改请求 URI、Header、Host、协议）",
        "enable_metadata": True,
        "schema": {
            "uri": {
                "type": "string",
                "description": "目标 URI",
                "examples": ["/api/v2/users", "/new/path"],
                "hints": "支持 NGINX 变量，如 $uri、$request_uri"
            },
            "regex_uri": {
                "type": "array",
                "items": {"type": "string"},
                "description": "正则匹配 URI",
                "examples": [["^/old/(.*)", "/new/$1"], ["/api/v1/(.*)", "/api/v2/$1"]],
                "hints": "数组第一项为正则表达式，第二项为替换字符串，支持捕获组"
            },
            "headers": {
                "type": "object",
                "description": "Header 操作",
                "properties": {
                    "set": {
                        "type": "object",
                        "description": "设置/覆盖 Header",
                        "examples": [{"X-Request-ID": "abc123", "X-Custom-Header": "value"}],
                        "hints": "已存在的 Header 会被覆盖"
                    },
                    "add": {
                        "type": "object",
                        "description": "追加 Header",
                        "examples": [{"X-Appended": "value1"}, {"X-Request-Time": "$request_time"}],
                        "hints": "即使 Header 已存在也会追加新值"
                    },
                    "remove": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "删除 Header",
                        "examples": [["X-Internal", "X-Debug"]],
                        "hints": "从请求中移除指定的 Header"
                    }
                }
            },
            "host": {
                "type": "string",
                "description": "目标 Host",
                "examples": ["new-host.example.com", "$http_host"],
                "hints": "修改转发请求的 Host 头，可使用变量"
            },
            "scheme": {
                "type": "string",
                "enum": ["http", "https"],
                "description": "目标协议",
                "examples": ["https"],
                "hints": "修改转发请求的协议（http 或 https）"
            },
            "use_real_request_uri_unsafe": {
                "type": "boolean",
                "description": "使用原始 URI（不推荐）",
                "examples": [False],
                "hints": "设为 true 时使用未标准化的原始 URI，可能有安全隐患"
            }
        }
    },
    {
        "name": "limit-req",
        "description": "请求速率限制（令牌桶算法）",
        "enable_metadata": True,
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
    },
    {
        "name": "limit-conn",
        "description": "并发连接数限制",
        "enable_metadata": True,
        "schema": {
            "conn": {
                "type": "number",
                "description": "最大并发连接数",
                "examples": [100, 500, 1000],
                "hints": "允许的最大并发连接数"
            },
            "burst": {
                "type": "number",
                "description": "突发连接数",
                "examples": [50, 100],
                "hints": "允许瞬时增加的连接数"
            },
            "key": {
                "type": "string",
                "description": "限流维度",
                "enum": ["remote_addr", "server_addr"],
                "examples": ["remote_addr"],
                "hints": "通常按客户端 IP（remote_addr）限制"
            }
        }
    },
    {
        "name": "limit-count",
        "description": "时间窗口请求数限制",
        "enable_metadata": True,
        "schema": {
            "count": {
                "type": "number",
                "description": "时间窗口内允许的请求数",
                "examples": [100, 1000, 10000],
                "hints": "每个 key 在时间窗口内最多允许的请求次数"
            },
            "time_window": {
                "type": "number",
                "description": "时间窗口（秒）",
                "examples": [60, 3600, 86400],
                "hints": "时间窗口大小，单位秒，60=1分钟，3600=1小时"
            },
            "key": {
                "type": "string",
                "description": "限流维度",
                "enum": ["remote_addr", "server_addr", "uri"],
                "examples": ["remote_addr", "header:X-User-ID"],
                "hints": "按用户 ID 限流可使用 header:X-User-ID，按 IP 用 remote_addr"
            }
        }
    },
    {
        "name": "key-auth",
        "description": "API Key 认证",
        "enable_metadata": True,
        "schema": {
            "key": {
                "type": "string",
                "description": "Key 名称",
                "examples": ["apikey", "X-API-Key"],
                "hints": "客户端传递 API Key 的 Header 或参数名称"
            }
        }
    },
    {
        "name": "jwt-auth",
        "description": "JWT Token 认证",
        "enable_metadata": True,
        "schema": {
            "secret": {
                "type": "string",
                "description": "签名密钥",
                "examples": ["my-secret-key", "HS256-secret-key-12345"],
                "hints": "用于验证 JWT 签名的密钥，HS256 算法至少 32 字符"
            },
            "algorithms": {
                "type": "array",
                "items": {"type": "string"},
                "description": "支持的签名算法",
                "examples": [["HS256"], ["HS256", "RS256"], ["RS256"]],
                "hints": "推荐使用 RS256（非对称加密），HS256（对称加密）密钥需安全存储"
            }
        }
    },
    {
        "name": "basic-auth",
        "description": "Basic Auth 基本认证",
        "enable_metadata": True,
        "schema": {}
    },
    {
        "name": "response_rewrite",
        "description": "响应体重写（修改状态码、Body、Header）",
        "enable_metadata": True,
        "schema": {
            "status_code": {
                "type": "number",
                "description": "重写状态码",
                "examples": [200, 301, 302, 400, 404, 500],
                "hints": "将响应状态码修改为指定值"
            },
            "body": {
                "type": "string",
                "description": "重写响应体",
                "examples": ["{\"code\": 0, \"message\": \"success\"}", "static response text"],
                "hints": "完全替换响应体内容，支持变量"
            },
            "headers": {
                "type": "object",
                "description": "Header 操作",
                "properties": {
                    "set": {
                        "type": "object",
                        "description": "设置/覆盖 Header",
                        "examples": [{"X-Custom": "value"}, {"Cache-Control": "no-cache"}],
                        "hints": "已存在的 Header 会被覆盖"
                    },
                    "add": {
                        "type": "object",
                        "description": "追加 Header",
                        "examples": [{"X-Appended": "value"}],
                        "hints": "即使 Header 已存在也会追加新值"
                    }
                }
            }
        }
    }
]


@router.get("/builtin")
async def get_builtin_plugins():
    return {"plugins": BUILTIN_PLUGINS}
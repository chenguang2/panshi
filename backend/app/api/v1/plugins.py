from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db

router = APIRouter(prefix="/plugins", tags=["plugins"])


BUILTIN_PLUGINS = [
    {
        "name": "proxy_rewrite",
        "description": "代理重写（修改请求 URI、Header、Host、协议）",
        "enable_metadata": False,
        "schema": {
            "uri": {
                "type": "string",
                "description": "目标 URI",
                "examples": ["/api/v2/users", "/new/path"],
                "hints": "转发到上游的新 uri 地址，支持 NGINX 变量"
            },
            "regex_uri": {
                "type": "array",
                "items": {"type": "string"},
                "description": "正则匹配 URI",
                "examples": [["^/old/(.*)", "/new/$1"], ["^/test/(.*)/(.*)/(.*)", "/test1/$1-$2-$3"]],
                "hints": "使用正则替换 URI，第一项为正则，第二项为替换模板。优先级: uri > regex_uri"
            },
            "headers": {
                "type": "object",
                "description": "请求 Header",
                "examples": [{"version": "v1", "X-Custom": "value"}],
                "hints": "转发到上游的新 headers，可以设置多个"
            },
            "method": {
                "type": "string",
                "enum": ["", "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "CONNECT", "TRACE"],
                "description": "重写 HTTP 方法",
                "examples": ["POST"],
                "hints": "将路由的请求方法代理为该请求方法"
            },
            "host": {
                "type": "string",
                "description": "目标 Host",
                "examples": ["new-host.example.com"],
                "hints": "转发到上游的新 host 地址"
            },
            "scheme": {
                "type": "string",
                "enum": ["", "http", "https"],
                "default": "http",
                "description": "目标协议",
                "examples": ["https"],
                "hints": "转发到上游的新 scheme，默认 http"
            }
        }
    },
    {
        "name": "response_rewrite",
        "description": "响应体重写（修改状态码、Body、Header）",
        "enable_metadata": False,
        "schema": {
            "status_code": {
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
                "description": "Header 操作（设置/覆盖）",
                "properties": {
                    "set": {
                        "type": "object",
                        "description": "设置/覆盖 Header",
                        "examples": [{"X-Custom": "value"}, {"Cache-Control": "no-cache"}],
                        "hints": "已存在的 Header 会被覆盖"
                    }
                }
            },
            "add_headers": {
                "type": "object",
                "description": "追加 Header（不覆盖已有值）",
                "examples": [{"X-Appended": "value"}],
                "hints": "即使 Header 已存在也会追加新值"
            },
            "regex_body": {
                "type": "array",
                "items": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "description": "正则替换响应体",
                "examples": [[["old_pattern", "new_value"]]],
                "hints": "对响应体进行正则匹配替换"
            },
            "plain_text": {
                "type": "boolean",
                "description": "响应体是否为纯文本",
                "examples": [True, False],
                "hints": "设为 true 时，响应体以纯文本方式处理"
            }
        }
    },
    {
        "name": "traffic_split",
        "description": "流量分发（按条件将请求分发到不同的上游）",
        "enable_metadata": False,
        "schema": {
            "splits": {
                "type": "array",
                "description": "分发策略列表",
                "items": {
                    "type": "object",
                    "description": "单个分发策略",
                    "properties": {
                        "ups_expr": {
                            "type": "array",
                            "description": "条件表达式",
                            "examples": [[["arg_dc", "==", "1"]]],
                            "hints": "满足表达式时使用该策略的上游，未配置时视为条件成立"
                        },
                        "upstreams": {
                            "type": "array",
                            "description": "上游负载列表",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "upstream_id": {
                                        "type": "string",
                                        "description": "上游 ID",
                                        "examples": ["ups_test1"],
                                        "hints": "未配置时使用当前路由的负载"
                                    },
                                    "weight": {
                                        "type": "integer",
                                        "default": 1,
                                        "description": "权重",
                                        "examples": [1, 2, 3],
                                        "hints": "默认值为 1，用于多上游流量分配"
                                    }
                                }
                            },
                            "hints": "可以配置多个上游，按权重分配流量"
                        }
                    }
                },
                "examples": [[{
                    "ups_expr": [["arg_dc", "==", "1"]],
                    "upstreams": [{"upstream_id": "ups_test1"}]
                }, {
                    "ups_expr": [["arg_dc", "==", "2"]],
                    "upstreams": [{"upstream_id": "ups_test2"}]
                }, {
                    "ups_expr": [["arg_dc", "==", "12"]],
                    "upstreams": [
                        {"upstream_id": "ups_test1", "weight": 1},
                        {"upstream_id": "ups_test2", "weight": 2},
                        {"weight": 3}
                    ]
                }]],
                "hints": "可以配置复数个分发策略，按顺序匹配"
            }
        }
    },
    {
        "name": "data_center",
        "description": "数据中心（集中管理其他插件的数据属性）",
        "enable_metadata": True,
        "schema": {}
    },
    {
        "name": "log_process",
        "description": "日志记录（将请求信息按指定格式记录到文件）",
        "enable_metadata": True,
        "schema": {
            "logs": {
                "type": "array",
                "items": {"type": "string"},
                "default": ["logs/process.log"],
                "description": "日志文件路径",
                "examples": [["logs/process.log"], ["logs/process.log", "logs/access.log"]],
                "hints": "日志记录的文件，可以配置一个或多个"
            },
            "cache_duration": {
                "type": "integer",
                "default": 1,
                "description": "缓存时长（秒）",
                "examples": [1, 0],
                "hints": "是否先缓存再写入文件日志，0 表示直接写入文件，默认 1"
            },
            "include_req_body": {
                "type": "boolean",
                "default": False,
                "description": "是否记录请求体",
                "examples": [False, True],
                "hints": "标准日志中是否记录请求体，默认 false"
            },
            "include_req_body_expr": {
                "type": "array",
                "description": "条件表达式（满足时才记录请求体）",
                "examples": [[["arg_debug", "==", "1"]]],
                "hints": "需要开启 include_req_body 才生效"
            }
        }
    },
    {
        "name": "traffic_limit_count",
        "description": "时间窗口请求数限制（按 key 计数限流）",
        "enable_metadata": False,
        "schema": {
            "limits": {
                "type": "array",
                "description": "限制策略",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": {
                            "type": "string",
                            "description": "计数依据",
                            "examples": ["${remote_addr}", "${arg_user_id}"],
                            "hints": "用于做请求计数的依据，如 ${remote_addr} 按用户 IP"
                        },
                        "count": {
                            "type": "integer",
                            "description": "阈值",
                            "examples": [5, 100],
                            "hints": "时间窗口内的请求数量阈值，必须大于 0"
                        },
                        "window": {
                            "type": "integer",
                            "description": "时间窗口（秒）",
                            "examples": [10, 60],
                            "hints": "超过这个时间就会重置计数"
                        }
                    }
                },
                "examples": [[{"key": "${remote_addr}", "count": 2, "window": 5}]],
                "hints": "可以配置多条限制策略"
            },
            "group": {
                "type": "string",
                "description": "共享组名",
                "examples": ["global_limit"],
                "hints": "多个路由配置相同 group，将共享同样的限流计数器"
            },
            "policy": {
                "type": "string",
                "enum": ["local", "redis"],
                "default": "local",
                "description": "计数器策略",
                "examples": ["local", "redis"],
                "hints": "local 内存方式，redis 全局限速，默认 local"
            },
            "redis_conf": {
                "type": "object",
                "description": "Redis 连接配置",
                "properties": {
                    "CLUSTER_DEF": {
                        "type": "array",
                        "description": "服务器列表",
                        "examples": [[["127.0.0.1", 6379]]],
                        "hints": "组名为 DEF，可配置一个或多个节点"
                    },
                    "MODE": {
                        "type": "string",
                        "enum": ["redis", "rediscluster"],
                        "description": "Redis 类型",
                        "examples": ["redis"],
                        "hints": "redis 或 rediscluster"
                    },
                    "AUTH": {
                        "type": "string",
                        "description": "Redis 密钥",
                        "examples": ["your-redis-password"]
                    },
                    "DATABASE": {
                        "type": "integer",
                        "description": "Redis DB",
                        "examples": [0, 1],
                        "hints": "默认 0"
                    },
                    "TIMEOUT": {
                        "type": "number",
                        "description": "连接超时（秒）",
                        "examples": [0.05],
                        "hints": "默认 0.05 秒"
                    }
                },
                "hints": "policy 为 redis 时需要配置此项"
            },
            "redis_dc": {
                "type": "string",
                "description": "Redis 数据中心标识",
                "examples": ["TEST", "DC1"],
                "hints": "如果 redis_conf 配置了多组服务器，需要指定服务器组名"
            },
            "bypass_missing_key": {
                "type": "boolean",
                "default": True,
                "description": "缺少 key 时是否忽略",
                "examples": [True, False],
                "hints": "当计数 key 不存在时是否忽略，默认 true，设为 false 按空值统计"
            },
            "bypass_error_limit": {
                "type": "boolean",
                "default": True,
                "description": "出错时是否忽略",
                "examples": [True, False],
                "hints": "Redis 异常时是否忽略，默认 true，设为 false 会返回 500"
            },
            "show_resp_limit_header": {
                "type": "boolean",
                "default": False,
                "description": "显示剩余次数响应头",
                "examples": [False, True],
                "hints": "是否在响应头中显示 X-EDGE-LimitCount-Remaining，默认 false"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截状态码",
                "examples": [403, 429],
                "hints": "触发限流后响应的状态码，默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截提示信息",
                "examples": ["请求过于频繁，请稍后再试"],
                "hints": "触发限流后响应的提示信息"
            }
        }
    },
    {
        "name": "pre_functions",
        "description": "自定义预处理方法（在指定阶段执行 Lua 函数）",
        "enable_metadata": False,
        "schema": {
            "rewrite": {
                "type": "array",
                "items": {"type": "string"},
                "description": "rewrite 阶段自定义方法",
                "examples": [["return function(conf, ctx) ngx.log(ngx.ERR, 'hello'); end"]],
                "hints": "在 rewrite 阶段执行的自定义 Lua 方法列表"
            },
            "access": {
                "type": "array",
                "items": {"type": "string"},
                "description": "access 阶段自定义方法",
                "examples": [["return function(conf, ctx) return 200, 'OK'; end"]],
                "hints": "在 access 阶段执行的自定义 Lua 方法列表，返回 status 和 message 可中断请求"
            },
            "header_filter": {
                "type": "array",
                "items": {"type": "string"},
                "description": "header_filter 阶段自定义方法",
                "examples": [["return function(conf, ctx) ctx.var.fpre_flag = '1'; end"]],
                "hints": "在 header_filter 阶段执行的自定义 Lua 方法列表"
            },
            "body_filter": {
                "type": "array",
                "items": {"type": "string"},
                "description": "body_filter 阶段自定义方法",
                "examples": [["return function(conf, ctx) end"]],
                "hints": "在 body_filter 阶段执行的自定义 Lua 方法列表"
            },
            "log": {
                "type": "array",
                "items": {"type": "string"},
                "description": "log 阶段自定义方法",
                "examples": [["return function(conf, ctx) ngx.log(ngx.ERR, 'logged'); end"]],
                "hints": "在 log 阶段执行的自定义 Lua 方法列表"
            }
        }
    },
    {
        "name": "traceid",
        "description": "TraceID 追踪（在请求头中注入唯一追踪 ID）",
        "enable_metadata": False,
        "schema": {
            "header_name": {
                "type": "string",
                "default": "X-EDGE-TraceID",
                "description": "TraceID 写入 Header 中的字段名",
                "examples": ["X-EDGE-TraceID", "X-Request-ID"],
                "hints": "traceid 写入 header 中的字段名，默认 X-EDGE-TraceID"
            },
            "ignore_header": {
                "type": "boolean",
                "default": False,
                "description": "如果请求头中已有 TraceID 是否覆盖",
                "examples": [False, True],
                "hints": "设为 true 时不覆盖已有值，默认 false"
            },
            "show_resp_header": {
                "type": "boolean",
                "default": False,
                "description": "是否将 TraceID 写入响应头",
                "examples": [False, True],
                "hints": "设为 true 时在响应头中显示 traceid，默认 false"
            }
        }
    },
    {
        "name": "monitor",
        "description": "监控统计（收集请求指标数据）",
        "enable_metadata": False,
        "schema": {
            "prefer_name": {
                "type": "boolean",
                "default": False,
                "description": "是否使用路由名称标识路由",
                "examples": [False, True],
                "hints": "设为 true 时使用路由名称而非 ID 标识，默认 false"
            }
        }
    }
]


@router.get("/builtin")
async def get_builtin_plugins():
    return {"plugins": BUILTIN_PLUGINS}
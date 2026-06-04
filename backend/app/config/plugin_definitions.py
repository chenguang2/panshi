BUILTIN_PLUGINS = [
    {
        "name": "proxy_rewrite",
        "display_name": "代理重写",
        "category": "rewrite",
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
        "display_name": "响应体重写",
        "category": "rewrite",
        "description": "响应体重写（修改状态码、Body、Header）",
        "enable_metadata": False,
        "schema": {
            "status": {
                "type": "integer",
                "description": "重写的 HTTP 响应状态码（支持 200-599）",
                "examples": [200, 301, 302, 400, 404, 500],
                "hints": "将响应状态码修改为指定值，支持 200 到 599"
            },
            "add_headers": {
                "type": "object",
                "description": "在原有响应头基础上追加的标头键值对",
                "examples": [{"X-Add-Header": "Edge"}],
                "hints": "不覆盖已有标头，追加新标头"
            },
            "headers": {
                "type": "object",
                "description": "覆盖或设置的响应标头键值对（如果原来已有则修改）",
                "examples": [{"Server": "Edge-Gateway"}],
                "hints": "直接设置响应标头，已有标头会被覆盖"
            },
            "body": {
                "type": "string",
                "description": "用来替换原始后端响应体的内容，支持 Nginx/Edge 变量",
                "examples": ["This request was intercepted and rewritten by Edge. Client IP: ${remote_addr}"],
                "hints": "完全替换响应体内容，支持 ${host}、${remote_addr} 等变量"
            },
            "regex_body": {
                "type": "array",
                "items": {
                    "type": "array",
                    "items": {}
                },
                "description": "正则替换响应体，每项格式为 [正则, 替换字符串, 替换次数]",
                "examples": [[["World", "Edge", 1]]],
                "hints": "对响应体进行正则匹配替换，每项 [reg, replacement, count]，count 默认 0 表示全部替换"
            },
            "plain_text": {
                "type": "boolean",
                "default": False,
                "description": "响应体是否为纯文本，设为 true 时不对 body 中的变量进行解析",
                "examples": [True, False],
                "hints": "设为 true 时响应体以纯文本方式处理，变量不解析"
            },
            "include_add_headers_expr": {
                "type": "array",
                "description": "条件表达式，仅在满足条件时执行 add_headers",
                "examples": [[["status", "==", 200]]],
                "hints": "满足条件时才追加标头"
            },
            "include_headers_expr": {
                "type": "array",
                "description": "条件表达式，仅在满足条件时执行 headers 修改",
                "examples": [[["status", "==", 200]]],
                "hints": "满足条件时才修改标头"
            },
            "include_body_expr": {
                "type": "array",
                "description": "条件表达式，仅在满足条件时执行 body 和 regex_body 替换",
                "examples": [[["status", "==", 200]]],
                "hints": "满足条件时才替换响应体"
            },
            "method_override": {
                "type": "object",
                "description": "按请求方法指定不同的重写规则，键为方法名（如 GET、POST），值为包含 status/body/headers 等配置的对象",
                "examples": [{"GET": {"status": 201}}],
                "hints": "可以指定特定请求方法（如 GET、POST）作为键名，值为对应的重写配置"
            }
        }
    },
    {
        "name": "traffic_split",
        "display_name": "流量分发",
        "category": "flow",
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
                                        "component": "select",
                                        "description": "上游 ID，从下拉列表中选择系统已注册的上游",
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
        "display_name": "数据中心",
        "category": "process",
        "description": "数据中心（集中管理其他插件的数据属性）",
        "enable_metadata": True,
        "schema": {}
    },
    {
        "name": "log_process",
        "display_name": "日志记录",
        "category": "process",
        "description": "日志记录（将请求信息按指定格式记录到文件）",
        "enable_metadata": True,
        "schema": {
            "logs": {
                "type": "array",
                "items": {"type": "string"},
                "default": ["logs/process.log"],
                "description": "日志文件路径",
                "examples": [["logs/process.log"], ["logs/process.log", "logs/access.log"]],
                "hints": "日志记录的文件，可以配置一个或多个。如要自定义日志格式（formats、formats_sep 等），请在'插件元数据'中配置 log_process 的全局属性"
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
        },
        "metadata_schema": {
            "logs": {
                "type": "object",
                "description": "日志格式模板，键为日志文件路径，值为格式配置",
                "examples": [{"logs/process.log": {"formats": ["${req_start_time#time_format,%Y%m%d%H%M%S,%03d}", "${clientip}", "${cookie_X-EDGE-SESSIONID}", "${method}", "${uri}", "${request_time}", "${status}", "${upstream_addr}"]}}],
                "hints": "键为日志文件名，值为包含 formats（格式串或数组）和 formats_sep（分隔符）的对象"
            },
            "formats_sep": {
                "type": "string",
                "default": "|;",
                "description": "日志格式分隔符",
                "examples": ["|;", ","],
                "hints": "拼接数组格式的各日志项，默认 |;"
            }
        }
    },
    {
        "name": "traffic_limit_count",
        "display_name": "请求数限流",
        "category": "flow",
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
        "display_name": "自定义预处理",
        "category": "process",
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
        "display_name": "TraceID 追踪",
        "category": "monitor",
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
        "display_name": "监控统计",
        "category": "monitor",
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
    },
    {
        "name": "static_resource",
        "display_name": "静态资源服务",
        "category": "static",
        "description": "静态资源服务（从本地文件系统响应静态文件请求，支持缓存控制和 MIME 类型）",
        "enable_metadata": False,
        "schema": {
            "cache_max_age": {
                "type": "integer",
                "default": 3600,
                "minimum": 0,
                "description": "缓存时间（秒）",
                "examples": [3600, 86400],
                "hints": "Cache-Control max-age，单位秒，默认 3600"
            },
            "index_file": {
                "type": "string",
                "default": "index.html",
                "description": "默认首页文件",
                "examples": ["index.html"],
                "hints": "访问目录时默认返回的文件名"
            }
        }
    },
    {
        "name": "security_common_body",
        "display_name": "Body 检查",
        "category": "security",
        "description": "安全防护 - Body 检查（对请求体内容进行关键字匹配和拦截）",
        "enable_metadata": True,
        "schema": {
            "denylist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "黑名单列表，匹配 body 中的关键字，命中后拦截用户请求",
                "examples": [["jndi\\:(?:ldap|rmi|iiop|iiopname|corbaname|dns|nis)", "\\.\\./", "\\$\\{"]],
                "hints": "匹配请求体中的关键字，由正则表达式组成的黑名单列表"
            },
            "maxsize": {
                "type": "integer",
                "default": 4096,
                "description": "请求体大小（字节），超过限制大小的不进行匹配",
                "examples": [4096, 8192],
                "hints": "超过此大小的请求体不进行关键字匹配，默认 4096"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "命中黑名单后返回的 HTTP 状态码，默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request data is not allowed"],
                "hints": "命中黑名单后返回的提示信息"
            },
            "bypass_hugebody": {
                "type": "boolean",
                "default": True,
                "description": "当请求体大小超过 maxsize 时是否绕过检查",
                "examples": [True, False],
                "hints": "设为 true 时，请求体超限则直接放行；设为 false 时，超限也检查，默认 true"
            }
        }
    },
    {
        "name": "security_corerule",
        "display_name": "WAF 安全引擎",
        "category": "security",
        "description": "安全防护 - OWASP Core Rule Set 安全引擎（WAF）",
        "enable_metadata": True,
        "schema": {
            "status": {
                "type": "integer",
                "default": 403,
                "description": "被安全规则拦截后的 HTTP 响应状态码，支持 200-599",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "被安全规则拦截后返回的错误信息",
                "examples": ["Access Denied by WAF."],
                "hints": "拦截后返回给客户端的提示信息"
            },
            "log_matched_maxsize": {
                "type": "integer",
                "default": 128,
                "description": "最大写入日志的匹配内容大小",
                "examples": [128, 256],
                "hints": "默认 128"
            },
            "ignore_rule": {
                "type": "array",
                "items": {"type": "string"},
                "description": "忽略（不检查）的规则 ID 列表",
                "examples": [["920420"]],
                "hints": "跳过指定的规则 ID"
            },
            "ignore_ruleset": {
                "type": "array",
                "items": {"type": "string"},
                "description": "忽略的整个规则集名称列表",
                "examples": [["REQUEST-920-PROTOCOL-ENFORCEMENT"]],
                "hints": "跳过指定的规则集"
            },
            "parseargs_decoders": {
                "type": "array",
                "items": {"type": "string"},
                "default": ["hex", "base64"],
                "description": "用于参数解析的解码器列表",
                "examples": [["hex", "base64"]],
                "hints": "默认 hex, base64"
            },
            "parseargs_collections": {
                "type": "array",
                "items": {"type": "string"},
                "default": ["URI_ARGS", "REQUEST_ARGS"],
                "description": "参与参数解析的采集集合项",
                "examples": [["REQUEST_ARGS"]],
                "hints": "默认 URI_ARGS, REQUEST_ARGS"
            },
            "disable_parseargs_decoders": {
                "type": "boolean",
                "default": True,
                "description": "是否完全禁用参数解码处理器",
                "examples": [True, False],
                "hints": "默认 true"
            }
        }
    },
    {
        "name": "auth_basic",
        "display_name": "Basic 认证",
        "category": "auth",
        "description": "Basic 认证",
        "enable_metadata": False,
        "schema": {
            "hide_credentials": {
                "type": "boolean",
                "default": False,
                "description": "是否将认证信息透传给 Upstream",
                "examples": [True, False],
                "hints": "设为 true 时清除认证信息，不传递给上游，默认 false"
            }
        }
    },
    {
        "name": "auth_key",
        "display_name": "Key 认证",
        "category": "auth",
        "description": "Key 认证",
        "enable_metadata": False,
        "schema": {
            "header": {
                "type": "string",
                "default": "apikey",
                "description": "从 Header 中获取 API Key 的字段名",
                "examples": ["apikey", "x-apikey"],
                "hints": "从指定 Header 字段获取 API Key，默认 apikey"
            },
            "query": {
                "type": "string",
                "default": "apikey",
                "description": "从 URL 参数中获取 API Key 的字段名",
                "examples": ["apikey", "x-apikey"],
                "hints": "从指定 URL 参数获取 API Key，默认 apikey。优先级 header > query"
            },
            "hide_credentials": {
                "type": "boolean",
                "default": False,
                "description": "是否将 Key 透传给 Upstream",
                "examples": [True, False],
                "hints": "设为 true 时清除 Key，不传递给上游，默认 false"
            }
        }
    },
    {
        "name": "cors",
        "display_name": "跨域资源共享",
        "category": "rewrite",
        "description": "跨域资源共享（CORS）",
        "enable_metadata": False,
        "schema": {
            "allow_origins": {
                "type": "string",
                "default": "*",
                "description": "允许跨域访问的 Origin，多个用逗号分隔",
                "examples": ["*", "http://test.local"],
                "hints": "使用 * 表示允许所有，格式为 scheme://host:port"
            },
            "allow_methods": {
                "type": "string",
                "default": "*",
                "description": "允许跨域访问的 Method，多个用逗号分隔",
                "examples": ["*", "GET, POST, OPTIONS"],
                "hints": "使用 * 表示允许所有"
            },
            "allow_headers": {
                "type": "string",
                "default": "*",
                "description": "允许跨域访问的 Header，多个用逗号分隔",
                "examples": ["*", "Content-Type, Accept"],
                "hints": "使用 * 表示允许所有"
            },
            "expose_headers": {
                "type": "string",
                "default": "*",
                "description": "允许跨域访问时响应方携带的 Header，多个用逗号分隔",
                "examples": ["*", "Content-Encoding"],
                "hints": "使用 * 表示允许任意 Header"
            },
            "max_age": {
                "type": "integer",
                "default": 5,
                "description": "浏览器缓存 CORS 结果的最大时间（秒），-1 表示不缓存",
                "examples": [5, 60, -1],
                "hints": "单位秒，默认 5"
            },
            "allow_credential": {
                "type": "boolean",
                "default": False,
                "description": "是否允许跨域访问的请求方携带凭据（如 Cookie）",
                "examples": [True, False],
                "hints": "设为 true 时 allow_origins 等属性不能使用 *"
            },
            "allow_origins_by_regex": {
                "type": "array",
                "items": {"type": "string"},
                "description": "使用正则表达式数组来匹配允许跨域访问的 Origin",
                "examples": [[".*\\.test\\.local$"]],
                "hints": "指定后忽略 allow_origins 属性"
            }
        }
    },
    {
        "name": "security_common_args",
        "display_name": "请求参数检查",
        "category": "security",
        "description": "安全防护 - 请求参数检查（对请求参数进行关键字匹配和拦截）",
        "enable_metadata": True,
        "schema": {
            "denylist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "黑名单列表，匹配请求参数中的关键字，命中后拦截",
                "examples": [["jndi\\:(?:ldap|rmi|iiop)", "\\.\\./", "\\$\\{"]],
                "hints": "由正则表达式组成的黑名单列表"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request args is not allowed"],
                "hints": "命中黑名单后返回的提示信息"
            }
        }
    },
    {
        "name": "security_common_cookie",
        "display_name": "Cookie 检查",
        "category": "security",
        "description": "安全防护 - Cookie 检查（对请求 Cookie 进行关键字匹配和拦截）",
        "enable_metadata": True,
        "schema": {
            "denylist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "黑名单列表，匹配 Cookie 中的关键字，命中后拦截",
                "examples": [["jndi\\:(?:ldap|rmi|iiop)", "\\.\\./", "\\$\\{"]],
                "hints": "由正则表达式组成的黑名单列表"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request cookie is not allowed"],
                "hints": "命中黑名单后返回的提示信息"
            },
            "bypass_missing": {
                "type": "boolean",
                "default": True,
                "description": "Cookie 请求头不存在或格式有误时是否绕过检查",
                "examples": [True, False],
                "hints": "默认 true"
            }
        }
    },
    {
        "name": "security_common_referer",
        "display_name": "Referer 检查",
        "category": "security",
        "description": "安全防护 - Referer 检查（对请求 Referer 进行关键字匹配和拦截）",
        "enable_metadata": True,
        "schema": {
            "denylist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "黑名单列表，匹配 Referer 中的关键字，命中后拦截",
                "examples": [["(?:(\\!\\=|\\&\\&|\\|\\||>>|<<|>=|<=|<>|<=>|xor|rlike|regexp|isnull)"]],
                "hints": "匹配 Referer 正文的关键字"
            },
            "blacklist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Host 黑名单列表，匹配 Referer 中的 Host，命中后拦截",
                "examples": [["*.zengbiao1.local"]],
                "hints": "匹配 Referer 的 Host 部分"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request referer is not allowed"],
                "hints": "命中黑名单后返回的提示信息"
            },
            "bypass_missing": {
                "type": "boolean",
                "default": True,
                "description": "Referer 请求头不存在或格式有误时是否绕过检查",
                "examples": [True, False],
                "hints": "默认 true"
            }
        }
    },
    {
        "name": "security_common_uri",
        "display_name": "URI 检查",
        "category": "security",
        "description": "安全防护 - URI 检查（对请求 URI 进行关键字匹配和拦截）",
        "enable_metadata": True,
        "schema": {
            "denylist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "黑名单列表，匹配 URI 中的关键字，命中后拦截",
                "examples": [["jndi\\:(?:ldap|rmi|iiop)", "\\.(?:svn|htaccess|bash_history)"]],
                "hints": "由正则表达式组成的黑名单列表"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request uri is not allowed"],
                "hints": "命中黑名单后返回的提示信息"
            }
        }
    },
    {
        "name": "security_common_useragent",
        "display_name": "User-Agent 检查",
        "category": "security",
        "description": "安全防护 - User-Agent 检查（对请求 User-Agent 进行关键字匹配和拦截）",
        "enable_metadata": True,
        "schema": {
            "denylist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "黑名单列表，匹配 User-Agent 中的关键字，命中后拦截",
                "examples": [["jndi\\:(?:ldap|rmi|iiop)", "\\.(?:svn|htaccess|bash_history)"]],
                "hints": "由正则表达式组成的黑名单列表"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request useragent is not allowed"],
                "hints": "命中黑名单后返回的提示信息"
            },
            "bypass_missing": {
                "type": "boolean",
                "default": False,
                "description": "User-Agent 请求头不存在或格式有误时是否绕过检查",
                "examples": [True, False],
                "hints": "默认 false"
            }
        }
    },
    {
        "name": "security_restrict_ip",
        "display_name": "IP 黑白名单",
        "category": "security",
        "description": "安全防护 - IP 黑白名单（通过黑白名单限制 IP 访问）",
        "enable_metadata": True,
        "schema": {
            "blacklist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IP 黑名单列表，匹配到的 IP 将被拦截",
                "examples": [["192.168.1.1", "10.0.0.0/8"]],
                "hints": "支持 IP 和 CIDR 格式"
            },
            "whitelist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "IP 白名单列表，不在其中的将被拦截",
                "examples": [["192.168.1.0/24"]],
                "hints": "黑白名单不应同时配置，优先按黑名单处理"
            },
            "key": {
                "type": "string",
                "default": "${remote_addr}",
                "description": "指定 IP 的来源变量",
                "examples": ["${remote_addr}", "${arg_client_ip}"],
                "hints": "指定从何处获取客户端 IP"
            },
            "bypass_missing_key": {
                "type": "boolean",
                "default": True,
                "description": "指定的 key 不存在时是否不进行卡控",
                "examples": [True, False],
                "hints": "默认 true"
            },
            "bypass_error_key": {
                "type": "boolean",
                "default": True,
                "description": "指定的 key 异常时是否不进行卡控",
                "examples": [True, False],
                "hints": "默认 true"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request ip is not allowed"],
                "hints": "命中后返回的提示信息"
            }
        }
    },
    {
        "name": "security_restrict_uri",
        "display_name": "URI 白名单",
        "category": "security",
        "description": "安全防护 - URI 白名单（限制不在指定列表里的请求）",
        "enable_metadata": True,
        "schema": {
            "whitelist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "URI 白名单列表，不在其中的将被拦截",
                "examples": [["/hello1/h1", "/hello1/h2"]],
                "hints": "只允许列表中的 URI 通过"
            },
            "key": {
                "type": "string",
                "default": "${uri}",
                "description": "指定 URI 的来源变量",
                "examples": ["${uri}", "${operationType}"],
                "hints": "指定从何处获取 URI"
            },
            "bypass_missing_key": {
                "type": "boolean",
                "default": True,
                "description": "指定的 key 不存在时是否不进行卡控",
                "examples": [True, False],
                "hints": "默认 true"
            },
            "bypass_error_key": {
                "type": "boolean",
                "default": True,
                "description": "指定的 key 异常时是否不进行卡控",
                "examples": [True, False],
                "hints": "默认 true"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request uri is not allowed"],
                "hints": "命中后返回的提示信息"
            }
        }
    },
    {
        "name": "security_restrict_form",
        "display_name": "表单限制",
        "category": "security",
        "description": "安全防护 - 表单限制（限制 multipart/form-data 类型的请求）",
        "enable_metadata": True,
        "schema": {
            "body_size": {
                "type": "integer",
                "default": -1,
                "description": "允许发送的总请求体大小（字节），-1 表示不限制",
                "examples": [-1, 1024, 4096],
                "hints": "单位字节，-1 不限制"
            },
            "text_name": {
                "type": "object",
                "description": "允许发送的字段名，包含 blacklist/whitelist 规则",
                "properties": {
                    "blacklist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "字段名黑名单正则"
                    },
                    "whitelist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "字段名白名单正则"
                    }
                },
                "examples": [{"blacklist": ["[+*?@#]+"]}],
                "hints": "通过正则表达式限制字段名"
            },
            "text_body": {
                "type": "object",
                "description": "允许发送的字段内容，包含 blacklist/whitelist 规则",
                "properties": {
                    "blacklist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "字段内容黑名单正则"
                    },
                    "whitelist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "字段内容白名单正则"
                    }
                },
                "examples": [{"blacklist": ["\\b(?:etc\\/\\W*passwd)"]}],
                "hints": "通过正则表达式限制字段内容"
            },
            "text_size": {
                "type": "integer",
                "default": -1,
                "description": "允许发送的每个字段的大小（字节），-1 表示不限制",
                "examples": [-1, 1024],
                "hints": "单位字节，-1 不限制"
            },
            "file_name": {
                "type": "object",
                "description": "允许发送的文件名，包含 blacklist/whitelist 规则",
                "properties": {
                    "blacklist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "文件名黑名单正则"
                    },
                    "whitelist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "文件名白名单正则"
                    }
                },
                "examples": [{"blacklist": [".*\\.exe"]}],
                "hints": "通过正则表达式限制文件名"
            },
            "file_type": {
                "type": "object",
                "description": "允许发送的文件类型（MIME），包含 blacklist/whitelist 规则",
                "properties": {
                    "blacklist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "文件类型黑名单正则"
                    },
                    "whitelist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "文件类型白名单正则"
                    }
                },
                "examples": [{"blacklist": ["video/.*", "text/html"]}],
                "hints": "通过正则表达式限制 MIME 类型"
            },
            "file_body": {
                "type": "object",
                "description": "允许发送的文件内容，包含 blacklist/whitelist 规则",
                "properties": {
                    "blacklist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "文件内容黑名单正则"
                    },
                    "whitelist": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "文件内容白名单正则"
                    }
                },
                "examples": [{"blacklist": ["\\bsleep\\((\\s*)(\\d*)(\\s*)\\)"]}],
                "hints": "通过正则表达式限制文件内容"
            },
            "file_size": {
                "type": "integer",
                "default": -1,
                "description": "允许发送的单个文件的大小（字节），-1 表示不限制",
                "examples": [-1, 1000],
                "hints": "单位字节，-1 不限制"
            },
            "bypass_wrong_method": {
                "type": "boolean",
                "default": True,
                "description": "请求方法不是 POST 时是否允许访问",
                "examples": [True, False],
                "hints": "设为 false 时会限制非 POST 请求"
            },
            "bypass_mutil_content_type": {
                "type": "boolean",
                "default": True,
                "description": "请求头中包含多个 Content-Type 时是否允许访问",
                "examples": [True, False],
                "hints": "设为 false 时会限制含多个 Content-Type 的请求"
            },
            "bypass_wrong_content_type": {
                "type": "boolean",
                "default": True,
                "description": "Content-Type 不是 multipart/form-data 时是否允许访问",
                "examples": [True, False],
                "hints": "设为 false 时会限制非 multipart/form-data 请求"
            },
            "bypass_wrong_body": {
                "type": "boolean",
                "default": True,
                "description": "请求体不满足 multipart/form-data 格式时是否允许访问",
                "examples": [True, False],
                "hints": "设为 false 时会限制格式错误的请求"
            },
            "status": {
                "type": "integer",
                "default": 403,
                "description": "拦截后响应的状态码",
                "examples": [403, 406],
                "hints": "默认 403"
            },
            "message": {
                "type": "string",
                "description": "拦截后响应的信息",
                "examples": ["Your request is not allowed"],
                "hints": "命中后返回的提示信息"
            }
        }
    },
    {
        "name": "security_super_ip",
        "display_name": "高级 IP",
        "category": "security",
        "description": "安全防护 - 高级 IP（指定 IP 不受其他插件限制）",
        "enable_metadata": True,
        "schema": {
            "superlist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "高级 IP 列表，匹配到的 IP 不再检查指定的安全类插件",
                "examples": [["192.168.1.1", "10.0.0.0/8"]],
                "hints": "支持 IP 和 CIDR 格式"
            },
            "key": {
                "type": "string",
                "description": "指定 IP 的来源变量",
                "examples": ["${remote_addr}"],
                "hints": "指定从何处获取客户端 IP"
            },
            "ignore_plugins": {
                "type": "array",
                "items": {"type": "string"},
                "description": "匹配到的高级 IP 可以跳过哪些插件",
                "examples": [["traffic_limit_count"]],
                "hints": "只有优先级在此插件之后的才有效"
            }
        }
    },
    {
        "name": "security_super_user",
        "display_name": "高级用户",
        "category": "security",
        "description": "安全防护 - 高级用户（指定用户不受其他插件限制）",
        "enable_metadata": True,
        "schema": {
            "superlist": {
                "type": "array",
                "items": {"type": "string"},
                "description": "高级用户列表，匹配到的用户不再检查指定的安全类插件",
                "examples": [["33bb", "44dd"]],
                "hints": "通过 key 指定的来源匹配用户"
            },
            "key": {
                "type": "string",
                "description": "指定用户的来源变量",
                "examples": ["${arg_username}"],
                "hints": "指定从何处获取用户标识"
            },
            "ignore_plugins": {
                "type": "array",
                "items": {"type": "string"},
                "description": "匹配到的高级用户可以跳过哪些插件",
                "examples": [["traffic_limit_count"]],
                "hints": "只有优先级在此插件之后的才有效"
            }
        }
    }
]

# zip_utils.lua — Edge 节点 ZIP 解析工具

## 概述

Edge 节点（OpenResty/LuaJIT）上接收并处理 ZIP 包的纯 Lua 工具库。依赖 `inflate.lua`（TohruMKDM/lua-inflate，MIT 协议，纯 Lua，单文件 14KB，零 C 扩展），提供校验、列文件、提取等操作。

所有公共函数使用 `return nil, err` 双值模式，不抛异常，与 APISIX 错误处理风格一致。

## 文件结构

```
edge_node/
├── lib/
│   ├── inflate.lua       ← ZIP 底层解析库（vendored，勿修改）
│   └── zip_utils.lua     ← 上层封装工具模块
├── handlers/
│   └── admin_static_resources.lua  ← PUT 端点示例 handler
├── tests/
│   ├── gen_test_zip.py   ← Python 测试 ZIP 生成器
│   ├── test_zip_utils.lua ← Lua 单元测试
│   └── verify_test_data.py ← Python 验证脚本
└── docs/
    └── zip_utils_usage.md ← 本文档
```

## 环境要求

- OpenResty 1.19+ / LuaJIT（需要 `bit` 库，LuaJIT 内置）
- `inflate.lua` 必须在 `package.path` 中可加载
- `cjson` 库（handler 中使用，若只调 `zip_utils` 则不需要）

## API 参考

### `zip_utils.is_zip(data)`

检查字节流是否为合法 ZIP 文件。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| data | string | ZIP 字节流 |

**返回：**
| 返回值 | 说明 |
|--------|------|
| `true` | 是合法 ZIP |
| `false, err_msg` | 不是合法 ZIP（空数据、魔数错误、缺少 EoCD） |

**示例：**
```lua
local ok, err = zip_utils.is_zip(zip_bytes)
if not ok then
    ngx.log(ngx.ERR, "invalid zip: ", err)
    return
end
```

### `zip_utils.list_files(data, prefix?)`

列出 ZIP 包内所有文件元数据。

**参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| data | string | 是 | ZIP 字节流 |
| prefix | string | 否 | 路径前缀过滤（如 `"js/"`） |

**返回：**
| 返回值 | 说明 |
|--------|------|
| `table` | 文件元数据列表，每条含 `name`、`size`、`compression_method`、`crc` |
| `nil, err_msg` | 失败 |

**示例：**
```lua
local files = zip_utils.list_files(zip_bytes)
for _, f in ipairs(files) do
    ngx.say(f.name, " (", f.size, " bytes)")
end

-- 只列 js/ 目录的文件
local js_files = zip_utils.list_files(zip_bytes, "js/")
```

### `zip_utils.extract_file(data, filepath)`

从 ZIP 包中提取单个文件到内存。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| data | string | ZIP 字节流 |
| filepath | string | 要提取的完整文件路径（如 `"js/app.js"`） |

**返回：**
| 返回值 | 说明 |
|--------|------|
| `string` | 文件内容 |
| `nil, err_msg` | 文件不存在或 CRC32 校验失败 |

**示例：**
```lua
local content, err = zip_utils.extract_file(zip_bytes, "index.html")
if content then
    -- 直接使用 content 字符串
else
    ngx.log(ngx.ERR, "extract failed: ", err)
end
```

### `zip_utils.extract_all(data, dest_dir)`

将 ZIP 包中所有文件提取到磁盘目录。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| data | string | ZIP 字节流 |
| dest_dir | string | 目标目录（自动创建子目录，末尾可加 `/` 或不加） |

**返回：**
| 返回值 | 说明 |
|--------|------|
| `true` | 全部提取成功 |
| `nil, err_msg` | 任何文件失败即停止返回错误 |

**示例：**
```lua
local ok, err = zip_utils.extract_all(zip_bytes, "/data/edge/static/myapp")
if not ok then
    ngx.log(ngx.ERR, "extract_all failed: ", err)
end
```

### `zip_utils.extract_selected(data, dest_dir, path_list)`

选择性提取指定文件列表。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| data | string | ZIP 字节流 |
| dest_dir | string | 目标目录 |
| path_list | table | 要提取的文件路径数组 |

**返回：**
| 返回值 | 说明 |
|--------|------|
| `true` | 全部指定文件提取成功 |
| `nil, err_msg` | 文件缺失或提取失败 |

**示例：**
```lua
local ok, err = zip_utils.extract_selected(zip_bytes, "/tmp/", {
    "config.yml", "manifest.json"
})
```

## 完整集成示例：PUT 端点接收 ZIP

```lua
-- handlers/admin_static_resources.lua
local zip_utils = require("lib.zip_utils")
local cjson = require("cjson.safe")

-- PUT /edge/admin/static_resources/{name}
ngx.req.read_body()
local zip_data = ngx.req.get_body_data()
if not zip_data or #zip_data == 0 then
    ngx.status = 400
    ngx.say(cjson.encode({ error_msg = "empty request body" }))
    return
end

local ok, err = zip_utils.is_zip(zip_data)
if not ok then
    ngx.status = 400
    ngx.say(cjson.encode({ error_msg = err }))
    return
end

local dest = "/data/edge/static/" .. name
local ok2, err2 = zip_utils.extract_all(zip_data, dest)
if not ok2 then
    ngx.status = 500
    ngx.say(cjson.encode({ error_msg = err2 }))
    return
end

local files = zip_utils.list_files(zip_data)
local total = 0
for _, f in ipairs(files or {}) do
    total = total + (f.size or 0)
end

ngx.status = 200
ngx.say(cjson.encode({
    message = "uploaded and extracted",
    name = name,
    path = dest,
    file_count = #(files or {}),
    total_size = total,
}))
```

## 对应 Python 端：EdgeClient.raw_put

FastAPI 端发送 ZIP 到 Edge 节点时使用 `raw_put`（而非原 `_request`）：

```python
from app.services.edge_client import EdgeClient

client = EdgeClient(cluster_id=1, db=session, node_ip="10.0.0.1", node_port=8080)
client.api_key = "your-api-key"

with open("package.zip", "rb") as f:
    zip_data = f.read()

# 直接发送原始 bytes，不做 SM4 加密
resp = client.raw_put("/edge/admin/static_resources/myapp", zip_data)
print(resp)  # {"file_count": 4, "total_size": 506, ...}
```

## 限制说明

| 限制 | 说明 |
|------|------|
| 压缩方法 | 仅支持 Store(0) 和 Deflate(8)。不支持 LZMA、BZIP2 |
| 加密 ZIP | 不支持密码加密的 ZIP |
| 分卷 ZIP | 不支持多分卷 ZIP |
| 大文件 | 纯 Lua 解压性能有限，建议 <100MB |
| 读取方式 | 整包读入内存，不流式处理 |

## 测试

```bash
# 1. 生成测试 ZIP 文件
python tests/gen_test_zip.py

# 2. 运行 Lua 单元测试
cd tests
luajit test_zip_utils.lua
```

预期输出：
```
Results: N passed, 0 failed, N total
```

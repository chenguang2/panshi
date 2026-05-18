## Context

当前磐石 Admin 已实现静态资源 ZIP 上传（FastAPI 端），并通过 `EdgeClient._request("PUT", "/edge/admin/static_resources/{name}", zip_data)` 将 ZIP 发送到 Edge 节点。但存在两个问题：

1. **EdgeClient._request() 目前只支持 dict 类型的 body**，传入 bytes 会触发 `json.dumps()` 报错
2. **Edge 节点（OpenResty/Lua）缺少 ZIP 解析能力**，收到 ZIP 后无法解析内部文件结构

ZIP 文件结构标准（PKZIP/APPNOTE）已知，但直接从 Lua 实现完整解析器工作量大。社区已有成熟方案。

## Goals / Non-Goals

**Goals:**
- Edge 节点能接收原始 ZIP 字节流并解析其内容
- 提供列清单（文件名、大小、CRC32）、文件提取能力
- 纯 Lua 实现，零 C 扩展依赖，拷贝到 Edge 项目即可使用
- Python 端 EdgeClient 扩展支持发送原始 bytes

**Non-Goals:**
- 不修改 FastAPI 端的 ZIP 上传流程
- 不支持 ZIP 创建/压缩
- 不支持加密 ZIP 或分卷 ZIP
- 不涉及前端变更
- 不更改 APISIX Lua 插件逻辑（`static_resource` 插件保持现有行为）

## Decisions

### Decision 1: ZIP 解析库选型

**结论**: 选用 `TohruMKDM/lua-inflate`（`inflate.lua`）

| 方案 | 类型 | 依赖 | 文件数 | 体积 |
|------|------|------|--------|------|
| **`lua-inflate`** ⭐ | 纯 Lua | bit (LuaJIT 内置) | 1 | ~14KB |
| `lua-zip` (lzlib) | C 扩展 | libzip C 库 | 需编译 | - |
| `minizip` (luapower) | C 扩展 | zlib C 库 | 需编译 | - |
| `luvit/zip-reader` | 纯 Lua | FFI (luajit 内置) | 1 | ~8KB |
| `zzlib` (zerkman) | 纯 Lua | 无 | 1 | ~20KB |

理由：
- `lua-inflate` 是 `zzlib` 的精简优化版：去掉了冗余校验、复用表对象，体积更小速度更快
- 单文件、MIT 协议，可直接拷贝 vendored
- API 恰好满足需求：`files()` 遍历目录、`unzip()` 提取、`inflate()` 解压
- LuaJIT 的 `bit` 库完全支持位运算需求

### Decision 2: 传输方式变更

**结论**: PUT 传输原始 ZIP bytes，不做 SM4 加密

当前 `EdgeClient._request()` 对所有请求都做 SM4 加密：
```python
encrypted_body = self._encrypt(json.dumps(body).encode())
response = httpx.put(url, headers=headers, content=encrypted_body, ...)
```

二进制 ZIP 数据不适合 JSON 序列化 + SM4 加密的双重处理。改为新增 `raw_put()` 方法：
- Content-Type: `application/octet-stream`
- 不加密，直接发送原始 bytes
- Edge 端用 `ngx.req.get_body_data()` 直接读取

> 安全说明：静态资源 ZIP 不含敏感凭据，传输在内网 Edge 节点间进行，不加密风险可控。

### Decision 3: Lua 模块结构

```
Edge 节点项目/
├── lib/
│   ├── inflate.lua          # vendored, 不修改
│   └── zip_utils.lua        # 封装模块，提供高层 API
```

`zip_utils.lua` 模块 API 设计（参考 APISIX `core/ctx.lua` 风格）：

```lua
local zip_utils = require("lib.zip_utils")

-- 1. 校验是否为合法 ZIP
local ok, err = zip_utils.is_zip(zip_bytes)

-- 2. 列出所有文件
local files = zip_utils.list_files(zip_bytes)
-- 返回: {{name="...", size=N, compressed_size=N, crc=0x...}, ...}

-- 3. 提取单个文件到字符串
local content, err = zip_utils.extract_file(zip_bytes, "path/to/file")

-- 4. 提取所有文件到目标目录
local ok, err = zip_utils.extract_all(zip_bytes, "/data/edge/static/")
```

### Decision 4: 错误处理策略

遵循 APISIX 的错误处理模式——函数返回 `(result, err)` 双值，不抛异常：
- 非 ZIP 格式 → `(nil, "invalid ZIP signature")`
- 文件不存在 → `(nil, "file not found in archive")`
- CRC32 校验失败 → `(nil, "CRC32 checksum mismatch")`

## Risks / Trade-offs

- **[性能] 纯 Lua 解压比 C 慢约 10-50 倍** → 只适用中小型 ZIP（<100MB）。大文件建议在 C 层用 `lua-zip` 或系统调用 `unzip` 命令
- **[内存] 整包读入内存** → `ngx.req.get_body_data()` 返回整个 body。超大 ZIP 需改为流式处理，当前版本不做，预留接口扩展
- **[兼容] inflate.lua 只支持 Store(0) 和 Deflate(8) 压缩方法** → 这两种覆盖了 99.9% 的 ZIP 文件。不支持 LZMA、BZIP2 等扩展方法
- **[一致性] Edge 节点 Lua 代码版本管理** → inflate.lua 作为 vendored 代码，需在 Edge 项目仓库中追踪版本

## Open Questions

1. Edge 节点项目仓库路径是什么？`zip_utils.lua` 和 `inflate.lua` 需要放置到具体哪个目录？
2. Edge 节点已有的 ZIP 接收端点（`PUT /edge/admin/static_resources/{name}`）的现有代码在哪里可以查看？方便确定 `raw_put` 的适配范围

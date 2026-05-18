## Why

Edge 节点（OpenResty/Lua）需要通过 PUT 接口接收来自磐石 Admin 的 ZIP 包（静态资源、配置包等），但当前 Edge 端缺少 Lua 层面的 ZIP 解析能力。需要一个纯 Lua、零依赖的 ZIP 解析工具模块，使 Edge 节点能接收、校验、列清单和提取 ZIP 包中的文件。

## What Changes

- **新增 `zip_utils.lua` 模块**：边缘节点（Lua 端）的 ZIP 解析工具封装，提供接收、校验、列清单、提取文件等功能
- **引入纯 Lua ZIP 库**：将 `inflate.lua`（TohruMKDM/lua-inflate，MIT 协议）作为 vendored 依赖拷贝到 Edge 项目
- **变更 Edge 节点接收端点**：`PUT /edge/admin/static_resources/{name}` 改为接收原始 ZIP bytes（不再走 SM4 加密 JSON 体）
- **变更 Python 端 EdgeClient**：新增 `raw_put` 方法，直接发送原始 bytes，不做 SM4 加密和 JSON 序列化

## Capabilities

### New Capabilities

- `edge-zip-receive`: Edge 节点接收 ZIP 包并进行格式校验（魔数检查、完整性检测）
- `edge-zip-listing`: 列出 ZIP 包内所有文件（文件名、原始大小、压缩大小、压缩比、CRC32）
- `edge-zip-extract`: 从 ZIP 包中提取指定文件到内存或磁盘

### Modified Capabilities

<!-- 不涉及现有 spec 的需求变更 -->

## Impact

- Edge 节点项目：新增依赖文件 `lib/inflate.lua`（vendored，~14KB），新增模块 `lib/zip_utils.lua`
- Edge 节点项目：修改 `PUT /edge/admin/static_resources/{name}` handler，使用新 ZIP 工具
- 后端 Python：`app/services/edge_client.py` 新增 `raw_put()` 方法
- 无新增外部依赖（inflate.lua 纯 Lua，仅需 LuaJIT 内置 bit 模块）

# 会话记录：Edge 节点 ZIP 解析工具

日期：2026-05-18
分支：`feature/zip-parser-utils`

## 背景

磐石 Admin 需要将静态资源 ZIP 包发送到 Edge 节点（OpenResty/LuaJIT）处理。Edge 节点缺少 Lua 端的 ZIP 解析能力。

## 调研结论

### ZIP 库选型

选用 **`lua-inflate`（TohruMKDM/lua-inflate）**：
- 纯 Lua 实现，单文件 ~14KB，MIT 协议
- 只需 `bit` 库（LuaJIT 内置），零 C 扩展
- 拷贝即用，无需安装编译
- API 满足需求：`files()` 遍历、`inflate()`/`extract()` 提取、`unzip()` 按名提取

### 传输方式

PUT 原始 ZIP bytes，不 SM4 加密：
- Content-Type: `application/octet-stream`
- Edge 端用 `ngx.req.get_body_data()` 接收
- 二进制数据不适合 JSON + SM4 双重处理

### APISIX 参考

Edge 节点模式类似 APISIX。APISIX 在 Lua 端处理 multipart 的核心模式：
```lua
-- 参考 apisix/core/ctx.lua
local multipart = require("multipart")
local res = multipart(body, content_type_header)
local parts = res:get_all()
```

## 交付物

```
edge_node/
├── lib/
│   ├── inflate.lua              ← vendored 纯 Lua ZIP 库
│   └── zip_utils.lua            ← 5 个工具函数
├── handlers/
│   └── admin_static_resources.lua  ← PUT 端点示例
├── tests/
│   ├── gen_test_zip.py          ← 测试 ZIP 生成器
│   ├── test_zip_utils.lua       ← Lua 单元测试（20+ 用例）
│   └── verify_test_data.py      ← Python 验证脚本
└── docs/
    ├── zip_utils_usage.md       ← API 使用文档
    └── session-summary.md       ← 本文

openspec/changes/zip-parser-utils/
├── proposal.md     ← 为什么要做
├── design.md       ← 怎么做（架构决策）
├── specs/          ← 详细规格（3 个能力）
│   ├── edge-zip-receive/
│   ├── edge-zip-listing/
│   └── edge-zip-extract/
└── tasks.md        ← 19 个可追踪任务

backend/app/services/edge_client.py
  → 新增 raw_put(path, data) 方法

backend/app/api/v1/static_resources.py
  → publish 调用改为 raw_put()
```

## zip_utils API 总览

| 函数 | 功能 |
|------|------|
| `is_zip(data)` | 魔数 + EoCD 校验 |
| `list_files(data, prefix?)` | 列文件清单，可选前缀过滤 |
| `extract_file(data, path)` | 提取单个文件到内存 |
| `extract_all(data, dest_dir)` | 全部解压到磁盘 |
| `extract_selected(data, dest_dir, list)` | 选择性提取 |

所有函数使用 `return nil, err` 双值模式。

## 测试结果

22 个测试全部 PASS：
- is_zip 校验 7/7
- list_files 7/7
- extract_file 2/2
- Python 代码验证 6/6

## 在 Edge 节点上的集成步骤

1. 将 `edge_node/lib/` 下的两个 `.lua` 复制到 Edge 项目的 `lib/` 目录
2. 将 `handlers/admin_static_resources.lua` 接入 OpenResty 路由
3. 更新 Edge nginx 配置文件，添加 location 规则
4. Python 端代码已在本项目适配完成

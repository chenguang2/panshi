## 1. 引入纯 Lua ZIP 库

- [x] 1.1 从 TohruMKDM/lua-inflate 获取 `inflate.lua`（MIT 协议），放入 Edge 项目 `lib/` 目录
- [x] 1.2 验证 `inflate.lua` 在 OpenResty/LuaJIT 环境下可正常 `require`（依赖 `bit` 而非 `bit32`）

## 2. 实现 core/zip_utils.lua 模块

- [x] 2.1 实现 `is_zip(data)` 函数：魔数校验（PK\x03\x04）+ 空数据检查
- [x] 2.2 实现 `list_files(data)` 函数：遍历中央目录，返回文件元数据列表（name/size/compressed_size/method/crc）
- [x] 2.3 实现 `list_files(data, prefix)` 重载：支持按路径前缀过滤
- [x] 2.4 实现 `extract_file(data, path)` 函数：支持 Store(0) 直接读取和 Deflate(8) 解压，含 CRC32 校验
- [x] 2.5 实现 `extract_all(data, dest_dir)` 函数：递归创建子目录，提取所有文件到磁盘
- [x] 2.6 实现 `extract_selected(data, dest_dir, path_list)` 函数：选择性提取指定文件列表
- [x] 2.7 错误处理统一使用 `return nil, err` 模式，不抛异常

## 3. 实现接收端点变更

- [x] 3.1 Edge 节点 `PUT /edge/admin/static_resources/{name}` handler 改为使用 `ngx.req.get_body_data()` 读取原始 bytes
- [x] 3.2 调用 `zip_utils.is_zip()` 校验接收到的数据
- [x] 3.3 调用 `zip_utils.extract_all()` 将 ZIP 解压到 `/data/edge/static/{name}/` 目录
- [x] 3.4 返回 JSON 响应包含文件数量和总大小

## 4. Python 端 EdgeClient 扩展

- [x] 4.1 `EdgeClient` 新增 `raw_put(path, data)` 方法：直接发送原始 bytes，Content-Type 设为 `application/octet-stream`
- [x] 4.2 不进行 SM4 加密和 JSON 序列化
- [x] 4.3 适配 `static_resources.py` 的 publish 调用，改为使用 `raw_put()` 替代 `_request("PUT", ...)`

## 5. 测试与验证

- [x] 5.1 编写 Lua 单元测试：覆盖合法的 ZIP、非 ZIP、空数据、截断 ZIP、含子目录 ZIP
- [x] 5.2 编写 Lua 单元测试：覆盖提取不存在的文件、CRC32 校验失败场景
- [x] 5.3 端到端验证：Python 端 `raw_put` → Edge 端接收 → 解压 → 文件落地

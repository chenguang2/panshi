## Why

当前 `admin_static_resources.lua` 缺少对上传文件的 zip 格式校验（不符合需求文档中"上传非 zip 文件 → 系统拒绝"的要求），且存在 shell 命令注入风险（`os.execute("rm -rf " .. dirpath)`、`io.popen("ls -1 " .. path)`），以及目录创建方式不标准等问题。需要补全功能并加固安全。

## What Changes

- **新增 zip 格式校验**：检查上传数据的魔数（magic bytes `PK\x03\x04`），非 zip 文件直接拒绝
- **加固 shell 命令安全**：对路径参数做转义处理，防止注入
- **替换目录遍历方式**：将 `io.popen("ls ...")` 改为带安全转义的实现
- **规范化目录创建**：简化 `ensure_directory` 逻辑
- **增补空/损坏 zip 校验**：解压后检查目标目录是否为空
- **完善错误日志**：关键操作失败时记录详细错误信息

## Capabilities

### New Capabilities
- `admin-static-resources`: Edge 节点端静态资源 Admin API handler，处理上传（含 zip 校验）、删除、列表查询

## Impact

- Edge 节点插件：`docs/edge/code/admin_static_resources.lua` 功能补全和安全加固

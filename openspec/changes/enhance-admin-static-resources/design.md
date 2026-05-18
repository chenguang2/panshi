## Context

当前 `admin_static_resources.lua` 是 Edge 节点上的 Admin API handler，负责处理静态资源的上传（zip 解压）、删除和列表查询。该插件通过 `control_api()` 暴露三个端点。主要问题：缺少 zip 格式校验、shell 命令未做安全处理。

## Goals / Non-Goals

**Goals:**
- 上传时校验 zip 魔数（`PK\x03\x04`）
- 路径参数 shell 转义，防止命令注入
- 解压后验证目标目录是否非空
- 改善错误日志

**Non-Goals:**
- 不修改后端 Python 代码或前端
- 不增加新的 API 端点
- 不实现增量文件更新

## Decisions

1. **Magic bytes 校验** — 检查数据前 4 字节是否为 `PK\x03\x04`，这是 zip 格式的标准标识
2. **Shell 命令使用 `ngx.quote_arg` 或手动转义** — 对路径中的单引号做处理，或在路径外包一层单引号
3. **解压后校验** — 解压完成后检查目标目录是否有文件，空目录判定为无效压缩包
4. **保留原有响应格式** — `control_api` 的响应格式（`{action, node}` / `{node: {dir, nodes}}` / `{error_msg}`）不变

## Risks / Trade-offs

- [魔数校验过于严格] 某些特殊情况（如自解压 zip、带注释的 zip）可能前 4 字节不是 `PK\x03\x04` → 极罕见，可以接受
- [shell 转义不完美] 使用单引号包裹路径，禁止路径中出现单引号 → 资源名已校验不含特殊字符，风险可控

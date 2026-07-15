## Context

Edge 数据导入（`EdgeImportService`）负责从 Edge 节点拉取配置数据并导入到管理平台数据库。四层代理（stream proxy）导入时存在多个数据丢失问题：Edge API 的 `upstream.nodes` 支持 dict/array 两种格式，但 `convert_stream_proxy` 只处理了 dict 格式；DNS 类型代理的 `plugins.dns_upstream` 数据和 `log_process` 插件未被正确捕获；重试配置字段缺失；DNS 协议写死为 tcp。

SSL 证书信息在数据导入流程中全程缺失：测试连接不返回计数、预览无展示、结果弹窗无统计。

Edge 直连页面 SSL 证书 tab 位置和弹窗风格与页面其他部分不一致。

本次修复涉及 `edge_import_service.py`、数据导入 API schema、前端 EdgeImport 和 EdgeClient 四个模块。

## Goals / Non-Goals

**Goals:**
- 修复四层代理导入时节点数组格式不兼容导致的数据丢失
- 支持 DNS 类型四层代理的完整导入（含 log_process 配置）
- 保留四层代理的重试次数和重试超时配置
- 在数据导入全流程中展示 SSL 证书信息
- 统一 Edge 直连页面 SSL 证书弹窗风格

**Non-Goals:**
- 不修改四层代理的发布逻辑（publish）
- 不修改其他资源的导入逻辑（路由、上游等）
- 不做大规模前端重构

## Decisions

### 1. `_parse_nodes()` 统一节点解析

**选择**：新增静态方法 `_parse_nodes(nodes)` 同时处理 dict 和 array 格式。

**理由**：原代码分散在 `convert_upstream` 和 `convert_stream_proxy` 中重复编写解析逻辑。抽取为静态方法后两个转换函数统一调用，避免重复，也便于测试。

**格式参考**：Edge API 文档（`upstreams.log`）明确 nodes 字段支持"哈希表或数组"两种格式：
- Dict: `{"host:port": weight}`
- Array: `[{"host": "...", "port": N, "weight": N, "priority": N}]`

### 2. DNS 代理类型通过 `plugins.dns_upstream` 自动识别

**选择**：`convert_stream_proxy` 检查 `edge_stream.plugins.dns_upstream` 是否存在，若存在则设为 DNS 类型。

**理由**：Edge 节点上 DNS 代理的配置存储在 `plugins.dns_upstream` 中（非 `upstream`），而普通代理的配置在 `upstream` 中。通过自动识别避免需要用户额外指定类型。

**合并 log_process**：`log_process` 插件在 Edge 数据中是独立插件（`plugins.log_process`），但在数据库 `dns_config` 中作为 `dns_config.log_process` 存在。因此在转换时需要从 `edge_plugins.log_process` 读取并合并到 `dns_config`。

### 3. SSL 证书信息采用现有 jsonModal 弹窗

**选择**：SSL 证书查看改用页面已有的 `jsonModalVisible`，删除改用 `Modal.confirm`。

**理由**：与其他 tabs（四层代理、上游等）保持一致，避免使用 `Modal.info()` 造成风格不一致。`jsonModal` 已封装好 JSON 数据的格式化展示。

### 4. 导入结果弹窗采用 `|| 0` 兜底

**选择**：新增 `SSL 证书：{{ importResult.imported_counts.ssl_certificates || 0 }}` 行。

**理由**：`imported_counts` 字典中已有 `ssl_certificates` 字段（后端 `execute_import` 已统计），前端类型 `ImportedCounts` 也已包含，仅展示层缺失。

## Risks / Trade-offs

- **Edge API 格式变化风险**: 如果 Edge 节点的 stream route 数据结构发生变化（如 `upstream.nodes` 使用新的格式），`_parse_nodes` 需同步更新。当前覆盖 dict/array 两种已知格式。
- **DNS 类型识别依赖 plugins 结构**: 如果未来的 Edge 版本将 DNS 配置存储在别处（非 `plugins.dns_upstream`），自动识别将失效。届时可能需要添加显式类型标记。
- **向后兼容**: 所有修改均为字段补充（新增解析、新增展示），不改变现有数据库结构或 API 响应格式，无向后兼容问题。新增字段为 optional/默认 None。

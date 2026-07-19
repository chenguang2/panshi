## MODIFIED Requirements

### Requirement: 证书生成 API 端点

系统 SHALL 提供 REST API 端点用于生成证书，支持 SM2、RSA、ECDSA 三种算法。生成过程中执行的所有 openssl 命令 SHALL 被记录并返回。

#### Scenario: 生成端点响应增加命令日志
- **WHEN** 用户发送 POST 请求到 `/api/v1/clusters/{cluster_id}/ssl/generate`
- **AND** 请求体包含 `name`（必填）、`common_name`（必填）、`mode`（必填，local/remote）等参数
- **THEN** 系统 SHALL 返回 HTTP 201
- **AND** 响应体为 `SslCertificateResponse` JSON（含 `create_method` 和 `algorithm` 字段）
- **AND** 响应体新增 `generate_log` 字段，类型为 `list[CommandLogEntry]`
- **AND** 每个 `CommandLogEntry` 包含：`step`（步骤名称）、`command`（完整命令行）、`exit_code`（退出码）、`stdout`（标准输出前 500 字符）、`stderr`（标准错误）
- **AND** `generate_log` SHALL 按执行顺序排列

#### Scenario: 本地生成记录每个 openssl 命令
- **WHEN** 用户指定 `mode=local`
- **AND** 系统执行本地 openssl 命令生成证书
- **THEN** `generate_log` SHALL 包含每个 `_run_openssl()` 调用的记录
- **AND** `command` SHALL 为完整的 openssl 命令字符串（含参数，路径已解析）
- **AND** `exit_code` SHALL 为 subprocess 的实际退出码

#### Scenario: 探测阶段的命令也记录
- **WHEN** 用户指定 `mode=local`
- **AND** 系统调用 `detect_openssl()` 进行 openssl 探测
- **THEN** 探测阶段的命令（如 `openssl version`、`openssl ecparam -list_curves`）SHALL 也计入 `generate_log`
- **AND** 探测阶段排在正式生成步骤之前
- **AND** 即使探测失败（如 openssl 不可用），已执行的探测命令 SHALL 仍然返回给前端

#### Scenario: 远程生成记录 SSH 命令
- **WHEN** 用户指定 `mode=remote`
- **AND** 系统通过 SSH 在远程节点执行脚本
- **THEN** `generate_log` SHALL 包含每一步的远程命令记录
- **AND** 每个步骤使用 `===PASHI_STEP:xxx===` 和 `===PASHI_EXIT:code===` 标记解析
- **AND** 每个步骤独立记录退出码

### Requirement: 证书生成 API 返回的响应模型

`SslCertificateResponse` SHALL 包含 `generate_log` 字段，用于存储生成过程中的命令执行记录。

#### Scenario: 响应模型增加字段
- **WHEN** 用户通过生成 API 创建证书
- **THEN** 返回的 `SslCertificateResponse` SHALL 包含 `generate_log` 字段
- **AND** `generate_log` SHALL 持久化到数据库 `SslCertificate.generate_log` 字段

#### Scenario: 查询时返回历史日志
- **WHEN** 用户通过 `GET /api/v1/clusters/{cluster_id}/ssl/{cert_id}` 查询证书
- **THEN** 如果该证书有 `generate_log` 数据
- **AND** 响应中的 `generate_log` SHALL 包含该证书生成时的命令记录

## ADDED Requirements

### Requirement: 生成命令写入日志文件

系统 SHALL 将证书生成过程中的所有命令写入文件日志，用于事后排查。

#### Scenario: 日志文件路径
- **WHEN** 系统执行证书生成
- **THEN** 命令日志 SHALL 写入 `logs/cert_generate.log`（不在 `logs/edge/` 目录下）
- **AND** 日志格式为 JSON Lines（每行一个 JSON 对象）
- **AND** 每个 JSON 对象包含：`time`、`cluster_id`、`cluster_name`、`cert_name`、`step`、`command`、`exit_code`、`stderr`

#### Scenario: 使用 Python logging 写入
- **WHEN** 系统写入命令日志
- **THEN** SHALL 使用 `logging.getLogger("cert_generate")` + 独立 FileHandler，不与 EdgeLogger 耦合
- **AND** `propagate` SHALL 设为 `False`，避免重复写入 `app.log`
- **AND** formatter SHALL 只输出 `%(message)s`（JSON 文本）

#### Scenario: 日志内容完整
- **WHEN** 生成本地证书
- **THEN** 日志 SHALL 记录所有 `_run_openssl()` 调用的命令、退出码和 stderr
- **AND** 包括 openssl 探测阶段的命令
- **WHEN** 远程生成证书
- **THEN** 日志 SHALL 记录每个步骤的 openssl 命令和退出码

### Requirement: 前端展示真实命令日志

证书生成对话框 SHALL 在生成完成后展示命令执行记录，替代当前假进度动画。

#### Scenario: 生成完成展示命令列表
- **WHEN** 证书生成成功
- **THEN** 对话框 SHALL 按顺序展示 `generate_log` 中的所有步骤
- **AND** 每个步骤显示：步骤名称、命令文本（可折叠展开）、退出码
- **AND** 所有步骤标记为"已完成"（绿色勾）

#### Scenario: 生成失败展示错误命令
- **WHEN** 证书生成失败
- **THEN** 对话框 SHALL 展示已成功执行的步骤（绿色勾）
- **AND** 失败步骤 SHALL 显示红色叉号和错误命令
- **AND** 失败步骤的 `stderr` SHALL 直接展示给用户
- **AND** 失败步骤之后的步骤 SHALL 不显示

#### Scenario: 证书详情查看命令日志
- **WHEN** 用户查看一个通过"生成"方式创建的证书（`create_method` 为 `local_generate` 或 `remote_generate`）
- **THEN** 查看弹窗 SHALL 包含"生成日志"可折叠区块
- **AND** 展示该证书生成时的命令执行记录（从 DB 读取）

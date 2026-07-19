## Purpose

证书生成过程中执行的 openssl 命令的日志记录与展示能力。包括后端日志落地到文件、DB 持久化、API 响应中返回命令执行记录、前端实时展示命令详情。

## Requirements

### Requirement: CommandLogEntry 数据结构

系统 SHALL 定义一个统一的数据结构 `CommandLogEntry` 用于记录证书生成的每个命令步骤。

#### Scenario: 数据结构定义
- **WHEN** 系统在执行证书生成时收集命令记录
- **THEN** 每条记录 SHALL 包含以下字段：
  - `step`: 字符串，步骤名称（如 "探测 openssl"、"生成密钥对"、"生成 CSR"、"签发证书"）
  - `command`: 字符串，完整的 openssl 命令文本
  - `exit_code`: 整数，进程退出码（0 表示成功）
  - `stdout`: 字符串，标准输出（过长时截断前 500 字符）
  - `stderr`: 字符串，标准错误输出
- **AND** 字段定义同时存在于后端 Pydantic schema 和前端 TypeScript 类型

### Requirement: 文件日志持久化

系统 SHALL 使用 Python logging 将命令日志写入 `logs/cert_generate.log` 文件。

#### Scenario: 日志写入机制
- **WHEN** 每个命令步骤执行完成
- **THEN** 日志 SHALL 使用 `logging.getLogger("cert_generate")` 写入
- **AND** 使用独立 FileHandler，formatter 只输出 `%(message)s`
- **AND** `propagate` 设为 `False`
- **AND** 每行一条 JSON

#### Scenario: 日志 JSON 字段
- **WHEN** 写入日志文件
- **THEN** 每行 JSON SHALL 包含：`time`、`cluster_id`、`cluster_name`、`cert_name`、`step`、`command`、`exit_code`、`stderr`
- **AND** `stderr` SHALL 只保留尾部 500 字符
- **AND** 文件日志 SHALL 不记录 PEM 内容

### Requirement: 前端命令展示组件

前端证书生成对话框 SHALL 能够展示后端返回的命令执行记录。

#### Scenario: 展示模式
- **WHEN** 生成成功
- **THEN** 展示每个步骤的名称（绿色勾）和可展开的命令详情
- **WHEN** 生成失败
- **THEN** 错误步骤高亮显示，展示命令和错误输出

### Requirement: DB 持久化命令日志

系统 SHALL 将命令日志存入数据库，用于证书详情页的历史追溯。

#### Scenario: 生成时写入 DB
- **WHEN** 证书生成并保存成功
- **THEN** `generate_log` SHALL 序列化为 JSON 存入 `SslCertificate.generate_log` Text 字段
- **AND** 查询证书时该字段一并返回

# openresty-soft-file-api Specification

## Purpose

提供 OpenResty 安装包文件列表查询 API，支持安装前选择版本。

## Requirements

### Requirement: 后端提供软包文件列表 API
系统 SHALL 提供 `GET /clusters/{cluster_id}/nodes/openresty-files` 接口，返回 `backend/ansible/soft/` 目录下所有以 `openresty-` 开头且以 `.tar.gz` 结尾的文件列表。每个文件 SHALL 包含文件名、文件大小（字节）、格式化大小显示、最后修改时间。

#### Scenario: 成功返回文件列表
- **WHEN** 用户发送 `GET /api/v1/clusters/1/nodes/openresty-files`
- **AND** `backend/ansible/soft/` 目录下有 `openresty-edge-26071308.tar.gz` 和 `openresty-edge-26071515.tar.gz`
- **THEN** 响应状态码 SHALL 为 200
- **AND** 响应体 SHALL 包含 `files` 数组
- **AND** 数组中每个元素 SHALL 包含 `name`、`size`、`size_display`、`mtime` 字段
- **AND** 返回的文件名 SHALL 按修改时间降序排列

#### Scenario: soft/ 目录不存在或为空
- **WHEN** `backend/ansible/soft/` 目录不存在或无匹配文件
- **THEN** 响应状态码 SHALL 为 200
- **AND** `files` 数组 SHALL 为空

#### Scenario: 目录权限错误
- **WHEN** `backend/ansible/soft/` 目录不可读
- **THEN** 响应状态码 SHALL 为 500
- **AND** 响应体 SHALL 包含错误详情

### Requirement: 只返回 openresty 安装包
系统 SHALL 只返回文件名以 `openresty-` 开头且以 `.tar.gz` 结尾的文件。其他文件（如 `edge-pack-*.tgz`）SHALL 被过滤掉，不出现在响应中。

#### Scenario: 过滤非 openresty 文件
- **WHEN** `backend/ansible/soft/` 目录下有 `edge-pack-3.1.1.26071510-1.29.2.5.tgz`
- **AND** `openresty-edge-26071308.tar.gz`
- **THEN** 响应中 `files` SHALL 只包含 `openresty-edge-26071308.tar.gz`

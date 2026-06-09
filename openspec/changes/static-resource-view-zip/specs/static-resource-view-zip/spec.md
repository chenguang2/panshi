## ADDED Requirements

### Requirement: 查看 ZIP 包内容

系统 SHALL 支持用户查看已上传静态资源 ZIP 包内的文件列表。

#### Scenario: 查看正常 ZIP 包内容
- **WHEN** 用户点击静态资源卡片上的"查看"按钮
- **THEN** 系统弹出模态框，以表格形式展示 ZIP 包内文件列表
- **AND** 表格包含以下列：文件名、文件大小、压缩后大小、最后修改时间
- **AND** 文件大小和压缩后大小以可读格式展示（如 KB/MB）
- **AND** 表格上方显示"显示前 1000 个 / 共 N 个文件"（N 为 ZIP 内实际总文件数）
- **AND** 目录条目也展示在列表中，其文件大小和压缩后大小显示为 `-`
- **AND** 最后修改时间格式为 `YYYY-MM-DD HH:mm`（本地时间），不带时区

#### Scenario: 未上传 ZIP 包
- **WHEN** 用户点击尚未上传 ZIP 文件的静态资源的"查看"按钮
- **THEN** 按钮为置灰状态（disabled），不可点击
- **AND** 鼠标悬停时 title 提示"暂未上传 ZIP 文件"

#### Scenario: ZIP 包文件数量超过传输限制
- **WHEN** ZIP 包内文件数量超过 1000 个
- **THEN** 系统仅返回前 1000 条记录
- **AND** `total_count` 返回实际总数
- **AND** 模态框提示"仅显示前 1000 个文件，共 N 个"

#### Scenario: ZIP 包为空
- **WHEN** 已上传的 ZIP 包内无文件
- **THEN** 模态框展示提示信息"ZIP 包内无文件"

#### Scenario: 后端读取 ZIP 失败
- **WHEN** 存储的 ZIP 文件损坏或无法读取
- **THEN** 系统返回错误信息"无法读取 ZIP 文件"
- **AND** 模态框展示错误提示

#### Scenario: ZIP 文件存储路径对应的文件已丢失
- **WHEN** 数据库记录存在但磁盘上 ZIP 文件已被删除
- **THEN** 系统返回 200 状态码及空 `items` 数组
- **AND** 响应中 `message` 字段为"ZIP 文件已被删除"
- **AND** 模态框展示提示"ZIP 文件已丢失"

### Requirement: ZIP 内容 API

系统 SHALL 提供 REST API 用于查询指定静态资源 ZIP 包的文件列表。

#### Scenario: 成功获取文件列表
- **WHEN** 请求 `GET /clusters/{cluster_id}/static-resources/{resource_id}/zip-contents`
- **THEN** 返回 200 状态码
- **AND** 响应体包含 `items` 数组（与项目现有列表 API 风格一致）
- **AND** 每项包含：`name`（文件名，目录以 `/` 结尾）、`file_size`（原始大小，目录为 0）、`compressed_size`（压缩后大小，目录为 0）、`modified`（最后修改时间，ISO-like 格式 `YYYY-MM-DDTHH:mm:ss`，无时区后缀）
- **AND** 响应体包含 `total_count`（ZIP 内文件实际总数，不受 1000 限制影响）

#### Scenario: 资源不存在
- **WHEN** 请求不存在的 `resource_id`
- **THEN** 返回 404 状态码
- **AND** 错误信息为"静态资源不存在"

#### Scenario: 资源未上传 ZIP
- **WHEN** 静态资源存在但尚未上传 ZIP 文件（`file_size` 为空）
- **THEN** 返回 200 状态码
- **AND** 响应体包含 `{"items": [], "total_count": 0, "message": "暂未上传 ZIP 文件"}`

#### Scenario: ZIP 文件已丢失
- **WHEN** 静态资源记录存在且 `file_size` 有值，但 `storage_path` 指向的文件在磁盘上不存在
- **THEN** 返回 200 状态码
- **AND** 响应体包含 `{"items": [], "total_count": 0, "message": "ZIP 文件已被删除"}`

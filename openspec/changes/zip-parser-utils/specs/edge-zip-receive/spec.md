# edge-zip-receive

## Purpose

Edge 节点接收 ZIP 包并进行格式校验（魔数检查、完整性检测），确保收到的二进制数据是合法的 ZIP 文件。

## Requirements

### Requirement: ZIP 魔数校验

Edge 节点接收到原始 ZIP 字节流时，SHALL 校验文件头部魔数（PK\x03\x04）以确认 ZIP 格式。

#### Scenario: 合法 ZIP 通过校验
- **WHEN** 接收到以 `PK\x03\x04`（十六进制 `50 4B 03 04`）开头的字节流
- **THEN** 校验通过，函数返回 `true`

#### Scenario: 非 ZIP 数据被拒绝
- **WHEN** 接收到的字节流不以 `PK\x03\x04` 开头
- **THEN** 校验失败，函数返回 `(false, "invalid ZIP signature")`

#### Scenario: 空数据被拒绝
- **WHEN** 接收到的字节流长度为 0
- **THEN** 校验失败，函数返回 `(false, "empty data")`

### Requirement: EoCD（End of Central Directory）完整性校验

Edge 节点 SHALL 在 ZIP 尾部查找 EoCD 签名（`PK\x05\x06`）以验证 ZIP 结构的完整性。

#### Scenario: 完整 ZIP 找到 EoCD
- **WHEN** 字节流是完整的 ZIP 文件且尾部存在 `PK\x05\x06`
- **THEN** 校验通过，能够读取中央目录记录数

#### Scenario: 截断 ZIP 被检测
- **WHEN** 字节流尾部缺少 `PK\x05\x06` 签名
- **THEN** 校验失败，函数返回 `(false, "missing End of Central Directory")`

### Requirement: 文件大小限制

Edge 节点 SHALL 对接收的 ZIP 包进行大小检查，超过配置上限时拒绝。

#### Scenario: 未超限正常接收
- **WHEN** ZIP 大小 ≤ 配置的 `max_zip_size`（默认 100MB）
- **THEN** 正常处理

#### Scenario: 超限 ZIP 被拒绝
- **WHEN** ZIP 大小 > 配置的 `max_zip_size`
- **THEN** 返回 `(false, "ZIP exceeds maximum allowed size")`

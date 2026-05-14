## MODIFIED Requirements

### Requirement: Edge 操作日志文件编码

EdgeLogger 的所有日志文件 SHALL 使用 UTF-8 with BOM（`utf-8-sig`）编码写入。

#### Scenario: 中文内容可读
- **WHEN** 日志中包含中文字符
- **THEN** 在 Windows 中文系统的记事本或 `type` 命令下显示正确，无乱码

#### Scenario: 已有日志文件不破坏
- **WHEN** 向已存在但无 BOM 的日志文件追加内容
- **THEN** 追加的内容不插入 BOM，已有内容不受影响

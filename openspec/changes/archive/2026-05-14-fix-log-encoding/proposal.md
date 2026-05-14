## Why

EdgeLogger 的日志文件使用 `encoding="utf-8"` 写入，但 Windows 中文系统下终端和编辑器默认以 CP936（GBK）解码，导致日志中的中文字符显示为乱码。

## What Changes

- EdgeLogger._write_log 的编码从 `utf-8` 改为 `utf-8-sig`（带 BOM），使 Windows 工具能正确识别 UTF-8
- 删除旧的 `route.log` 和 `upstream.log`，下次写入时会自动带 BOM 重新创建

## Capabilities

### New Capabilities

<!-- 无 -->

### Modified Capabilities

- `publish-edge-logging`: 日志文件编码改为 UTF-8 with BOM

## Impact

仅修改 `edge_logger.py` 中 `_write_log` 的 encoding 参数。所有日志文件（upstream、route、plugin_config、global_rule、plugin_metadata）统一使用 `utf-8-sig`。

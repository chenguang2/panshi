## Context

EdgeLogger 所有日志文件使用 `_write_log` 方法写入，原编码为 `utf-8`。Windows 中文系统（CP936）下查看时，UTF-8 无 BOM 的文件会被误判为 ANSI 编码，导致中文乱码。

## Goals / Non-Goals

**Goals:**
- 所有 Edge 操作日志文件中文显示正常

**Non-Goals:**
- 不改变日志内容格式

## Decisions

1. **使用 utf-8-sig（UTF-8 with BOM）** — BOM 头帮助 Windows 上的记事本、`type` 命令等工具自动识别编码，同时保持与 UTF-8 兼容
2. **删除旧日志文件** — 已有的 `route.log` 和 `upstream.log` 不含 BOM，删除后下次发布操作会自动重建

## Risks / Trade-offs

无。`utf-8-sig` 对纯 ASCII 内容无影响（BOM 是零宽度的），对非 ASCII 内容确保编码被正确识别。

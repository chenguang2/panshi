## Context

上游高级配置 Tab 中健康检查使用 `a-textarea :rows="20"` 展示，默认 JSON 内容 `{"passive": {}, "active": {"unhealthy": {}}}` 格式化后仅 5 行，20 行高度浪费空间。

## Goals / Non-Goals

**Goals:**
- 将 `:rows` 从 20 调整为 6，刚好容纳默认 5 行内容，留 1 行缓存余量

## Decisions

- 使用 `:rows="6"` 匹配 5 行默认内容 + 1 行余量

# Design: 2026-10-02-ssl-publish-backfill

## Context

发布状态此前是行内易失状态：发布动作置位、刷新即失。路由/上游域已有 `_build_publish_map` 从 `ps_config_version` 回查最近发布时间的成熟模式。

## Decisions

- **D1 复用 publish-map 模式**：SSL 两列表端点照搬同款 `_build_publish_map` 回查（最近一次成功发布 → `published_at`），不另造状态存储；ConfigVersion 是唯一事实来源。
- **D2 回查失败不阻断列表**：`published_at` 为可选字段，回查异常时按「无发布记录」降级，列表照常返回。

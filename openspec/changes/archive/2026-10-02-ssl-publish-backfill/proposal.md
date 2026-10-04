# Proposal: 2026-10-02-ssl-publish-backfill

## Why

SSL 证书列表的同步状态标签（PublishStatusTag）此前只能依赖行内即时发布动作置位：列表刷新/重新进入后发布状态丢失，恒显「未同步」——与路由/上游等资源列表经 ConfigVersion 回查发布状态的行为不一致，用户误判证书未发布。

## What Changes

- 统一管理与集群内两个 SSL 列表端点经 `_build_publish_map` 从 ConfigVersion 回查每个证书最近一次成功发布时间，回填 `SslCertificateResponse.published_at`（可选字段）
- 前端 PublishStatusTag 以回填值判定「已同步」，不再恒显未同步；与路由/上游列表同款 publish-map 模式在 SSL 域落地

## Capabilities

### Modified

- `ssl-certificate-management`：「SSL 证书列表展示」补发布时间回填语义与场景

## Impact

- 后端：`backend/app/api/v1/cluster_ssl.py`（两列表端点 `_build_publish_map` 回查 + Response 回填）
- 前端：SSL 列表 PublishStatusTag（既有组件消费新字段，无结构变更）
- 测试：`backend/tests/` SSL 列表回填用例
- 风险：低——只读回查，不改变发布流程

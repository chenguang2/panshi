# Tasks: 2026-10-02-ssl-publish-backfill

> 追溯性建档：代码已合入（6eaf06c5），以下为实际执行记录。

## 1. 列表发布时间回填

- [x] 1.1 统一管理与集群内两个 SSL 列表端点接 `_build_publish_map`，回填 `published_at`
- [x] 1.2 前端 PublishStatusTag 消费回填值，已发布证书不再恒显「未同步」
- [x] 1.3 回归：SSL 列表回填用例 + SSL 域既有用例通过

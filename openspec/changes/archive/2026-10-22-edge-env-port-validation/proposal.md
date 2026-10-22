# 变更提案：edge-env-port-validation

## Why（背景与证据）

2026-10-22 edge-env-ux-review-fixes 实施期 10.4 失败路径实测发现：把 test 集群 edge.env 的 `deploy.http.edge.listen[0].addr` 从 `0.0.0.0:16610` 改为 `0.0.0.0:99999` 后，平台 `validate_edge_env`（`backend/app/utils/yaml_validator.py`）照常放行、部署流直通三节点全部 all_success。同一内容节点侧 `bin/edge init` 亦零校验（rc=0）。即：**端口值这一内容级合法性目前前后端均不把关**，非法端口会静默写进全部节点并推进「当前版本」。

- 证据链：实测记录见 `archive/2026-10-22-edge-env-ux-review-fixes/tasks.md` 10.4 批注；校验器现状见 `yaml_validator.py`（仅结构检查）；前端同构校验 `EdgeEnv.vue::validateFields` 同样只查结构。
- 条目真实形态（实机内容解析）：`listen` 条目为 dict `{addr: "0.0.0.0:16610", ssl?: true}`；文档中另存在 `unix:conf/edge_stream_monitor.sock` 形态（非 host:port）。

## What Changes（变更内容）

1. **后端**（权威）：`validate_edge_env` 在既有结构检查之后增加 listen 条目端口合法性校验——从 `addr`（或兼容纯字符串条目）提取端口，须为 1-65535 的整数；非法即返回带字段路径 + 项序号 + 原值的错误（部署端点既有 422 分支自动生效，不改端点）。
2. **前端**（即时反馈）：`EdgeEnv.vue::validateFields` 增加同语义端口检查，发布前早退提示（镜像既有「前端/后端双端结构检查」模式）。
3. **文档**：主 spec「发布前字段验证」场景补端口校验条款。

## 决策点

| # | 决策 | 推荐 | 理由 |
|---|---|---|---|
| A | 校验范围：仅 `deploy.http.edge.listen` / `deploy.http.admin.listen` 两个 spec 字段 vs 全文档扫描所有 `listen:`/`addr:` | **仅两个字段** | 实测注入向量恰在 `edge.listen[0].addr`，两字段即拦住本次事故向量；全文档扫描会波及 `custom`/`lua` 与未来未知结构（false positive 伤害大于漏检收益），节点侧 stream 等块由 Edge 自身运行期校验兜底 |

> 决策点 A 若无异议按推荐值实施；有调整先改本表再动码（#240）。

## 非目标

- 节点侧（`bin/edge`/playbook）不做内容校验——内容合法性职责在平台侧（2026-10-22 已实测节点侧零校验，不重复投入）。
- 不扩展到 `deploy.http.custom` / `lua` / stream 块的端口扫描（决策点 A）。
- 不动部署端点与 playbook——校验器返回签名不变，422 通路既有。

## Impact

- ** Specs**：`openspec/specs/edge-env-remote-editing/spec.md`（MODIFIED：发布 edge.env → 发布前字段验证 场景）
- **代码**：`backend/app/utils/yaml_validator.py`；`frontend/src/views/EdgeEnv.vue`（validateFields 函数）
- **测试**：`backend/tests/test_yaml_validator.py`（既有文件扩展）；`frontend/src/views/__tests__/EdgeEnv.test.ts`
- **风险**：低——纯校验增强，唯一回归风险是误伤合法内容（用实机真实内容做通过用例兜底）

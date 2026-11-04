# Proposal

## Why

「下发配置」在区域没有任何启用节点时仍静默成功，把该局网关白名单整体覆盖为空表（map 只剩 `default ""`），该局所有经网关的发布/节点任务随即全部 403。2026-11-04 实锤：bj 区域 test-2 集群 4 个节点全部处于禁用状态，下发后白名单被清空且无任何提示，排障成本高。

## What Changes

- 后端 `POST /relay/gateways/{id}/push-config` 增加空名单前置防护：该区域 0 个启用节点时默认拒绝（HTTP 409，中文错误说明），显式携带 `allow_empty=true` 才放行（保留「区域下线清空白名单」的合法场景）。
- `GET /relay/gateways` 列表回填每区域 `enabled_node_count` / `total_node_count`（模式同既有 `inventory_group_missing` 漂移标记）。
- 前端「下发配置」确认弹窗改为动态内容：正常时显示本次将下发的启用节点数与「全量替换」语义提示；0 启用节点时升级为危险确认，明确警示「下发将清空白名单、该局发布/节点任务将被 403 拒绝」，确认后经请求体携带 `allow_empty: true`。
- `init` 端点与「查看配置」预览不受影响（见 design.md D2：init 是装机引导路径，预览只读如实展示）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `relay-config-push`: 新增「空名单下发防护」要求（0 启用节点默认拒绝 + 显式放行 + 区域列表节点计数回填 + 确认弹窗动态语义）。

## Impact

- 后端：`backend/app/api/v1/relay.py`（push-config 前置校验、list_gateways 计数回填）、`backend/app/schemas/`（RelayGatewayOut 加字段、push 请求体 schema）、`backend/app/services/relay_push.py`（复用 `_region_nodes`，不新增查询路径）。
- 前端：`frontend/src/views/RelayGateways.vue`（handlePush 动态确认弹窗、SSE 请求体）、`frontend/src/api/` relay 模块类型。
- 测试：后端 relay 域既有用例回归（push-config 加 body 参数向后兼容，`payload=None` 默认不破坏既有直调）；前端 `RelayGateways.test.ts` 既有确认弹窗断言需按新文案反转。
- 不涉及 schema/迁移/写库路径（计数为查询期计算，无新列），不触发 PG 方言冒烟。

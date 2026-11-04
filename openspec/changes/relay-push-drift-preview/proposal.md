# Proposal: relay-push-drift-preview

## Why

白名单下发是**全量替换**语义：每次下发都以当前启用节点整体覆盖网关机上的 map。空名单静默清空已由 `relay-push-empty-whitelist-guard` 拦截，但**部分缩水**仍然静默——节点被禁用/删除/换 IP 后点「下发配置」，确认弹窗只显示「本次将下发 N 个启用节点（共 T 个节点）」，不显示相对网关机现行白名单**会移除谁**。2026-11-04 bj 局实锤过整档静默清空（已拦），中间态（移除 1/4 个节点）目前无任何可见性，运维只能靠事后链路体检 403 反推。

根因：平台不知道「上次下发写了什么」——`relay_gateways` 没有快照，网关机上的 `edge_targets.conf` 也无回读端点。

## What Changes

- **持久化下发快照**：`relay_gateways` 新增 `last_pushed_nodes`（TEXT JSON，"ip:管理端口" 列表）与 `last_pushed_at`；push / init 终态**成功**时经强引用后台任务写快照（失败不写、`allow_empty` 如实写空），SSE 生成器 `finally` 不写库（规则 #33）。
- **漂移计算回填**：`GET /relay/gateways` 列表逐区域输出 `push_drift = {added, removed}`（相对快照的将新增/将移除节点列表；无快照为 null）与 `last_pushed_at`——纯平台侧计算，零网关 IO。
- **下发确认弹窗漂移提示**：将移除 → 琥珀警示行列出移除节点（≤10 全列）+ okText 变体「开始下发（将移除 r 个节点）」；仅新增 → 灰字提示；无快照 → 「首次写入白名单」说明；一致 → 不加行。
- **不改变任何执行路径**：下发/初始化/回滚的 ansible 链路、渲染函数、空名单闸（`relay-push-empty-whitelist-guard`）全部不动。

## Impact

- 受影响 spec：`relay-config-push`（ADDED 下发漂移预览）
- 代码：`backend/app/models/relay.py` + `backend/app/core/migrate.py`（COLUMN_MIGRATIONS，缺条目即启动崩溃循环——#118）+ `backend/app/services/relay_push.py`（on_result 回调 + 快照写任务）+ `backend/app/services/ansible_service.py`（可选回调参数）+ `backend/app/api/v1/relay.py`（列表回填）+ `backend/app/schemas/relay.py`；前端 `RelayGateways.vue` + `api/relay.ts` + 测试
- **schema/写库路径变更 → PG 方言冒烟必跑（#103）**；TEXT-JSON 写入显式 `json.dumps`（#48）
- 快照语义局限（有意接受）：快照 = 平台最后一次**成功**下发，非网关机实况——人工手改网关文件、SSE 中途断开（终态回调未执行）的窗口不覆盖；漂移提示定位为 advisory，不做告警

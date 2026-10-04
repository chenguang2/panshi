# Proposal: relay-inventory-safety

## Why

2026-10-03 实发两起中继链路缺陷，叠加一层既有防呆缺口：

1. **root 凭据注入漏块**：sshd-setup 以 jboss 身份连接网关报 `/etc/ssh/sshd_config not readable`。根因：同一网关机 IP 同时出现在网关清单的多个区域组（主机块）中，凭据注入只处理了**首个**匹配块，未注入块的原身份变量（jboss）在 ansible 主机变量合并中胜出（socket 取证实锤）。且还原逻辑全文件扫描首个 `ansible_user` 行，存在把 root 凭据残留到其他块的风险。
2. **路径字段脏值**：kjc 区域 `http_base_url` 存库值带前导空格，init 的 nginx 探测静默失败（URL 拼接后不可达但无显式报错）。
3. **清单缺组假成功**：init/push 对网关清单只有「文件存在」校验；缺该局主机组（`gateways_<code>`）时 ansible 空匹配以 rc=0 退出（AGENTS 约定 #21② 的假成功陷阱），任务界面显示成功、实际未对任何主机执行。

## What Changes

- **init/push 前置校验升级为组存在**：`ensure_gateway_inventory(region_code, ssh_jump)` 缺组时 503，错误信息附可照抄的 YAML 片段（`ssh_jump` 可解析时预填账号/地址）；主机清单解析收敛单一实现 `relay_push.gateway_hosts`（`relay_sshd` 委派，init/push/sshd-setup/列表标记同源）。
- **流内空匹配守卫**：`_stream_ansible_events` 新增 opt-in `fail_on_empty_hosts`（relay init/push 启用）——rc=0 但输出含「Could not match supplied host pattern」/「no hosts matched」时终态改判 failed 并附 error。
- **列表漂移标记**：`GET /relay/gateways` 行注入 `inventory_group_missing`，界面状态列显示「清单缺组」tag。
- **root 凭据注入全块覆盖**：注入按行级多块感知，覆盖该 IP 的**全部**主机块（倒序改写保持索引有效）；还原改块内定位尾部配对、倒序还原，不再全文件扫首个 `ansible_user` 行。
- **路径字段 strip**：`http_base_url` / `ssh_jump` / `openresty_prefix` 在创建/更新落库前去首尾空白（空串归 None）。
- 网关清单补 areatest/kjc 组（手工维护文件，随实发场景入库）。

## Capabilities

### Modified

- `relay-sshd-setup`：「root 凭据仅本次使用」补「同一 IP 多主机块全部注入」与「还原块内锚定、不越块」场景；新增「网关清单防呆与路径字段卫生」需求（组存在前置校验、空匹配假成功守卫、清单漂移标记、路径字段 strip）

## Impact

- 后端服务：`backend/app/services/relay_sshd.py`（多块注入/还原）、`backend/app/services/relay_init.py`、`backend/app/services/relay_push.py`（组存在校验、`gateway_hosts` 单一实现、空匹配守卫启用）、`backend/app/services/ansible_service.py`（`fail_on_empty_hosts`）、`backend/app/api/v1/relay.py`（503 前置校验、漂移标记）、`backend/app/schemas/relay.py`（strip 校验器、`inventory_group_missing` 字段）
- 清单：`backend/ansible/inventory/gateways`（补 areatest/kjc 组）
- 前端：`frontend/src/api/relay.ts`、`frontend/src/views/RelayGateways.vue`（状态列「清单缺组」tag）
- 测试：`backend/tests/test_relay_sshd.py`、`backend/tests/test_relay_init.py`、`backend/tests/test_relay_push.py`、`backend/tests/test_relay_gateway_api.py`、`backend/tests/test_ansible_service.py`（新增组校验/空匹配守卫/漂移标记/双块注入/strip 用例，relay 域 184 passed）；前端 `npx vue-tsc -b` 干净 + api 3 / 视图 11 vitest 通过
- 文档：`docs/design/relay-gateway.md`
- 风险：低——凭据注入/还原仍为流内临时行为，`finally` 还原语义不变（清单字节级还原目标不变）；strip 只作用于新建/更新入口，不改存量数据（kjc 存库值已另行经 API 修正）

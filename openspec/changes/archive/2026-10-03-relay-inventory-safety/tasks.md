# Tasks: relay-inventory-safety

> 追溯性建档：代码已合入（39eab47d），以下为实际执行记录。relay 域回归 184 passed。

## 1. 组 1 — 前置校验与解析收敛

- [x] 1.1 `relay_push.py` 新增 `gateway_hosts(hosts_pattern, inventory_path=None)` 单一实现（原 `relay_sshd._gateway_hosts` 改为委派）
- [x] 1.2 `ensure_gateway_inventory(region_code, ssh_jump)` 升级为「文件存在 + 该局主机组非空」双校验，缺组报错附可照抄 YAML 片段（`gateway_group_missing_message`，ssh_jump 可解析时预填账号/地址）；`relay_init` 同步
- [x] 1.3 `api/v1/relay.py` init/push 端点传 `(gateway.code, gateway.ssh_jump)`，缺组 503
- [x] 1.4 测试：`test_relay_init.py` / `test_relay_push.py` 补缺组 503 与 YAML 片段用例

## 2. 组 2 — 空匹配假成功守卫

- [x] 2.1 `ansible_service._stream_ansible_events` 新增 opt-in `fail_on_empty_hosts`：rc=0 且输出含「Could not match supplied host pattern」/「no hosts matched」→ 终态改判 failed 并附 error
- [x] 2.2 relay init/push 流启用该守卫（`fail_on_empty_hosts=True`）
- [x] 2.3 测试：`test_ansible_service.py` 补空匹配守卫用例（rc=0 假成功改判 failed）

## 3. 组 3 — root 凭据注入全块覆盖

- [x] 3.1 `relay_sshd._host_blocks` 多块感知（原 `_host_block` 单块实现替换）；`inject_gateway_creds` 倒序覆盖全部主机块，备份改列表结构
- [x] 3.2 `restore_gateway_creds` 改块内定位尾部配对、倒序还原（删除新插入行 / 恢复改写行），不再全文件扫首个 `ansible_user` 行；清单被手工增删块时多块不动、缺块跳过
- [x] 3.3 测试：`test_relay_sshd.py` 补双块注入/还原用例（同 IP 双组全覆盖、还原不越块）

## 4. 组 4 — 漂移标记与路径字段 strip

- [x] 4.1 `schemas/relay.py` Create/Update 增加 `strip_path_fields` 校验器（http_base_url/ssh_jump/openresty_prefix 去首尾空白、空串归 None）；`RelayGatewayOut` 增加 `inventory_group_missing`
- [x] 4.2 `api/v1/relay.py` `GET /gateways` 行注入 `inventory_group_missing = not gateway_hosts(f"gateways_{code}")`
- [x] 4.3 前端 `api/relay.ts` 类型同步；`RelayGateways.vue` 状态列「清单缺组」tag
- [x] 4.4 测试：`test_relay_gateway_api.py` 补漂移标记与 strip 用例
- [x] 4.5 网关清单 `backend/ansible/inventory/gateways` 补 areatest/kjc 组（手工维护文件随实发场景入库）

## 5. 组 5 — 收尾验证

- [x] 5.1 relay 域 184 passed（`test_relay_sshd.py` / `test_relay_init.py` / `test_relay_push.py` / `test_relay_gateway_api.py` / `test_ansible_service.py`）
- [x] 5.2 前端 `npx vue-tsc -b` 干净；api 3 + 视图 11 vitest 通过
- [x] 5.3 `docs/design/relay-gateway.md` 补记防呆语义

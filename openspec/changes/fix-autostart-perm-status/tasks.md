# Tasks: fix-autostart-perm-status

## 1. RED — 先写失败测试（backend/tests/test_edge_autostart.py）

- [x] 1.1 用例"无权限查询不覆盖"：预置 `NodeAutostart(node_id=1, status='disabled')`；patch `is_node_in_inventory=True` 与 `_ansible_service.edge_autostart` 返回 `{rc:126, stdout:'', stderr:'bash: /usr/bin/systemctl: 权限不够'}`；POST `action=status` 完整消费 SSE → 断言 `status=='disabled'` 保持、`action=='status'`、`rc==126`（**预期 RED**：现实现覆盖为 permission_denied）
- [x] 1.2 用例"操作失败不抹已知状态"：预置 `status='enabled'`；fake `{rc:255, stdout:'', stderr:'Permission denied (publickey,password)'}`；POST `action=enable`（带 root_password）→ 断言 `status=='enabled'` 保持、`action=='enable'`、`rc==255`（**预期 RED**：现实现写 unknown）
- [x] 1.3 用例"禁用假成功写实际值"：预置 `status='enabled'`；fake `{rc:0, stdout:'enabled', stderr:''}`（`|| true` 强制 0 + is-enabled 实输出）；POST `action=disable` → 断言 `status=='enabled'`（实际值，**预期 RED**：现实现按 action 期望写 disabled）、`action=='disable'`
- [x] 1.4 用例"真实态含 rc=1 边界正常刷新"：预置 `status='enabled'`；fake `{rc:1, stdout:'disabled', stderr:''}`（is-enabled 对 disabled 合法 rc=1）；POST `action=status` → 断言 `status=='disabled'`（**预期 GREEN**，锁"判据是内容不是 rc"）
- [x] 1.5 运行 `uv run pytest tests/test_edge_autostart.py`，确认 1.1–1.3 RED、1.4 与既有 9 用例 GREEN，记录输出作为修复前基线

## 2. GREEN — 实现统一规则（backend/app/api/v1/edge_autostart.py）

- [x] 2.1 持久化块三分支替换为 design D1 统一规则：`_REAL_STATES` 模块级常量；`inferred = _infer_status(rc, stdout, stderr)`；真实态→写入，否则有原真实态→保留，否则→如实写 inferred（**保持写库位于最终 yield 之前**，memory #34 约束）
- [x] 2.2 模块顶部 `logger = logging.getLogger(__name__)`；写库 `except Exception: pass` → `logger.exception("autostart 持久化失败 node_id=%s action=%s", node.id, body.action)`
- [x] 2.3 `uv run pytest tests/test_edge_autostart.py` 全绿（13 passed）

## 3. 回归与真实链路验证

- [x] 3.1 后端全量 `uv run pytest` 通过（重点 autostart/ansible/database 相关无涟漪）
- [x] 3.2 真实链路冒烟（服务已运行；**活动库为 `db_config.json` 当前 active 的 `data/manual-demo.db`，勿查 `panshi.db` 副本**；node_id=10 / 192.168.0.14，前置真实态 disabled）：
  - 非 root `action=status`（流内 rc=126 权限不够）→ `GET /nodes/autostart/records` 断言该节点 status 仍为真实态未被覆盖、action/rc 更新为本次失败；
  - root 查询成功 → status 刷新（应仍为 disabled）；
  - 再非 root 查询 → status 保持 disabled（连续失败不回退）
- [x] 3.3 前端确认（自启动管理页）：失败查询后表格保持最后已知状态；实时日志区仍出现"无权限查询"提示

## 4. 收尾

- [x] 4.1 `git status` 确认仅预期文件；提交 `fix: 自启动持久化统一以实际输出为准——失败不覆盖最后已知状态、禁写操作期望值（含 4 回归用例）`（不含 db_config.json/prompt-1.txt）
- [ ] 4.2 按 openspec-archive-change 流程归档本变更（delta specs 合入 main specs）

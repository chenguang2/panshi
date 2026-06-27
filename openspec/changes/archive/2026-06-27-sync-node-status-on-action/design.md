## Context

当前节点执行启动/停止/重启/检测操作后，`node.status_detail`（JSON 字段，含 `nginx.nginx_running` 等运行时信息）被更新，但 `node.status`（Integer，1=正常 0=停用）未被同步。前端 `nginxRunning()` 函数优先读取 `status_detail.nginx.nginx_running`，在其不存在时回退到 `node.status`。

问题：检测到 nginx 未运行时，`node.status` 仍为旧值保持不变。例如检测发现 nginx 已停止，但 `node.status` 仍为 1，如果 `status_detail` 被清除则 `nginxRunning()` 会错误返回 true。

## Goals / Non-Goals

**Goals:**
- 节点操作（start/stop/restart/check/statistic）成功后同步更新 `node.status`
- 操作失败时不更新 `node.status`，避免误标记
- ~~人工编辑节点时仍尊重用户显式设置的 `status` 值~~（已移除：操作结果决定最终状态，见 Risks）

**Non-Goals:**
- 不改变前端 `nginxRunning()` 的优先判断逻辑（仍先读 `status_detail.nginx.nginx_running`）
- 不涉及节点列表的 UI 改动
- 不涉及自动定时检测
- ~~人工编辑节点时手动设置的 `status` 不受自动同步影响~~（已移除：操作结果决定最终状态，最后执行的操作覆盖之前的值）

## Decisions

### Decision 1: 在 `_run_and_update()` 成功路径追加 `node.status` 同步

**选择**：在 `_run_and_update()` 函数的成功路径中，根据操作结果设置 `node.status`。

```python
async def _run_and_update(db, node, tag, extravars):
    try:
        result = await _ansible_service.run_playbook(ip=node.ip, tag=tag, extravars=extravars)
        detail = _ansible_service.build_status_detail(tag, result)

        # 根据执行结果同步 node.status
        if tag == "nginx_cmd_run":
            nginx_cmd = extravars.get("nginx_cmd", "")
            if nginx_cmd in ("nginx_stop",):
                # 停止成功 → 停用
                node.status = 0
            elif nginx_cmd in ("nginx_start", "nginx_reload"):
                # 启动/重启成功 → 运行中
                node.status = 1
            elif nginx_cmd in ("nginx_check",):
                # 配置检查（nginx -t）仅验证配置文件语法，
                # 成功不代表 nginx 进程在运行，不更新 status
                pass
        elif tag == "edge_statistic":
            nginx_info = detail.get("nginx", {})
            nginx_running = nginx_info.get("nginx_running")
            nginx_status = nginx_info.get("nginx_status")
            if nginx_running is True:
                node.status = 1
            elif nginx_running is False and nginx_status != "unknown":
                # nginx_running=False 但 status=unknown 时跳过
                #（_parse_nginx_status fallback，可能 stdout 不可解析）
                node.status = 0
            # nginx_running 为 None，或 nginx_status="unknown" 时不修改

        await _update_status_detail(db, node, detail)
        return result
    except AnsibleExecutionError as e:
        detail = {
            "last_execution": datetime.now(timezone.utc).isoformat(),
            "last_status": "failed",
            "last_rc": e.rc,
            "last_tag": tag,
            "last_error": str(e),
        }
        await _update_status_detail(db, node, detail)
        # 失败时：不更新 node.status
        raise HTTPException(...)
```

**为什么不通过 `nginx_running` 判断所有操作？** 因为 `nginx_cmd_run` 返回的是命令本身的 stdout（"Nginx start success"），`edge_statistic` 和 `nginx_cmd_run` 两个 tag 都调用 `_parse_nginx_status` 但侧重点不同。更可靠的方式是按 tag 区分处理。

**为什么 `nginx_check` 不更新 `node.status`？** `nginx_check` 执行的是 `nginx -t`（配置语法检查），返回 rc=0 仅表示配置文件正确，不代表 nginx 进程在运行。如果用户想确认进程状态，应使用"状态查询"（`edge_statistic`）。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **操作成功但 nginx 实际上未启动**（命令返回 rc=0 但进程启动失败） | 低概率。下次检测会纠正。同时 `nginxRunning()` 优先用 `status_detail.nginx.nginx_running`，不会误判 |
| **restart 端点实际使用 `nginx_reload`（热加载）而非 stop+start** | 如果 nginx 已停止，reload 会失败（非零 rc），走 except 路径，`node.status` 不会被错误更新为 1。这是预存的设计决策，本变更不修改 |
| **`_parse_nginx_status` fallback 返回 `nginx_running=False, status="unknown"`** | `edge_statistic` 路径增加了 `nginx_status != "unknown"` 判断，防止 stdout 不可解析时误将 status 设为 0 |
| **用户手动编辑 `status` 后被后续操作覆盖** | 有意识的设计决策：节点操作代表实际执行结果，最后执行的操作决定最终值。如需禁用节点应避免触发操作 |

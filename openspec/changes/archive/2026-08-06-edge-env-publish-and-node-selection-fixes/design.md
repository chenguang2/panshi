## Context

两类问题：

1. **edge.env 发布结果显示错误**：多节点发布有节点失败仍显"全部成功"。
   - 后端根因：`deploy_stream` 的 `async for` 正常结束即标 success，不检查 `_run_ansible_stream` 末尾 SSE 事件的 `rc`。UNREACHABLE/rc≠0 节点被误判成功。
   - 前端根因：`useInstallStream` 只转发 `data.line` 给 onLine；后端 `complete` 事件无 line 字段被丢弃。`publishResult` 只能靠中途节点 rc 事件兜底，13 节点 rc=0 → 误设 all_success。

2. **节点选择体验差**：节点任务创建窗口缺全选/计数（edge.env 发布页已有）。

## Goals / Non-Goals

**Goals:**
- 后端按 ansible rc 判定节点成败（rc==0 成功）
- 前端正确处理 complete 事件（无 line 也转发）
- 前端整体状态显示成功/失败计数
- 节点任务创建窗口全选/取消全选 + 计数

**Non-Goals:**
- 不改 ansible playbook（edge_init_env.yml）
- 不改节点任务执行引擎其他逻辑
- 不引入新依赖

## Decisions

### Decision 1: 后端 rc 判定

`deploy_stream` 遍历 `_run_ansible_stream` 事件时，解析每个事件，捕获含 `rc` 的最后事件：

```python
node_rc = -1
async for event in _run_ansible_stream(...):
    yield event
    ev = json.loads(event.removeprefix("data: ").removesuffix("\n\n"))
    if "rc" in ev:
        node_rc = ev.get("rc", -1)
if node_rc == 0: success else: failed
```

**理由**：`_run_ansible_stream` 不抛异常（rc≠0 也正常 yield 完），rc 在末尾 SSE 事件。UNREACHABLE 返回 rc=4（实测）。

### Decision 2: 前端 complete 事件转发

`useInstallStream` 无 line 但有 type 的事件也调 onLine（JSON.stringify 传入）；`EdgeEnv.onLine` 已处理 `data.type === 'complete'` → 设 publishResult。`onComplete` 兜底仅 rc≠0 时触发（rc=0 中途节点不设 all_success）。

**理由**：complete 事件无 line 字段，原逻辑丢弃；onComplete 的 rc 是节点级，不能代表整体。

### Decision 3: 前端成功/失败计数

`deploySummary` computed 从 `publishResult.node_results`（或 nodeResults）统计 success/failed，模板显示"成功 N / 失败 M"。

### Decision 4: 节点任务全选

`selectAllCreateNodes` / `clearAllCreateNodes` + 工具条模板，与 EdgeEnv 发布页一致。

## Risks / Trade-offs

- [rc 事件解析失败] → try/except 忽略非 JSON，node_rc 保持 -1（视为失败，安全）
- [complete 事件转发可能把 JSON 混入日志] → 可接受，日志区仅展示，不影响解析
- [onComplete rc=0 不再设 all_success] → 依赖 complete 事件；若 complete 缺失（流异常中断），rc≠0 兜底仍生效

## Migration Plan

无 DB 迁移。

## Open Questions

无。

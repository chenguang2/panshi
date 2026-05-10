## Context

### Bug 1: 上游健康检查默认配置

当前在集群管理的"上游"标签页中，点击"添加上游"时，表单中没有包含健康检查配置。边缘服务器需要健康检查配置来检测上游节点的故障。

### Bug 2: 路由插件丢失

路由 "ABCEFG" 之前在版本管理中可以看到插件配置，但现在丢失了。同样，发布到边缘节点后也没有插件配置。

**初步分析：**

在 `publish_route` (routes.py:245-268) 中：
```python
plugins_result = await db.execute(select(RoutePlugin).where(RoutePlugin.route_id == route_id))
plugins = plugins_result.scalars().all()
# ...
"plugins": [{"plugin_name": p.plugin_name, "config": p.config} for p in plugins]
```

在 `convert_route_to_edge_format` (edge_client.py:324-335) 中：
```python
if plugins:
    edge_plugins = {}
    for p in plugins:
        plugin_name = getattr(p, 'plugin_name', None) or p.get('plugin_name') if isinstance(p, dict) else None
        plugin_config = getattr(p, 'config', None) or p.get('config') if isinstance(p, dict) else None
        if plugin_name:
            try:
                edge_plugins[plugin_name] = json.loads(plugin_config) if isinstance(plugin_config, str) else (plugin_config or {})
```

代码逻辑看起来正确，但需要进一步验证：
1. `RoutePlugin.config` 存储的是 JSON 字符串
2. `convert_route_to_edge_format` 应该解析 JSON 字符串
3. 可能存在边缘情况导致解析失败

## Goals / Non-Goals

**Goals:**
- 为添加上游操作添加默认的健康检查 JSON 配置
- 修复路由插件在版本管理和边缘发布后丢失的问题

**Non-Goals:**
- 不修改边缘服务器代码
- 不修改现有的路由编辑功能（仅修复发布流程）
- 不修改上游发布功能（仅添加默认健康检查配置）

## Decisions

### Decision 1: 上游健康检查默认配置

**选择**: 在前端 `showAddUpstreamModal` 中直接添加默认健康检查 JSON

**理由**:
- 简单直接，不需要后端修改
- 与现有的上游表单数据结构一致
- 用户可以在提交前修改或删除默认配置

**实现方式**:
```javascript
// 在 showAddUpstreamModal 中添加
upstreamForm.checks = {
  "passive": { "type": "http" },
  "active": {
    "type": "http",
    "unhealthy": { ... },
    "healthy": { ... },
    ...
  }
}
```

### Decision 2: 路由插件丢失调查

**选择**: 首先调查并复现问题，然后根据根本原因修复

**调查步骤**:
1. 检查 RoutePlugin 表中特定路由的 plugins 数据
2. 检查版本历史中存储的 config JSON 是否包含 plugins
3. 验证 edge_data 在调用 convert_route_to_edge_format 后的内容
4. 检查边缘服务器接收到的请求是否正确

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 健康检查配置可能不适合所有用户场景 | 配置是可选的默认值，用户可以修改或删除 |
| 路由插件问题可能需要数据库修复 | 先备份数据，再进行修复 |
| 难以复现插件丢失问题 | 检查日志和版本历史数据 |

## Open Questions

1. **路由插件丢失的根本原因是什么？**
   - 需要检查数据库中 RoutePlugin 表的数据
   - 需要检查版本历史中 plugins 字段是否正确保存

2. **健康检查配置是否应该在后端也默认添加？**
   - 目前选择只在前端添加，保持后端兼容性

3. **是否需要为现有上游批量添加健康检查配置？**
   - 暂不需要，用户可以手动编辑添加
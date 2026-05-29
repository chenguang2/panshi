## Context

当前集群删除功能中，`showDeleteConfirm()` 弹窗的节点选择默认全选所有活跃节点。二级确认弹窗要求输入集群名称验证。需要对齐路由删除行为：节点默认不选，同时简化二级确认流程。

## Goals / Non-Goals

**Goals:**
- `showDeleteConfirm()` 中节点 checkbox 默认全部不选（而不是全选）
- `ClusterList.vue` 二级确认弹窗统一只要求输入集群名称验证

**Non-Goals:**
- 不改变其他资源（路由、上游、插件组等）的删除流程
- 不改变后端 API（`DeleteClusterRequest` schema 保持不变）
- 不需要节点 IP:端口输入验证

## Decisions

| 决策 | 方案 | 理由 |
|------|------|------|
| 节点默认状态 | `selectedNodeIds` 初始值从 `new Set(opts.nodes.map(n => n.id))` 改为 `new Set()` | 与路由删除对齐，用户主动选择要删除的节点 |
| 集群二级确认 | 只保留集群名称输入验证，去掉节点 IP:端口输入 | 简化操作流程，集群名称验证已足够安全 |
| 二级确认 UI | 沿用当前 `Modal.confirm` + 输入框模式，不引入新组件 | 最小改动，复用现有模式 |

## Risks / Trade-offs

- **用户习惯变化** → 之前删除集群默认全选节点，现在需要手动勾选。这是有意对齐路由删除行为，使操作更明确。
- **无 IP:端口验证** → 输入集群名称已能防止误删，IP:端口验证增加了不必要的复杂度

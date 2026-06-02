## Context

边缘节点页面（EdgeClient.vue）的插件组编辑弹窗有 4 个字段：配置ID、描述、插件配置 JSON、Labels JSON、Hosts JSON。其中 Labels 和 Hosts 是 PANSHI Plugin Config 的原生可选字段，在集群管理流程中并不使用，仅在直接操作边缘节点时暴露。

## Goals / Non-Goals

**Goals:**
- 精简插件组编辑表单，移除 Labels 和 Hosts 字段

**Non-Goals:**
- 不改动插件组编辑的核心逻辑（配置ID、描述、插件配置 JSON 保留）
- 不改动集群管理页面的插件组编辑

## Decisions

直接删除对应代码，不改动后端 PANSHI 交互逻辑（后端仍可接收 labels/hosts 字段）。

## Risks / Trade-offs

无风险。Labels 和 Hosts 为可选字段，不填=不生效，删除后用户如需使用可联系技术支持。

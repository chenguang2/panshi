# publish-badges Delta

## ADDED Requirements

### Requirement: 静态资源分发状态徽章

静态资源卡片 SHALL 以专用状态徽章（`StaticResourceStateTag`，视觉对齐 `PublishStatusTag`）展示分发状态五态；判定数据来自列表响应的 `route_exists`/`last_publish_ok`/`last_published_at` 与既有 `current_version`。独立页与集群子页 Tab SHALL 一致接入。

#### Scenario: 配置异常（孤儿资源）
- **WHEN** 资源的关联路由已不存在（`route_exists == false`）
- **THEN** 徽章 SHALL 显示红色「配置异常」，tooltip 提示「关联路由不存在，请删除该资源或重建路由」
- **AND** 该态下发布/上传操作 SHALL 禁用（tooltip 指路），操作收敛为「删除」

#### Scenario: 待上传
- **WHEN** 资源无 `current_version`（未上传 zip）
- **THEN** 徽章 SHALL 显示灰色「待上传」

#### Scenario: 待分发
- **WHEN** 资源有 `current_version` 且 `last_publish_ok == null`（从未发布）
- **THEN** 徽章 SHALL 显示琥珀色「待分发」，tooltip 显示「上传于 {updated_at 格式化}，尚未分发到任何节点」

#### Scenario: 已分发
- **WHEN** `last_publish_ok == true`
- **THEN** 徽章 SHALL 显示绿色「已分发 {success}/{total} 节点」，tooltip 显示「最近分发 {last_published_at 格式化}」

#### Scenario: 分发失败
- **WHEN** `last_publish_ok == false`
- **THEN** 徽章 SHALL 显示红色「{success}/{total} 节点失败」，tooltip 列出失败节点与原因

#### Scenario: 时间语义拆分
- **WHEN** 渲染静态资源卡片时间信息
- **THEN** 版本行时间 SHALL 标注「上传时间」（updated_at），分发时间 SHALL 只出现在徽章 tooltip「最近分发」
- **AND** `PublishStatusTag` 若被静态资源引用，tooltip 时间标签 SHALL 经可选 `timeLabel` 传「最近变更」，SHALL NOT 把 updated_at 标注为「发布时间」；其它资源域默认「发布时间」不变

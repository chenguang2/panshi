## Context

插件组和全局规则的卡片上只有编辑/删除/发布/版本管理按钮，缺少查看功能。而插件元数据的 `GlobalPluginSelector` 组件已有查看按钮和抽屉实现，可直接复用相同模式。

## Goals / Non-Goals

**Goals:**
- 插件组卡片新增查看按钮，点击打开抽屉展示详情
- 全局规则卡片新增查看按钮，点击打开抽屉展示详情

**Non-Goals:**
- 不改动已有编辑/删除/发布/版本管理功能
- 不改动插件元数据已有的查看功能
- 不做交互方式的创新，纯粹补齐功能

## Decisions

- **复用 GlobalPluginSelector 的查看模式**: 使用 `a-drawer` + `a-descriptions` + `<pre>` JSON 展示
- **复用已有的 `viewPluginConfigDetail` 和 `viewGlobalRulePluginConfig`**: 卡片内插件标签点击查看单个插件配置的功能保持不变
- **按钮位置**: 查看放在编辑之前（查 > 改 > 删），与插件元数据一致

## Risks / Trade-offs

- 无显著风险，纯 UI 补齐

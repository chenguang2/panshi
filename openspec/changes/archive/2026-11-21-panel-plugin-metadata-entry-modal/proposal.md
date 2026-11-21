# panel-plugin-metadata-entry-modal

## Why

2026-11-21 用户裁决（shared-core-plan B2c）：统一管理最大化面板的「插件元数据」Tab **移除左栏「可用插件」分类树**，添加方式改为工具条「添加插件元数据」按钮 → 打开与独立页 `/plugin-metadata` **相同的创建弹窗**（所属集群锁定为当前集群）。

实现已落地（commit `98f260d3`：面板 −338 行）。主 spec `plugin-metadata-management` 的 Scenario「统一管理 Tab 添加入口同清单过滤」仍描述「面板展示可添加插件（目录分类卡片）」，与本实现矛盾，需要同步。

## What Changes

- 修改主 spec `plugin-metadata-management` 的「新建插件元数据」需求中该 Scenario 的正文：面板不再承载可选插件清单，改由与独立页共用的创建弹窗单点承担 `plugin_metadata_plugins` 过滤。
- **场景标题保持不变**（openspec 不支持场景级重命名，且标题在 MODIFIED 块中必须精确覆盖主 spec 现文），在正文前加 HTML 注释记录裁决来源。
- 不改后端、不改 `plugin_metadata_plugins` 清单语义（清单仍只约束「添加」入口可选项）、不改已配置条目行为。

## Impact

- 规格文档：`openspec/specs/plugin-metadata-management/spec.md`（一个 Scenario 正文）。
- 代码：无（实现已合入）。

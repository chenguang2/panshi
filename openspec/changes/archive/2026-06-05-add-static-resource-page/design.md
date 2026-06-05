## Context

与插件组/全局规则类似，但有以下差异：
- 表单是路由选择（非名称/插件输入），需要 3 个验证条件
- 卡片展示路径、文件大小等信息
- 操作按钮包括上传 ZIP（区别于插件组）

## Key Decisions

| 决策 | 选择 |
|---|---|
| 布局 | CSS Grid 固定 3 列 |
| 卡片格式 | 与集群管理中静态资源 tab 一致（名称/路径/状态/版本/文件大小） |
| 表单 | 路由选择模式（需验证 URI 后缀、发布状态、插件） |
| 操作按钮 | 编辑、上传 ZIP、发布、版本管理、删除 |
| 删除 | `showDeleteConfirm` + `executeDeleteWithProgress` |
| 发布 | `PublishConfirmModal` + `executePublish` |

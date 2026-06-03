## ADDED Requirements

### Requirement: EdgeClient 视觉统一
EdgeClient 页面 SHALL 使用现有设计系统组件进行样式升级。

#### Scenario: 页面头部
- **WHEN** EdgeClient 页面加载
- **THEN** 页面最顶部 SHALL 显示 PageHeader（标题"Edge 直连" + 描述），位于告警提示上方

#### Scenario: 节点选择器卡片化
- **WHEN** 节点选择器区域渲染
- **THEN** 选择器 SHALL 包裹在卡片容器中（白色背景 + 圆角 + 边框 + 阴影）

#### Scenario: Tab 内表格使用新组件
- **WHEN** Tab 内的表格渲染
- **THEN** 状态列 SHALL 使用 BadgeStatus 组件
- **AND** 方法列 SHALL 使用 MethodTag 组件

#### Scenario: JSON 查看器配色
- **WHEN** JSON 查看器渲染
- **THEN** 容器背景 SHALL 为深色，字体使用 `--font-mono` 等宽字体

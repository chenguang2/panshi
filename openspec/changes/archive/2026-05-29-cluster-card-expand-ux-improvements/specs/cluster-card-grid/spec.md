## ADDED Requirements

### Requirement: 展开卡片后滚动定位到详情区

系统 SHALL 在用户点击"展开"按钮后将页面平滑滚动到该集群的详情区域。

#### Scenario: 点击展开后滚动
- **WHEN** 用户点击集群卡片的"展开"按钮
- **THEN** 页面平滑滚动到该集群的详情区（`.card-expanded`）
- **AND** 使用 `setTimeout(100ms)` 确保 TransitionGroup 动画已开始

### Requirement: 最大化时收起未分组

系统 SHALL 在最大化集群时同时收起"未分组"区域。

#### Scenario: 最大化收起所有分组
- **WHEN** 用户点击最大化按钮
- **THEN** 所有分组（包括未分组）全部收起
- **AND** 还原时未分组保持收起状态

### Requirement: 分组与详情分隔线使用主题色

分组集群列表与下方展开详情区之间的分隔线 SHALL 使用主题色。

#### Scenario: 分隔线颜色
- **WHEN** 详情区（`.expanded-area`）渲染时
- **THEN** 顶部边框使用 `color-mix(in srgb, var(--p-color-primary) 40%, transparent)`
- **AND** 最大化模式下分隔线消失

### Requirement: 标题栏无点击行为

展开集群的标题栏 SHALL 无点击行为，避免用户混淆。

#### Scenario: 标题栏不响应点击
- **WHEN** 用户点击展开集群的标题栏
- **THEN** 不做任何操作
- **AND** 展开、最大化、还原通过右侧按钮操作

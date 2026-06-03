## Purpose

统一页面头部组件，所有页面使用一致的标题、描述和操作按钮布局。

## Requirements

### Requirement: 页面头部结构和样式

每个页面的内容区域顶部 SHALL 显示统一的 page-header 结构。

#### Scenario: 页面头部包含标题和描述
- **WHEN** 页面加载完成
- **THEN** 页面头部 SHALL 显示大号页面标题（h1）
- **AND** 标题下方 SHALL 显示灰色副标题/描述文字
- **AND** 标题和描述 SHALL 使用左对齐

#### Scenario: 页面头部包含操作按钮
- **WHEN** 页面上存在操作（如新建/发布）
- **THEN** 操作按钮 SHALL 显示在页面头部右侧
- **AND** 主要操作按钮 SHALL 使用品牌强调色（btn-primary）

#### Scenario: 页面头部含筛选器
- **WHEN** 页面需要集群筛选器
- **THEN** 筛选器 SHALL 放置在页面头部操作按钮区域左侧

### Requirement: 页面头部响应式

页面头部 SHALL 在不同屏幕宽度下正确显示。

#### Scenario: 窄屏堆叠
- **WHEN** 屏幕宽度小于 768px
- **THEN** 操作按钮 SHALL 换行到标题下方
- **AND** 操作按钮 SHALL 充满可用宽度

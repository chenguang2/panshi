## Purpose

统一的状态徽章、HTTP 方法标签和筛选芯片组件，提供一致的视觉标识系统。

## Requirements

### Requirement: 状态徽章

状态徽章 SHALL 使用圆点指示器 + 文字标签的组合。

#### Scenario: 显示状态徽章
- **WHEN** 状态徽章渲染
- **THEN** 徽章 SHALL 包含左侧圆点 + 右侧状态文字
- **AND** 不同状态 SHALL 使用不同颜色：
  - 在线/启用/正常: 绿色 (#237804)
  - 离线/禁用: 红色 (#a8071a)
  - 维护中: 橙色 (#fa8c16)
  - 待命中: 蓝色 (#1890ff)
- **AND** 圆点 SHALL 带发光阴影效果

### Requirement: HTTP 方法标签

HTTP 方法标签 SHALL 为小号彩色徽章，用于路由列表。

#### Scenario: 显示 HTTP 方法标签
- **WHEN** HTTP 方法标签渲染
- **THEN** 标签 SHALL 使用等宽字体
- **AND** 各方法使用不同颜色：
  - GET: 绿色边框
  - POST: 蓝色边框
  - PUT: 橙色边框
  - DELETE: 红色边框
  - PATCH: 青色边框
- **AND** 标签 SHALL 为小号（约 10px font-size）

### Requirement: 筛选芯片

筛选芯片 SHALL 为 pill 形状的可点击标签，用于列表筛选。

#### Scenario: 显示筛选芯片
- **WHEN** 筛选芯片渲染
- **THEN** 芯片 SHALL 为药丸形状（高圆角）
- **AND** 默认状态 SHALL 使用灰色边框和灰色文字
- **AND** 激活状态 SHALL 使用品牌色边框和品牌色文字 + 浅品牌色背景
- **AND** hover 时 SHALL 显示品牌色边框
- **AND** 点击 SHALL 切换激活状态

## Purpose

升级版统计卡片组件，用于 Dashboard 和集群概览等页面展示关键指标。

## Requirements

### Requirement: 统计卡片结构和样式

统计卡片 SHALL 包含图标行、数值、标签、副标题和顶部指示色条。

#### Scenario: 显示完整统计信息
- **WHEN** 统计卡片渲染完成
- **THEN** 卡片内 SHALL 依次显示：图标（左上角）、数值（大号等宽字体）、标签文字、副标题（如"3 在线 / 1 离线"）
- **AND** 卡片顶部 SHALL 显示 3px 高度的指示色条
- **AND** 不同统计项 SHALL 使用不同颜色的指示色条

#### Scenario: 卡片指示色条
- **WHEN** 统计卡片渲染
- **THEN** 每个卡片 SHALL 有唯一的 accent 色条颜色：
  - 集群: 品牌主色
  - 路由: 成功绿色
  - 上游: 警告橙色
  - 节点: 信息蓝色
  - 用户: 危险红色
  - 插件组: 紫色
  - 全局规则: 绿色

#### Scenario: Hover 动效
- **WHEN** 鼠标悬停在统计卡片上
- **THEN** 卡片 SHALL 轻微上移 (translateY)
- **AND** 阴影 SHALL 加深
- **AND** 边框 SHALL 变为品牌色

### Requirement: 统计卡片图标

统计卡片 SHALL 在左上角显示语义化图标。

#### Scenario: 显示图标
- **WHEN** 统计卡片渲染完成
- **THEN** 图标 SHALL 显示在卡片左上角
- **AND** 图标背景 SHALL 为半透明品牌色
- **AND** 图标颜色 SHALL 为品牌色

## ADDED Requirements

### Requirement: 最大化模式下隐藏分组列表

系统 SHALL 在最大化模式下隐藏集群分组列表，以增加最大化集群的显示面积。

#### Scenario: 最大化时分组列表隐藏
- **WHEN** 页面处于最大化模式（`maximizedClusterId` 非空）
- **THEN** 分组集群列表（cluster-group）完全隐藏
- **AND** 最大化集群标题栏和内容区占满页面宽度

#### Scenario: 退出最大化时分组列表恢复
- **WHEN** 页面退出最大化模式
- **THEN** 分组集群列表重新显示
- **AND** 布局恢复为最大化前的状态

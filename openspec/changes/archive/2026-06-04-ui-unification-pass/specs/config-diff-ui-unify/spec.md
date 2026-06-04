## ADDED Requirements

### Requirement: ConfigDiff 抽屉视觉升级
ConfigDiff 抽屉内统计卡片和 diff 视图 SHALL 使用新设计体系。

#### Scenario: summary-bar 升级
- **WHEN** 对比统计栏渲染
- **THEN** 统计卡片 SHALL 使用 `--p-bg-glass` 背景 + `--p-glass-border` 边框
- **AND** 数值 SHALL 使用 `--font-mono` 字体

#### Scenario: diff 行配色
- **WHEN** 差异行渲染
- **THEN** 一致行 SHALL 使用绿色色调，差异行 SHALL 使用红色色调
- **AND** 仅 DB/仅 Edge 行 SHALL 使用橙色/蓝色色调

# deployment-feature-config — Delta Spec

## ADDED Requirements

### Requirement: Configuration items — task_center

The deployment feature configuration SHALL support a new feature name `task_center` in the `features.features` mapping.

| Feature name | Default | Controls |
|---|---|---|
| `task_center` | `true` | 全局节点任务中心页面、任务化 API 路由、侧边栏「节点任务」菜单 |

#### Scenario: task_center enabled
- **WHEN** `features.yaml` 中 `task_center` 为 `true` 或未配置
- **THEN** 全局任务中心功能 SHALL 可用
- **AND** `GET /node-tasks`（全局任务列表）SHALL 返回 200
- **AND** 侧边栏「节点任务」菜单项 SHALL 显示

#### Scenario: task_center disabled
- **WHEN** `features.yaml` 中 `task_center` 为 `false`
- **THEN** 任务中心相关 API SHALL 返回 404
- **AND** 侧边栏「节点任务」菜单项 SHALL 隐藏
- **AND** 前端 `/node-tasks` 路由 SHALL NOT 注册

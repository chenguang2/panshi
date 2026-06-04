## NEW Requirements

### Requirement: Config type card grid selection

The Edge data import step 2 SHALL display available configuration types as a grid of selectable cards, matching the design mockup.

#### Scenario: Card grid layout
- **WHEN** step 2 is displayed
- **THEN** config types SHALL be presented as a CSS grid of cards (auto-fill, min 200px each)
- **THEN** each card SHALL show: SVG icon, name, checkmark when selected
- **THEN** item counts SHALL NOT be shown in step 2
- **THEN** cards SHALL have hover effect (border-color changes)
- **THEN** selected cards SHALL have accent border and background tint

#### Scenario: Card types, icons and labels
- **WHEN** the grid is rendered
- **THEN** cards SHALL include: 上游服务, 路由规则, 全局规则, 插件组, 插件元数据
- **THEN** "插件配置" SHALL be renamed to "插件组"
- **THEN** icons SHALL use `@ant-design/icons-vue` components:
  - 上游服务: `CloudUploadOutlined`
  - 路由规则: `BranchesOutlined`
  - 全局规则: `PropertySafetyOutlined`
  - 插件组: `BlockOutlined`
  - 插件元数据: `AppstoreOutlined`

#### Scenario: Selection behavior
- **WHEN** a card is clicked
- **THEN** the selection SHALL toggle (add/remove from selected types)
- **WHEN** all types are selected by default
- **THEN** all cards SHALL start in selected state
- **WHEN** no types are selected
- **THEN** the "下一步" button SHALL be disabled
- **WHEN** at least one type is selected
- **THEN** the "下一步" button SHALL be enabled

#### Scenario: Preview data refresh
- **WHEN** the user navigates to step 3 (preview)
- **THEN** preview data SHALL be freshly fetched regardless of previous cache
- **THEN** only the selected config types SHALL be requested from the backend
- **WHEN** the user returns to step 2 from step 3
- **THEN** the selection state SHALL be preserved

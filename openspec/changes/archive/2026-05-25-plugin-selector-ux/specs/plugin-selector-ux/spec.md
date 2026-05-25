## ADDED Requirements

### Requirement: Tree structure for plugin categories

The left panel SHALL display plugins in a tree layout with vertical line connecting category to items.

#### Scenario: Tree lines visible
- **WHEN** a category is expanded
- **THEN** plugin items SHALL show indented with a vertical tree line and horizontal connector

### Requirement: Theme-following selected state

The selected plugin state SHALL use `--p-color-primary` instead of hardcoded green.

#### Scenario: Selected card uses theme color
- **WHEN** a plugin card is selected
- **THEN** its border, background, and checkmark SHALL use `--p-color-primary` based colors

### Requirement: Remove badge on selected cards

Selected plugin cards SHALL show a "× 移除" button on hover at bottom-right.

#### Scenario: Remove badge appears on hover
- **WHEN** hovering over a selected card
- **THEN** a "× 移除" button SHALL appear at bottom-right

### Requirement: Right panel category color bar

Each selected item in the right panel SHALL have a 3px left color bar matching its category.

#### Scenario: Color bar on selected items
- **WHEN** a plugin is in the right panel
- **THEN** its row SHALL have a left border colored by its category

### Requirement: Hover highlight on right panel

The right panel items SHALL highlight on hover.

#### Scenario: Hover highlights row
- **WHEN** hovering over a selected item row
- **THEN** the row background SHALL change to a light tint

### Requirement: Config status label

The right panel SHALL show "已配置 ✓" (with icon) for configured plugins and "默认配置" for unconfigured ones.

#### Scenario: Config label
- **WHEN** a plugin has configuration
- **THEN** SHALL show themed "已配置 ✓"
- **WHEN** a plugin has no configuration
- **THEN** SHALL show gray "默认配置"

### Requirement: Page background not theme-tinted

The page background SHALL always be `#f0f2f5` regardless of theme mode.

#### Scenario: Background not tinted
- **WHEN** switching to modern mode
- **THEN** the page background SHALL NOT change to a tinted color

## Architecture Decisions (from design review)

### Layout
- CSS Grid — `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`
- Design reference: `docs/ui/Live-Artifact-3/plugins.html`

### Single source of truth for plugin categories
- `plugin_definitions.py` defines the `category` field for all 25 builtin plugins
- Both PluginSwitches and PluginSelector consume `category` from the API response
- PluginSelector's hardcoded CATEGORIES array is removed

### PluginSelector displays display_name
- PluginSelector shows `display_name` (Chinese) when available, falls back to `name`
- Consistent with PluginSwitches card UI

### Disabled plugin handling for existing route/group configs
- Disabling a plugin does NOT modify existing route/plugin-group/global-rule configurations
- The disabled plugin continues to function on Edge nodes for existing configs
- The admin MUST manually remove the plugin from routes/groups where it should no longer apply
- ON SAVE: backend scans for references to disabled plugins and returns a warning list (non-blocking)

### New plugin default state
- A plugin with no PluginEnabled record is treated as enabled
- Applies to: `GET /plugins/builtin` filtering, PluginSwitches loading logic
- Prevents inconsistency when new plugins are added to BUILTIN_PLUGINS

### Save API safety
- PUT /plugin-switches uses `async with db.begin()` transaction
- Input validated via `PluginSwitchItem` Pydantic schema
- `plugin_name` checked against BUILTIN_PLUGINS names

### No version field
- Plugin cards do NOT display a version number
- The `version` field is removed from the design scope

### Unsaved changes guard
- `beforeRouteLeave` navigation guard warns on unsaved changes
- Reload/close-tab is NOT intercepted (standard browser behavior)

## MODIFIED Requirements

### Requirement: Plugin enable/disable management

Admins SHALL be able to enable or disable builtin plugins via a card-grid management UI with category filtering, search, and schema preview.

#### Scenario: Plugin grid display
- **WHEN** the management page loads
- **THEN** each plugin SHALL display as a card in a responsive CSS grid
- **THEN** each card SHALL show: display_name, category tag, description, plugin name, toggle switch
- **THEN** disabled plugin cards SHALL have reduced opacity (0.55)

#### Scenario: Category filter pills
- **WHEN** the page loads
- **THEN** category filter pills SHALL be rendered from the `category` field of plugin data
- **WHEN** admin clicks a category pill
- **THEN** only plugins with that category SHALL be shown
- **WHEN** admin clicks "全部"
- **THEN** all plugins SHALL be shown

#### Scenario: Combined filters (AND logic)
- **WHEN** a category pill is active AND a search query is entered AND a status is selected
- **THEN** only plugins that satisfy ALL three conditions SHALL be shown
- **THEN** the three filters SHALL be combined with AND logic

#### Scenario: Search filter
- **WHEN** admin types in the search input
- **THEN** plugins SHALL be filtered by matching `display_name` or `name`

#### Scenario: Status filter
- **WHEN** admin selects a status from the dropdown
- **WHEN** "已启用" is selected, only enabled plugins SHALL be shown
- **WHEN** "已禁用" is selected, only disabled plugins SHALL be shown
- **WHEN** "全部状态" is selected, all plugins SHALL be shown

#### Scenario: Plugin count
- **WHEN** any filter/search changes
- **THEN** the count "共 N 个插件" SHALL update to reflect filtered results

#### Scenario: Empty filter result
- **WHEN** no plugins match the current filter combination (category + search + status)
- **THEN** an empty state SHALL be displayed with "暂无匹配的插件" message

#### Scenario: Schema preview toggle
- **WHEN** admin clicks "⚙ schema" on a plugin card
- **THEN** the plugin's JSON schema SHALL expand below the card footer
- **WHEN** clicked again
- **THEN** the schema SHALL collapse
- **THEN** the schema box SHALL have max-height 150px with scroll
- **THEN** plugins with an empty schema (`{}`) SHALL still display the "⚙ schema" link
- **WHEN** any category/search/status filter changes
- **THEN** all schema boxes SHALL collapse (state is not preserved across re-renders)

#### Scenario: Disable plugin
- **WHEN** an admin toggles a plugin's switch to off and saves
- **THEN** that plugin SHALL not appear in route/plugin-group selector
- **WHEN** the admin re-enables it and saves
- **THEN** it SHALL reappear

#### Scenario: All plugins visible in management page
- **WHEN** viewing the plugin management page
- **THEN** both enabled and disabled plugins SHALL be visible in card grid

#### Scenario: Batch enable/disable
- **WHEN** admin clicks "全部启用"
- **THEN** all plugins SHALL be set to enabled
- **WHEN** admin clicks "全部禁用"
- **THEN** all plugins SHALL be set to disabled

#### Scenario: Unsaved changes hint
- **WHEN** any plugin switch is toggled without saving
- **THEN** a "有未保存的更改" hint SHALL appear in the save area

#### Scenario: Status bar count
- **WHEN** switches are toggled
- **THEN** the status bar SHALL update "已启用 X / N 个插件" in real-time

#### Scenario: Save with warning
- **WHEN** admin disables a plugin that is referenced by routes/plugin_configs/global_rules and clicks save
- **THEN** the save SHALL succeed
- **THEN** a warning toast SHALL list the disabled plugins with their reference counts

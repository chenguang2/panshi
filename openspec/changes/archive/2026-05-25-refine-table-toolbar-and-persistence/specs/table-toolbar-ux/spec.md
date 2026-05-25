## ADDED Requirements

### Requirement: Search bar in toolbar

The search bar for routes, nodes, and upstreams SHALL be placed in the toolbar row, right-aligned.

#### Scenario: Search in toolbar
- **WHEN** viewing routes/nodes/upstreams tab
- **THEN** the search input SHALL be inside the `.node-actions` toolbar, in a `.toolbar-right` container

### Requirement: Column config persistence

The column selection, search visibility, and action button selection SHALL be saved to localStorage and restored on page load.

#### Scenario: Config persists
- **WHEN** a user changes column settings
- **THEN** after page refresh, the same settings SHALL be restored

### Requirement: Remove PluginMetadata search

The PluginMetadata component SHALL NOT have a search bar.

#### Scenario: No search in plugin metadata
- **WHEN** viewing the plugin metadata tab
- **THEN** there SHALL be no search input visible

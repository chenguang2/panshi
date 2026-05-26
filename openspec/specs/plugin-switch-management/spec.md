## ADDED Requirements

### Requirement: Plugin enable/disable switch

Admins SHALL be able to enable or disable builtin plugins via a management UI.

#### Scenario: Disable plugin
- **WHEN** an admin disables a plugin and saves
- **THEN** that plugin SHALL not appear in route/plugin-group selector
- **WHEN** the admin re-enables it and saves
- **THEN** it SHALL reappear

### Requirement: All plugins visible in management page

The management page SHALL always show all plugins regardless of switch state.

#### Scenario: Management shows all
- **WHEN** viewing the plugin management page
- **THEN** both enabled and disabled plugins SHALL be visible

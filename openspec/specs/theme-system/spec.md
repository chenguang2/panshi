## Purpose

Theme system supporting multiple color presets, dark/light mode, and system preference detection.

## Requirements

### Requirement: Theme color presets

The system SHALL provide multiple preset theme colors that change the primary color of all UI components.

#### Scenario: Apply blue theme
- **WHEN** the user selects the blue theme preset
- **THEN** the primary color SHALL change to #1890ff
- **AND** all Ant Design components SHALL reflect the new primary color

#### Scenario: Apply green theme
- **WHEN** the user selects the green theme preset
- **THEN** the primary color SHALL change to #52c41a

#### Scenario: Apply purple theme
- **WHEN** the user selects the purple theme preset
- **THEN** the primary color SHALL change to #7c3aed

#### Scenario: Apply orange theme
- **WHEN** the user selects the orange theme preset
- **THEN** the primary color SHALL change to #fa8c16

#### Scenario: Theme persists after page reload
- **WHEN** the user selects a theme color
- **AND** the user refreshes the page
- **THEN** the selected theme SHALL still be applied

### Requirement: Dark mode toggle

The system SHALL support light and dark mode switching.

#### Scenario: Toggle to dark mode
- **WHEN** the user activates dark mode
- **THEN** the background SHALL change to dark (#141414 or equivalent)
- **AND** text colors SHALL change to light (#e8e8e8 or equivalent)
- **AND** all Ant Design components SHALL use dark theme tokens

#### Scenario: Toggle to light mode
- **WHEN** the user activates light mode
- **THEN** the background SHALL revert to light (#f0f2f5)
- **AND** all components SHALL return to light theme tokens

#### Scenario: System preference detection
- **WHEN** the user selects "跟随系统" (follow system)
- **THEN** the theme SHALL match the OS-level color scheme preference
- **AND** SHALL update automatically when the OS preference changes

### Requirement: Theme persistence

Theme preferences SHALL be persisted across sessions.

#### Scenario: Theme saved to localStorage
- **WHEN** the user changes any theme setting
- **THEN** the preference SHALL be saved to localStorage

#### Scenario: Theme restored on login
- **WHEN** the user logs in and the app loads
- **THEN** the theme preference SHALL be restored from localStorage
- **AND** applied before rendering to avoid flash

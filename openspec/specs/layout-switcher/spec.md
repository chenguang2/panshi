## Purpose

Layout mode switching between sidebar, top navigation, and full-width modes.

## Requirements

### Requirement: Layout mode switching

The system SHALL support switching between different layout modes.

#### Scenario: Switch to sidebar mode
- **WHEN** the user clicks the sidebar layout option
- **THEN** the layout SHALL show a left sidebar navigation with the top header bar above the content area
- **AND** all page content SHALL render inside this layout

#### Scenario: Switch to top-nav mode
- **WHEN** the user clicks the top navigation layout option
- **THEN** the layout SHALL use a horizontal top navigation bar
- **AND** the sidebar SHALL be hidden

#### Scenario: Switch to full-width mode
- **WHEN** the user clicks the full-width layout option
- **THEN** the content area SHALL expand to occupy the full viewport width
- **AND** content margins SHALL be reduced

### Requirement: Layout mode persistence

The selected layout mode SHALL persist across sessions.

#### Scenario: Layout persists after page reload
- **WHEN** the user selects a layout mode
- **AND** the user refreshes the page
- **THEN** the selected layout mode SHALL still be applied

### Requirement: Active layout highlight

The layout switcher SHALL provide clear visual feedback.

#### Scenario: Active layout is highlighted
- **WHEN** the layout switcher is displayed
- **THEN** the currently active layout mode SHALL be visually highlighted
- **AND** switching to a different mode SHALL update the highlight

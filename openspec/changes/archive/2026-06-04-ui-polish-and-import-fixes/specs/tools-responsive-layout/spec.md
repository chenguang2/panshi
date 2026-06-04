## NEW Requirements

### Requirement: Responsive toolbox textarea layout

Tools page textareas SHALL fill available vertical space and auto-resize when the browser window is resized.

#### Scenario: Layout fills viewport
- **WHEN** the tools page is loaded
- **THEN** `.tools-layout` SHALL have `height: calc(100vh - 96px)` to fill remaining viewport
- **THEN** `.tools-content` SHALL use flex column with `overflow: hidden`
- **THEN** `.tool-panel` SHALL use `flex: 1` to fill available height
- **THEN** `.dual-panel` SHALL use `align-items: stretch`
- **THEN** `.panel-left` and `.panel-right` SHALL use flex column with `flex: 1`
- **THEN** textareas SHALL use `flex: 1` to fill remaining panel space

#### Scenario: Dynamic row count
- **WHEN** the window is resized
- **THEN** textarea rows SHALL be recalculated based on `(window.innerHeight - 300) / 28`
- **THEN** rows SHALL have a minimum of 8

#### Scenario: Copy buttons
- **WHEN** the page is loaded
- **THEN** copy and paste buttons SHALL be wrapped in a flex row with 8px gap
- **THEN** buttons SHALL NOT stretch to full width

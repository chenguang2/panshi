## NEW Requirements

### Requirement: Single design system

The frontend SHALL use one unified OKLCH-based design system defined in `theme.css`, replacing the previous multi-theme system.

#### Scenario: CSS variables
- **WHEN** the application loads
- **THEN** CSS custom properties SHALL be defined in `:root` using OKLCH color space
- **THEN** the following token categories SHALL be available: backgrounds, text colors, borders, brand colors, sidebar colors, fonts, radii, shadows

#### Scenario: No multi-theme switching
- **WHEN** the application loads
- **THEN** there SHALL be exactly one theme (no theme class switching on `<html>`)
- **THEN** the theme store SHALL be removed or simplified to a single state
- **THEN** only one CSS file SHALL define all token values

#### Scenario: Global utility classes
- **WHEN** the application loads
- **THEN** the following global classes SHALL be available:
  - `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`
  - `.toggle` with `.toggle-slider` (custom switch)
  - `.card`, `.card-header`, `.card-body`
  - `.form-input`, `.form-group`, `.form-label`
  - `.search-input-wrap`
  - `.tag`, `.badge`
  - `.empty-state`, `.loading-spinner`

#### Scenario: Component CSS variable migration
- **WHEN** any component renders
- **THEN** all `var(--p-*)` references SHALL be replaced with the equivalent design token
- **THEN** `var(--p-text-primary)` → `var(--fg)`
- **THEN** `var(--p-text-secondary)` → `var(--muted)`
- **THEN** `var(--p-bg-page)` → `var(--bg)`
- **THEN** `var(--p-bg-elevated)` → `var(--surface)`
- **THEN** `var(--p-border-default)` → `var(--border)`
- **THEN** `var(--p-color-primary)` → `var(--accent)`
- **THEN** `var(--p-shadow-sm/md/lg)` → `var(--shadow-sm/md/lg)`
- **THEN** `var(--p-radius-sm/md/lg)` → `var(--radius-sm/md/lg)`

#### Scenario: Custom toggle replaces Ant Design switch
- **WHEN** the application renders any toggle switch
- **THEN** `<a-switch>` SHALL be replaced with `<label class="toggle"><input type="checkbox"><span class="toggle-slider"></span></label>`
- **THEN** the toggle SHALL use the design system's OKLCH accent color

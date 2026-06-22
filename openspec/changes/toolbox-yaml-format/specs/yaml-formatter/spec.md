## ADDED Requirements

### Requirement: YAML format

The system SHALL provide a YAML formatting tool in the toolbox that formats YAML input into a neatly indented output.

#### Scenario: Format valid YAML

- **WHEN** user inputs valid YAML text (e.g., `key: value\nlist:\n  - item1\n  - item2`) and clicks "格式化 ↓"
- **THEN** the output area SHALL display the YAML formatted with proper 2-space indentation, preserving the original key order

#### Scenario: Format invalid YAML

- **WHEN** user inputs invalid YAML text (e.g., malformed syntax or tabs used as indentation) and clicks "格式化 ↓"
- **THEN** the output area SHALL display a Chinese error message containing the specific parse error detail, e.g., `YAML 解析失败: Tabs are not allowed as indentation at line 2`

#### Scenario: Empty input

- **WHEN** user clicks "格式化 ↓" with empty input
- **THEN** the output area SHALL display a friendly Chinese prompt, e.g., "请输入 YAML 内容"

#### Scenario: Whitespace-only input

- **WHEN** user clicks "格式化 ↓" with whitespace-only input
- **THEN** the output area SHALL display a friendly Chinese prompt, e.g., "请输入 YAML 内容"

#### Scenario: Primitive YAML values

- **WHEN** user inputs a YAML document containing only a scalar value (e.g., `42`, `null`, or `hello`)
- **THEN** the output area SHALL display the formatted scalar value correctly

### Requirement: YAML tool UI integration

The YAML formatting tool SHALL be integrated into the existing toolbox page following the same dual-panel layout as other tools.

#### Scenario: Tool appears in sidebar

- **WHEN** user opens the toolbox page
- **THEN** the left sidebar SHALL display a "YAML 格式化" icon button among the existing tools

#### Scenario: Switch to YAML tool

- **WHEN** user clicks the "YAML 格式化" icon in the sidebar
- **THEN** the right content area SHALL display the YAML formatter panel with input textarea, "格式化 ↓" button, and readonly output textarea

#### Scenario: Output is readonly

- **WHEN** the YAML formatter panel is displayed
- **THEN** the output textarea SHALL have the `readonly` attribute set, matching the JSON tool behavior

#### Scenario: Comment loss notice

- **WHEN** the YAML formatter panel is displayed
- **THEN** a notice SHALL be shown near the tool header or action area indicating that YAML comments will be discarded after formatting

#### Scenario: Copy and paste

- **WHEN** user clicks the copy button below the output textarea
- **THEN** the output content SHALL be copied to clipboard and a success message SHALL be shown

- **WHEN** user clicks the paste button below the input textarea
- **THEN** clipboard text SHALL be pasted into the input textarea

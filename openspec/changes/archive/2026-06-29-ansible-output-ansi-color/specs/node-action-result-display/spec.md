# node-action-result-display Specification

## Purpose
Node action execution results displayed in a Drawer with Tab-based organization for better readability and troubleshooting.

## MODIFIED Requirements

### Requirement: Result content organized by tabs

The Drawer content SHALL use `a-tabs` to organize output into four categories.

#### Scenario: Tabs structure

- **WHEN** the Drawer is open with execution results
- **THEN** there SHALL be at least the following tabs:
  - "📋 关键信息" — extracted key info from `extractKeyInfo()`, return code, success/failure status
  - "📄 stdout" — full stdout output in `<pre>` format, with ANSI color codes rendered as colored text
  - "❌ stderr" — stderr output (only visible when stderr is non-empty)
  - "💻 命令" — the executed ansible-playbook command

#### Scenario: Stdout tab shows colored output

- **WHEN** the "📄 stdout" tab is active and the output contains ANSI escape sequences
- **THEN** SHALL render the text with ANSI color codes converted to HTML `<span style="color:...">` tags
- **THEN** SHALL use `v-html` to render the HTML content
- **THEN** SHALL ensure XSS safety by HTML-escaping all text before ANSI-to-HTML conversion

### Requirement: Copy log button

The Drawer SHALL provide a button to copy all execution logs to clipboard.

#### Scenario: Copy button copies plain text

- **WHEN** the user clicks "复制日志" button
- **THEN** all log content SHALL be copied to clipboard as plain text (no HTML tags, no ANSI codes)
- **THEN** a success message SHALL be shown

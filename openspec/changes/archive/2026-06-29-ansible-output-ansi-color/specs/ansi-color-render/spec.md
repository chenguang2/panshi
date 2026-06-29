# ansi-color-render Specification

## Purpose
ANSI 颜色代码在节点操作输出框中渲染为彩色文本，提高可读性。

## ADDED Requirements

### Requirement: ANSI color codes rendered as styled HTML

When Ansible output contains ANSI SGR escape sequences (e.g., `[0;32m`, `[0;31m`), the display component SHALL convert them to styled HTML spans with corresponding CSS colors.

#### Scenario: Green text for success

- **WHEN** stdout contains `[0;32mok: [192.168.100.42][0m`
- **THEN** the text "ok: [192.168.100.42]" SHALL be rendered in green color

#### Scenario: Red text for failure

- **WHEN** stdout contains `[0;31mfatal: [192.168.100.42]: FAILED![0m`
- **THEN** the text "fatal: [192.168.100.42]: FAILED!" SHALL be rendered in red color

#### Scenario: Blue text for PLAY header

- **WHEN** stdout contains `[1;34mPLAY [Run edge][0m`
- **THEN** the text "PLAY [Run edge]" SHALL be rendered in blue color

#### Scenario: Cyan text for TASK header

- **WHEN** stdout contains `[0;36mTASK [edge : run][0m`
- **THEN** the text "TASK [edge : run]" SHALL be rendered in cyan color

#### Scenario: Yellow text for warnings

- **WHEN** stdout contains `[0;33m[WARNING]: ...`
- **THEN** the warning text SHALL be rendered in yellow/amber color

#### Scenario: Magenta text for skipped items

- **WHEN** stdout contains `[0;35mskipping: [192.168.100.42][0m`
- **THEN** the skipped text SHALL be rendered in magenta color

#### Scenario: Reset code restores default color

- **WHEN** text after `[0m` follows colored text
- **THEN** it SHALL be rendered in the default log-box foreground color

### Requirement: XSS safety

The color rendering SHALL NOT introduce XSS vulnerabilities.

#### Scenario: HTML characters are escaped

- **WHEN** stdout contains text with `<script>` or other HTML tags
- **THEN** those tags SHALL be displayed as literal text, not executed as HTML
- **THEN** the conversion SHALL first HTML-escape the text, then replace ANSI codes with spans

### Requirement: ansiToHtml utility function

The system SHALL provide a reusable `ansiToHtml()` function for converting ANSI escape sequences to HTML.

#### Scenario: Function signature

- **WHEN** calling `ansiToHtml(text: string): string`
- **THEN** it SHALL return an HTML-safe string with ANSI codes replaced by `<span style="color:...">` tags
- **THEN** it SHALL NOT modify plain text without ANSI codes

#### Scenario: Copy preserves original text

- **WHEN** user clicks "复制日志" button
- **THEN** the copied text SHALL NOT contain HTML tags or ANSI codes — plain text only

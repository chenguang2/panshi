# traffic-split-card-editor

## Purpose

为 `traffic_split` 插件的 `splits` 字段提供可视化卡片编辑器，同时保留 JSON 模式支持复杂场景。

## Requirements

### Requirement: Card-based split editor

The `splits` field in traffic_split form mode SHALL render as a list of cards, each representing one split strategy.

#### Scenario: Split cards render
- **WHEN** a user opens traffic_split in form mode
- **THEN** each split strategy SHALL display as a card with "策略 #N" header

### Requirement: Condition expression row editing

Each split card SHALL display condition expressions as editable rows with field name, operator dropdown, and value input.

#### Scenario: Condition rows
- **WHEN** a split card is displayed
- **THEN** its conditions SHALL render as rows of [field input] [operator select] [value input]

### Requirement: Upstream selection with dropdown

Each split card SHALL display upstream targets with a dropdown for upstream selection and a number input for weight.

#### Scenario: Upstream rows
- **WHEN** a split card is displayed
- **THEN** its upstreams SHALL render as rows of [upstream select] [weight input]

### Requirement: Per-split JSON toggle

Each split card SHALL support toggling its condition expression between form mode and raw JSON textarea.

#### Scenario: Toggle expr mode
- **WHEN** a user clicks "切换JSON" on a split card
- **THEN** the condition section SHALL switch to a JSON textarea

### Requirement: Condition value type inference

The condition value SHALL be intelligently typed when serializing to JSON: plain numbers become number type, quoted strings become unquoted strings.

#### Scenario: Number vs string
- **WHEN** a user types `1` as condition value
- **THEN** the serialized JSON SHALL contain `1` (number)
- **WHEN** a user types `"1"` as condition value
- **THEN** the serialized JSON SHALL contain `"1"` (string)

### Requirement: Collapsible example

The splits editor SHALL include a collapsible example section showing valid configuration data.

#### Scenario: Example section
- **WHEN** a user clicks "展开 配置示例"
- **THEN** a read-only JSON viewer SHALL display example traffic_split configuration

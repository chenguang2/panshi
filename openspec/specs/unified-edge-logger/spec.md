# Unified Edge Logger

## Purpose

Replace 5 near-identical `log_xxx_operation` methods in `EdgeLogger` with a single parametrized `log_operation` method.

## ADDED Requirements

### Requirement: Single log_operation method
`EdgeLogger` SHALL provide a single `log_operation(resource_type, ...)` method that replaces the 5 existing `log_xxx_operation` methods.

#### Scenario: All log calls use unified method
- **WHEN** any publish/delete/rollback endpoint calls the logger
- **THEN** it calls `edge_logger.log_operation(resource_type=..., ...)` instead of the resource-specific method
- **THEN** the log file path is determined by a `resource_type → log_file` mapping
- **THEN** the label format is determined by a `resource_type → label_template` mapping

### Requirement: Backward-compatible aliases
The old `log_xxx_operation` method names SHALL be kept as thin wrappers that delegate to `log_operation`.

#### Scenario: Old method names still work
- **WHEN** `log_edge_operation(...)` is called
- **THEN** it delegates to `log_operation('upstream', ...)` with the same args
## Requirements
### Requirement: Single log_operation method
`EdgeLogger` SHALL provide a single `log_operation(resource_type, ...)` method that replaces the 5 existing `log_xxx_operation` methods.

#### Scenario: All log calls use unified method
- **WHEN** any publish/delete/rollback endpoint calls the logger
- **THEN** it calls `edge_logger.log_operation(resource_type=..., ...)` instead of the resource-specific method
- **THEN** the log file path is determined by a `resource_type → log_file` mapping
- **THEN** the label format is determined by a `resource_type → label_template` mapping

### Requirement: Backward-compatible aliases
The old `log_xxx_operation` method names SHALL be kept as thin wrappers that delegate to `log_operation`.

#### Scenario: Old method names still work
- **WHEN** `log_edge_operation(...)` is called
- **THEN** it delegates to `log_operation('upstream', ...)` with the same args


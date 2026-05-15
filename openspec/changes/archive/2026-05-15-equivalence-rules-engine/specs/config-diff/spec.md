## MODIFIED Requirements

### Requirement: Backend provides config diff API

The system SHALL provide a `GET /clusters/{cluster_id}/nodes/{node_id}/diff` endpoint that compares database configuration against a specific Edge node's running configuration, using the EquivalenceRules engine to normalize fields and reduce false mismatches.

#### Scenario: API returns structured diff results
- **WHEN** a GET request is sent to `/clusters/{cluster_id}/nodes/{node_id}/diff`
- **THEN** the response SHALL contain grouped comparisons for upstreams, routes, plugin_configs, global_rules, and plugin_metadata
- **THEN** each group SHALL list items with status: `match`, `mismatch`, `only_in_db`, or `only_in_edge`
- **THEN** mismatched items SHALL include field-level differences
- **THEN** equivalent fields (same value after default filling) SHALL NOT appear as differences

#### Scenario: load_balance field is properly mapped
- **WHEN** DB upstream has `load_balance="weighted_roundrobin"` and Edge has `type="roundrobin"`
- **THEN** they SHALL be considered equivalent (not shown as mismatch)

## MODIFIED Requirements

### Requirement: Frontend shows diff in Drawer

**FROM:** Frontend has independent diff page
**TO:** Frontend has inline-expand diff drawer

The system SHALL provide a Drawer panel on the cluster list page showing configuration comparison, with field-level differences expanded inline below each mismatched row.

#### Scenario: Mismatched items expand inline
- **WHEN** the user clicks "查看差异" on a mismatched row
- **THEN** the field-level comparison SHALL expand directly below that row
- **THEN** expanding another row SHALL NOT affect previously expanded rows

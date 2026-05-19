## REMOVED Requirements

### Requirement: Labels and Hosts fields in plugin config edit form

**Reason**: APISIX native fields not used in current business flow, causing UI clutter.

**Migration**: Fields removed. Users needing labels/hosts configuration should contact support for direct APISIX API access.

#### Scenario: Labels field no longer shown
- **WHEN** the user opens the plugin config create/edit modal in EdgeClient.vue
- **THEN** the "Labels (JSON)" form item SHALL NOT be displayed

#### Scenario: Hosts field no longer shown
- **WHEN** the user opens the plugin config create/edit modal in EdgeClient.vue
- **THEN** the "Hosts (JSON)" form item SHALL NOT be displayed

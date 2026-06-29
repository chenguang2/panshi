# stream-proxy-management Specification

## MODIFIED Requirements

### Requirement: Load balancing with chash shows hash key

When "一致性哈希" is selected, the form SHALL display the hash key information.

#### Scenario: chash shows remote_addr
- **WHEN** user selects "一致性哈希" as load balancing algorithm
- **THEN** a read-only field SHALL show "Hash Key: remote_addr"
- **THEN** the backend SHALL save `hash_on = 'vars'` and `key = 'remote_addr'`

### Requirement: Advanced config includes retries and health check

The advanced config section SHALL include retry count, retry timeout, and health check JSON.

#### Scenario: Retry fields
- **WHEN** user opens advanced config
- **THEN** "重试次数" and "重试超时（秒）" fields SHALL be visible
- **THEN** these fields SHALL be saved and published to Edge

### Requirement: Remote addr and SNI removed from UI

The advanced config SHALL no longer show Remote Addr and SNI fields.

#### Scenario: Fields removed
- **WHEN** user opens advanced config
- **THEN** "Remote Addr" and "SNI" fields SHALL NOT be present

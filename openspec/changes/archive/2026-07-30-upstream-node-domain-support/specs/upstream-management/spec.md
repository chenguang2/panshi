## MODIFIED Requirements

### Requirement: Upstream management page

Admins SHALL be able to view, search, filter, create, edit, delete, publish, and version-manage upstreams from a dedicated page.

#### Scenario: Table display
- **WHEN** upstreams exist
- **THEN** a table SHALL show columns: name+description, cluster, load-balance algorithm, target nodes, protocol, version, created time, actions
- **THEN** target nodes SHALL display as tags with weight
- **THEN** load-balance algorithm SHALL display as a badge
- **THEN** pagination SHALL be supported
- **AND** target nodes SHALL display `host:port` (host 可以是 IP 或域名)

#### Scenario: Create upstream
- **WHEN** admin clicks "新建上游"
- **THEN** a modal SHALL open with fields: name, 所属集群, load-balance algorithm, protocol, description, pass host, retries, target nodes
- **THEN** 所属集群 SHALL be required and selectable from existing clusters
- **THEN** target nodes SHALL support add/remove rows
- **THEN** target node address SHALL accept IPv4、IPv6（`::1` or `[::1]`）、domain name
- **THEN** target node address SHALL be auto-detected and validated accordingly
- **AND** invalid address SHALL display a specific error message
- **ON SAVE** the upstream SHALL be created via existing API
- **AND** IPv6 address without brackets SHALL be automatically wrapped as `[::1]` when building target string

#### Scenario: Edit upstream
- **WHEN** admin opens "编辑" modal
- **THEN** the target node address SHALL be parsed from stored `target` string correctly for IPv4 / IPv6 / domain
- **AND** IPv6 target `[::1]:80` SHALL parse into host=`[::1]` port=`80`
- **AND** domain target `foo.com:80` SHALL parse into host=`foo.com` port=`80`

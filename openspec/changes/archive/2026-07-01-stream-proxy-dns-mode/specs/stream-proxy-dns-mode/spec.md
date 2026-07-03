# stream-proxy-dns-mode Specification

## ADDED Requirements

### Requirement: Proxy type selection in step 1

Step 1 SHALL display a proxy type radio group after port selection: "普通四层代理" and "DNS 服务器". Default SHALL be "普通四层代理".

#### Scenario: Select proxy type
- **WHEN** user opens the create wizard
- **THEN** step 1 SHALL show a "代理类型" radio group with two options
- **AND** "普通四层代理" SHALL be selected by default
- **AND** selecting "DNS 服务器" SHALL change step 2 to DNS config form

#### Scenario: Edit always goes to step 1
- **WHEN** user edits an existing stream proxy
- **THEN** step 1 SHALL be shown first regardless of proxy type
- **AND** the current proxy type SHALL be pre-selected
- **AND** if user switches type, a confirm dialog SHALL warn about data loss

#### Scenario: Protocol select in DNS mode
- **WHEN** user is in DNS mode on step 2
- **THEN** the protocol selector SHALL be visible but disabled, showing "UDP"

### Requirement: Protocol selection (shared)

Step 2 SHALL support three protocol options: TCP, UDP, TCP+UDP. DNS mode SHALL fix to UDP.

#### Scenario: Select protocol
- **WHEN** user selects "TCP+UDP" in protocol toggle
- **THEN** the `protocol` field SHALL be omitted from Edge body
- **WHEN** user selects DNS mode
- **THEN** protocol SHALL be fixed to "UDP" and disabled

### Requirement: DNS mode step 2 form

When "DNS 服务器" is selected in step 1, step 2 SHALL show a DNS-specific configuration form.

#### Scenario: DNS form fields
- **WHEN** user is on step 2 with DNS mode selected
- **THEN** the form SHALL show: 名称 (text), 监听端口 (disabled), 协议 (UDP, disabled)
- **THEN** the form SHALL show a domain mapping list

#### Scenario: Domain mapping configuration
- **WHEN** user adds a domain
- **THEN** SHALL input: domain name, load balance algorithm (roundrobin/chash/least_conn)
- **THEN** SHALL add target nodes under each domain: target IP:port, client CIDR

#### Scenario: DNS advanced config
- **WHEN** user expands advanced config in DNS mode
- **THEN** SHALL show: timeout settings, keepalive pool, health check JSON
- **AND** SHALL NOT show Remote Addr / SNI fields

### Requirement: List card shows DNS tag

Stream proxy list cards SHALL display a "DNS" tag for DNS-mode proxies.

#### Scenario: Show DNS tag
- **WHEN** a stream proxy has `proxy_type === 'dns'`
- **THEN** the card topbar SHALL show a "DNS" label/badge

### Requirement: Publish DNS proxy to Edge

When publishing a DNS-mode stream proxy, the Edge API body SHALL include `dns_upstream` plugin config.

#### Scenario: Publish DNS proxy
- **WHEN** user publishes a DNS-mode stream proxy
- **THEN** the Edge body SHALL contain `protocol: "UDP"` and `plugins.dns_upstream.hosts`
- **THEN** the Edge body SHALL NOT contain a standard `upstream` object

#### Scenario: Publish both TCP+UDP
- **WHEN** user publishes with protocol "TCP+UDP"
- **THEN** the Edge body SHALL NOT contain a `protocol` field

# Spec: edge-client

## ADDED Requirements

### Requirement: SM4 encryption support

The system SHALL provide SM4 ECB encryption with PKCS7 padding for all edge server communications.

### Requirement: Base64 encoding support

The system SHALL encode encrypted data in Base64 format for HTTP transmission.

#### Scenario: Encrypt request body
- **WHEN** edge client needs to send a request to edge server
- **THEN** the request body SHALL be encrypted using SM4 ECB with PKCS7 padding
- **AND** the encrypted data SHALL be Base64 encoded before transmission

### Requirement: SM4 decryption support

The system SHALL provide SM4 ECB decryption with PKCS7 padding for edge server responses.

#### Scenario: Decrypt response body
- **WHEN** edge client receives a response from edge server
- **THEN** the response body SHALL be Base64 decoded
- **AND** the decoded data SHALL be decrypted using SM4 ECB with PKCS7 padding

### Requirement: Edge server node resolution

The system SHALL resolve edge server address from cluster node configuration.

#### Scenario: Get edge server URL from cluster node
- **WHEN** edge client is initialized with a cluster_id
- **THEN** the system SHALL query the database for an active node in the cluster
- **AND** construct the edge server URL as `http://{node.ip}:{node.management_port}`

### Requirement: Edge server authentication

The system SHALL authenticate with edge server using API key from cluster configuration.

#### Scenario: Include API key in request header
- **WHEN** edge client makes any request to edge server
- **THEN** the request SHALL include `X-API-KEY` header with value from `ps_cluster.admin_key`

### Requirement: Edge server HTTP methods

The system SHALL support GET, POST, PUT, PATCH, DELETE HTTP methods for edge API calls.

#### Scenario: Support standard REST methods
- **WHEN** edge client receives a request to call edge API
- **THEN** the client SHALL support GET, POST, PUT, PATCH, DELETE methods
- **AND** each method SHALL properly encrypt request body (if any)
- **AND** each method SHALL decrypt response body (if any)
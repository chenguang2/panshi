# route-sync Specification

## Purpose
Define how route data is synchronized between the management system and edge servers.

## Requirements

### Requirement: Route data format for edge

The system SHALL convert local route format to edge API format, including all plugin configurations.

#### Scenario: Convert route to edge PUT format with plugins
- **WHEN** preparing route data for edge API PUT `/edge/admin/routes/{edge_uuid}`
- **THEN** include fields: uri, name, methods, hosts, upstream_id (as edge_uuid string)
- **AND** include plugins if configured
- **AND** include vars and priority if set
- **AND** plugins config SHALL be properly serialized as JSON objects, not nested JSON strings

#### Scenario: Plugins are preserved during publish
- **WHEN** user publishes a route that has plugins configured
- **THEN** the plugins SHALL be correctly stored in ConfigVersion
- **AND** the plugins SHALL be correctly sent to edge server
- **AND** the edge server SHALL receive plugins with parsed JSON config objects

Edge API Request Format (PUT):
```json
{
    "uri": "/api/*",
    "name": "route_name",
    "methods": ["GET", "POST"],
    "hosts": ["example.com"],
    "upstream_id": "<upstream_edge_uuid>",
    "priority": 10,
    "vars": [["arg_name", "==", "json"]],
    "plugins": {
        "plugin_name": {
            "option": "value"
        }
    }
}
```

#### Scenario: Plugin config stored as JSON object not string
- **WHEN** plugins are stored in ConfigVersion
- **THEN** each plugin's config field SHALL be stored as a JSON string in the database
- **AND** when converting to edge format, config SHALL be parsed from JSON string to object
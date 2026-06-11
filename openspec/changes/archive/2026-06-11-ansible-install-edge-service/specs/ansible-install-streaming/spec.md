## ADDED Requirements

### Requirement: SSE streaming endpoint SHALL return ansible output in real-time
The install endpoints SHALL use `StreamingResponse` with `media_type="text/event-stream"` to stream ansible-runner output line by line.

#### Scenario: Receive installation logs line by line
- **WHEN** user triggers an install operation
- **THEN** the response SHALL be an SSE stream (`text/event-stream`)
- **AND** each SSE event SHALL contain a JSON payload with `line` (log text) and `percent` (progress 0-100)
- **AND** the stream SHALL remain open until the playbook completes

#### Scenario: Final event on completion
- **WHEN** the ansible playbook finishes
- **THEN** the last SSE event SHALL contain `rc` (return code), `status` (success/failed), and `percent: 100`

### Requirement: Frontend SHALL consume stream via fetch + ReadableStream
The frontend SHALL use `fetch()` POST with `response.body.getReader()` to consume the install stream and append log lines in real-time.

#### Scenario: Streaming log display
- **WHEN** an install operation starts
- **THEN** the frontend SHALL POST to the install endpoint with `fetch()`
- **AND** SHALL read the response body stream via `reader.read()` in a loop
- **AND** SHALL parse SSE-formatted events (`data: {...}\n\n`) from the stream chunks
- **AND** each received `line` field SHALL be appended to the log display
- **AND** the progress bar SHALL update based on `percent`
- **AND** on the final event (with `rc` and `status`), the stream SHALL be closed

#### Scenario: Connection recovery
- **WHEN** the stream connection drops before the final event
- **THEN** the frontend SHALL show a reconnect option (manual retry)

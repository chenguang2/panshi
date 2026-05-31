# execution-progress-timer Specification

## Purpose
Progress bar pulses and elapsed time display during edge node operations, providing better user feedback during long-running API calls.

## Requirements

### Requirement: Progress bar pulses during API execution
The progress bar SHALL increment automatically while the API request is in flight, so the user sees the operation is still active.

#### Scenario: Pulse timer during executeNodeAction
- **WHEN** the API request starts in `executeNodeAction` or `queryNodeStatus`
- **THEN** a `setInterval` SHALL increment progress by 5 every 2 seconds until the API returns
- **THEN** the pulse SHALL stop as soon as the API response is received
- **THEN** the pulse SHALL NOT exceed 55% for node actions or 65% for status queries

### Requirement: Elapsed seconds display
The Drawer SHALL display elapsed seconds from operation start, updated in real-time.

#### Scenario: Elapsed time shown
- **WHEN** the operation starts
- **THEN** the Drawer SHALL show "已用 X 秒" below the progress bar
- **THEN** the text SHALL be centered, 14px font, updated every second
- **THEN** the elapsed time SHALL stop incrementing when the operation completes

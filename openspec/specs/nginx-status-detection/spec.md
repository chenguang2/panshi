# nginx-status-detection Specification

## Purpose
Nginx process status detection by parsing ansible command output.

## Requirements

### Requirement: Nginx running status detected from command output

The system SHALL determine Nginx process status by parsing the stdout of ansible commands (nginx_cmd_run and edge_statistic), rather than relying solely on command return codes.

#### Scenario: Nginx is running
- **WHEN** the stdout contains "Nginx process (PID: X) is running." or "Nginx started successfully (PID: X)." or "Nginx process is already running (PID: X)."
- **THEN** `status_detail.nginx.nginx_running` SHALL be `true`
- **THEN** `status_detail.nginx.nginx_status` SHALL be "running" or "started"
- **THEN** `status_detail.nginx.nginx_pid` SHALL be set to the PID

#### Scenario: Nginx is not running
- **WHEN** the stdout contains "Nginx process does not exist."
- **THEN** `status_detail.nginx.nginx_running` SHALL be `false`
- **THEN** `status_detail.nginx.nginx_status` SHALL be "not_exist"

#### Scenario: Nginx was stopped
- **WHEN** the stdout contains "Nginx process has been stopped."
- **THEN** `status_detail.nginx.nginx_running` SHALL be `false`
- **THEN** `status_detail.nginx.nginx_status` SHALL be "stopped"

#### Scenario: Nginx start failed
- **WHEN** the stdout contains "Failed to start Nginx."
- **THEN** `status_detail.nginx.nginx_running` SHALL be `false`
- **THEN** `status_detail.nginx.nginx_status` SHALL be "start_failed"

#### Scenario: Status column reflects nginx state
- **WHEN** `status_detail.nginx.nginx_running` is `true`
- **THEN** the status column SHALL display a green badge with text "健康"
- **WHEN** `status_detail.nginx.nginx_running` is `false`
- **THEN** the status column SHALL display a red badge with text "离线"
- **WHEN** no `nginx` data exists (never executed an action)
- **THEN** the status SHALL fall back to `node.status === 1`

#### Scenario: Nginx status persists across different ansible tags
- **WHEN** executing "状态查询" (edge_statistic) after having executed "启动" (nginx_cmd_run)
- **THEN** the `nginx` field SHALL NOT be overwritten; it SHALL be preserved in `status_detail`
- **WHEN** executing "状态查询" and cron_check.sh also outputs nginx status
- **THEN** the `nginx` field SHALL be updated with the latest nginx status from the statistic output

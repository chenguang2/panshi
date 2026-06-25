# ssh-password-fallback

## Purpose

SSH 远程执行命令时支持密码认证回退。当节点未配置免密登录时，自动从 inventory/host 文件读取密码并使用 `sshpass` 重试，避免因免密不可用导致操作失败。

## Requirements

### Requirement: SSH password fallback for remote execution

The SSH remote execution SHALL support both passwordless (key-based) and password-based authentication.

When executing remote commands during the OpenResty installation phase 2, the system SHALL first attempt key-based SSH with `BatchMode=yes`. If that fails due to authentication rejection (exit code 255 or "Permission denied" in output), the system SHALL retry with password authentication using credentials from the inventory/host file.

#### Scenario: Key-based auth succeeds
- **WHEN** a remote SSH command is executed
- **THEN** the system SHALL first attempt key-based SSH with `-i ~/.ssh/id_rsa -o BatchMode=yes`
- **AND** if the SSH connection succeeds (exit code 0), the command SHALL be considered successful

#### Scenario: Key-based auth fails, password fallback succeeds
- **WHEN** key-based SSH fails with exit code 255 or output containing "Permission denied"
- **THEN** the system SHALL retry with `sshpass -p <password> ssh` using the credentials from inventory/host file
- **AND** if `sshpass` SSH succeeds, the overall result SHALL be success

#### Scenario: Both auth methods fail
- **WHEN** both key-based and password-based SSH fail
- **THEN** the system SHALL report the failure with the original SSH error output
- **AND** SHALL NOT mask the error details

#### Scenario: Password resolution from inventory
- **WHEN** password fallback is triggered
- **THEN** the system SHALL read `ansible_ssh_pass` from inventory/host for the target IP
- **AND** SHALL use host-level password first, falling back to group vars if host-level is absent
- **AND** if no password is configured, SHALL skip password fallback and report key-based auth failure

#### Scenario: sshpass not installed
- **WHEN** `sshpass` is not installed on the backend server and key-based SSH fails
- **THEN** the system SHALL NOT attempt password authentication
- **AND** SHALL report an error with installation hint: "提示: 免密登录失败，且 sshpass 未安装，无法使用密码认证。请安装 sshpass 后重试: sudo apt-get install sshpass"

#### Scenario: Transition notification during fallback
- **WHEN** key-based SSH fails and password fallback is about to start
- **THEN** the system SHALL emit an SSE event: "免密登录失败，正在尝试密码认证..."
- **AND** proceed to attempt password authentication

#### Scenario: Both auth methods fail with merged error
- **WHEN** both key-based and password-based SSH fail
- **THEN** the system SHALL report the failure with both error outputs merged
- **AND** SHALL include both the key-based auth error and the password auth error in the final message

# start-stop-scripts

## Purpose

定义项目启动/停止脚本的端口配置规范和进程安全停止机制，确保多环境下端口统一、进程停止安全可靠。

## Requirements

### Requirement: Port assignment

The system SHALL use standardized port numbers across product/ and develop/ environments.

- **product/** environment SHALL default to port **12345** for the backend service (which also serves frontend static files)
- **develop/** environment SHALL default to port **12344** for the backend service and **12345** for the frontend dev server
- The default port SHALL be configurable via command-line argument (first priority), environment variable `PANSHI_PORT` (second priority), or fallback to compiled default (lowest priority)
- In product/ scripts, `DEFAULT_PORT` SHALL be set to `12345`
- In develop/ Linux scripts, `BACKEND_PORT` SHALL be `12344` and `FRONTEND_PORT` SHALL be `12345`
- In develop/ Windows scripts, `$BACKEND_PORT` SHALL be `12344` and `$FRONTEND_PORT` SHALL be `12345`

#### Scenario: product/ scripts use default port 12345

- **WHEN** `product/linux/start.sh` (or mac/windows equivalent) is executed without arguments
- **THEN** the backend SHALL start on port 12345

#### Scenario: develop/ scripts use port 12344 and 12345

- **WHEN** `develop/linux/start.sh` (or windows equivalent) is executed
- **THEN** the backend SHALL start on port 12344 and the frontend on port 12345

#### Scenario: Port override via argument

- **WHEN** `product/linux/start.sh 8080` is executed
- **THEN** the backend SHALL start on port 8080 instead of the default 12345

#### Scenario: Port override via environment variable

- **WHEN** `PANSHI_PORT=8080 product/linux/start.sh` is executed
- **THEN** the backend SHALL start on port 8080

### Requirement: Stop script process verification

The stop scripts SHALL verify the target process identity before force-killing by port.

The verification SHALL work as follows:
1. First, attempt to stop gracefully via PID file (SIGTERM) — existing behavior, unchanged
2. If PID file method fails or file is missing, fall back to port-based lookup
3. When looking up by port:
   - Find the PID listening on the target port
   - Verify the process command line contains `app.main:app`
   - Only proceed with SIGKILL if the process name matches
4. If no matching process is found, skip the kill safely

#### Scenario: Linux process verification via /proc

- **WHEN** `product/linux/stop.sh` is executed and a process is found on the target port
- **THEN** the script SHALL read `/proc/$PID/cmdline` and verify it contains `app.main:app` before killing

#### Scenario: macOS process verification via ps

- **WHEN** `product/mac/stop.sh` is executed and a process is found on the target port
- **THEN** the script SHALL use `ps -p $PID -o command=` to verify the command line contains `app.main:app` before killing

#### Scenario: Windows process verification via WMI

- **WHEN** `product/windows/stop.ps1` or `develop/windows/stop.ps1` is executed and a process is found on the target port
- **THEN** the script SHALL use `Get-CimInstance Win32_Process` to verify the `CommandLine` contains `app.main:app` before killing

#### Scenario: Mismatched process is not killed

- **WHEN** a stop or start script is executed and the process on the target port is NOT running `app.main:app`
- **THEN** the script SHALL NOT kill the process

#### Scenario: Process verification fails silently

- **WHEN** `/proc/$PID/cmdline` (Linux) or `ps` (macOS) cannot be read due to permissions
- **THEN** the script SHALL skip the kill safely, without exiting with an error

### Requirement: Start script pre-start cleanup

The start scripts SHALL verify the target process identity before killing any existing process on the target port during startup.

The verification SHALL work the same way as the stop script port-based verification:
- Find the PID listening on the target port
- Verify the process command line contains `app.main:app`
- Only proceed with SIGKILL if the process name matches

#### Scenario: Linux start script pre-start verification

- **WHEN** `product/linux/start.sh` is executed and a process is found on the target port
- **THEN** the script SHALL read `/proc/$PID/cmdline` and verify it contains `app.main:app` before killing

#### Scenario: macOS start script pre-start verification

- **WHEN** `product/mac/start.sh` is executed and a process is found on the target port
- **THEN** the script SHALL use `ps -p $PID -o command=` to verify the command line contains `app.main:app` before killing

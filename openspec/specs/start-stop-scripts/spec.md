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
   - Find ALL PIDs listening on the target port (multiple PIDs are expected when a supervisor and its worker share the listening socket)
   - Verify EACH PID's process command line individually before killing it
   - Backend port: command line MUST match `app.main:app` OR the uvicorn spawn-worker bootstrap (`spawn_main`, whose command line lacks `app.main:app` while the worker holds the listening socket), anchored to this project's backend path; frontend port: command line MUST contain `vite` or `npm`
   - Only proceed with SIGKILL on PIDs whose command line matches; PIDs that fail verification are skipped
4. If no matching process is found, skip the kill safely
5. After port-based sweep, perform a command-line sweep scoped to this project's paths (catching processes that drifted to unexpected ports), applying the same per-PID verification

#### Scenario: Linux process verification via /proc

- **WHEN** `product/linux/stop.sh` is executed and a process is found on the target port
- **THEN** the script SHALL read `/proc/$PID/cmdline` and verify it contains `app.main:app` before killing

#### Scenario: Linux multiple PIDs sharing the port are all verified and killed

- **WHEN** `develop/linux/stop.sh` is executed and the backend port is held by multiple PIDs (e.g. uvicorn reloader + worker sharing the listening socket)
- **THEN** the script SHALL verify each PID's `/proc/$PID/cmdline` individually
- **AND** every PID whose command line matches SHALL be killed, not only the first

#### Scenario: Linux drifted-port orphan sweep

- **WHEN** a project dev process (e.g. frontend vite) is listening on an unexpected port because its preferred port was occupied, and it is no longer attached to the normal port sweep
- **THEN** `develop/linux/stop.sh` SHALL locate it by command-line pattern (scoped to this project's paths: backend `uvicorn app.main:app`, frontend `node_modules/.bin/vite`)
- **AND** each candidate SHALL be verified via `/proc/$PID/cmdline` before being killed

#### Scenario: Unrelated same-name process is not killed

- **WHEN** the command-line sweep finds a process whose command line matches the pattern but which does not belong to this project (different working directory or path)
- **THEN** the script SHALL NOT kill it

#### Scenario: macOS process verification via ps

- **WHEN** `product/mac/stop.sh` is executed and a process is found on the target port
- **THEN** the script SHALL use `ps -p $PID -o command=` to verify the command line contains `app.main:app` before killing

#### Scenario: Windows process verification via WMI

- **WHEN** `product/windows/stop.ps1` or `develop/windows/stop.ps1` is executed and a process is found on the target port
- **THEN** the script SHALL use `Get-CimInstance Win32_Process` to verify the `CommandLine` contains `app.main:app` before killing

#### Scenario: uvicorn spawn worker holding the port is verified and killed

- **WHEN** the backend port is held by a uvicorn `--reload` spawn worker whose command line contains only the multiprocessing `spawn_main` bootstrap (not `app.main:app`)
- **THEN** the script SHALL treat it as a matching backend process (identity = `app.main:app` OR `spawn_main`, anchored to this project's backend path)
- **AND** the port-based sweep and the start pre-check SHALL kill/clean it instead of misclassifying it as an unrelated process

#### Scenario: Mismatched process is not killed

- **WHEN** a stop or start script is executed and the process on the target port does NOT match the backend identity (`app.main:app` or the project-anchored `spawn_main` worker form) or the frontend identity (`vite`/`npm`)
- **THEN** the script SHALL NOT kill the process

#### Scenario: Process verification fails silently

- **WHEN** `/proc/$PID/cmdline` (Linux) or `ps` (macOS) cannot be read due to permissions
- **THEN** the script SHALL skip the kill safely, without exiting with an error

### Requirement: Start script pre-start cleanup

The start scripts SHALL verify the target process identity before killing any existing process on the target port during startup.

The verification SHALL work the same way as the stop script port-based verification:
- Find ALL PIDs listening on the target port
- Verify each PID's command line individually (backend identity: `app.main:app` OR the project-anchored `spawn_main` worker form; frontend: `vite`/`npm`)
- Only proceed with kill on PIDs whose command line matches

`develop/linux/start.sh` SHALL additionally refuse to start when the target port is held by a process that fails identity verification, instead of crashing later with an address-in-use error.

#### Scenario: Linux start script pre-start verification

- **WHEN** `product/linux/start.sh` is executed and a process is found on the target port
- **THEN** the script SHALL read `/proc/$PID/cmdline` and verify it contains `app.main:app` before killing

#### Scenario: develop start script cleans up verified stale process before starting

- **WHEN** `develop/linux/start.sh` is executed while the backend or frontend port is held by a process whose command line matches the project identity patterns
- **THEN** the script SHALL stop that process (SIGTERM first, escalating to SIGKILL if it survives) before launching the new service
- **AND** startup SHALL proceed to bind the port successfully

#### Scenario: develop start script refuses to start on mismatched occupation

- **WHEN** `develop/linux/start.sh` is executed while a target port is held by a process that fails identity verification
- **THEN** the script SHALL print an error naming the occupying process and instructing the operator to run `develop/linux/stop.sh` or handle it manually
- **AND** the script SHALL exit with a non-zero code without killing the occupying process

#### Scenario: Port override via environment variable

- **WHEN** `BACKEND_PORT` or `FRONTEND_PORT` environment variables are set when invoking `develop/linux/start.sh` or `develop/linux/stop.sh`
- **THEN** the scripts SHALL use those values instead of the defaults (12344/12345)

#### Scenario: macOS start script pre-start verification

- **WHEN** `product/mac/start.sh` is executed and a process is found on the target port
- **THEN** the script SHALL use `ps -p $PID -o command=` to verify the command line contains `app.main:app` before killing

## ADDED Requirements

### Requirement: Scripts accept port parameter
The 4 deployment scripts (Linux start/stop, Windows start/stop) SHALL accept a port number to override the default.

#### Scenario: Start with custom port via argument
- **WHEN** user runs `bash start.sh 8080` or `.\start.ps1 8080`
- **THEN** the backend SHALL start listening on port 8080 instead of the default 9000
- **THEN** the backend SHALL write `8080` to `backend/.port`

#### Scenario: Stop with custom port via argument
- **WHEN** user runs `bash stop.sh 8080` or `.\stop.ps1 8080`
- **THEN** the script SHALL kill the process listening on port 8080

#### Scenario: Start and stop with environment variable
- **WHEN** `PANSHI_PORT` environment variable is set
- **THEN** start script SHALL use `PANSHI_PORT` if no command-line argument is given
- **THEN** stop script SHALL use `PANSHI_PORT` if no command-line argument is given

#### Scenario: Stop reads port from file
- **WHEN** user runs `bash stop.sh` without arguments
- **THEN** the script SHALL read port from `backend/.port` file (written by start)
- **THEN** the script SHALL kill the process on that port

#### Scenario: Default fallback to 9000
- **WHEN** no argument, no `PANSHI_PORT`, and no `.port` file exist
- **THEN** both start and stop SHALL use the default port 9000

#### Scenario: Default port is configurable in script
- **WHEN** a user opens start.sh or start.ps1
- **THEN** they SHALL see `DEFAULT_PORT=9000` at the top of the script
- **THEN** they SHALL be able to modify this value to change the default port

### Requirement: PID and port files stored in project directory
The PID file SHALL be moved from `/tmp/panshi_backend.pid` to `backend/.pid`. The port file SHALL be stored at `backend/.port`.

#### Scenario: PID file location
- **WHEN** Linux start.sh runs
- **THEN** it SHALL write PID to `backend/.pid` instead of `/tmp/panshi_backend.pid`

#### Scenario: Port file location
- **WHEN** start script runs with custom port
- **THEN** it SHALL write the port to `backend/.port`

#### Scenario: Port and PID files are gitignored
- **WHEN** checking git status
- **THEN** `backend/.port` and `backend/.pid` SHALL be listed in `.gitignore` and not tracked

### Requirement: Backward compatible
Scripts SHALL work without any arguments, preserving existing behavior.

#### Scenario: No arguments uses default port
- **WHEN** user runs `bash start.sh` without arguments
- **THEN** backend SHALL start on port 9000

#### Scenario: Stop without arguments
- **WHEN** user runs `bash stop.sh` without arguments
- **THEN** it SHALL stop the backend on the previously used port (or default 9000)

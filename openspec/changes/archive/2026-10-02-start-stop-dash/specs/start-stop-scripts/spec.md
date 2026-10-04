# start-stop-scripts Delta

## ADDED Requirements

### Requirement: POSIX shell invocation guard (sh re-exec)

`develop/linux/start.sh` and `develop/linux/stop.sh` SHALL guard against invocation with a non-bash POSIX shell (`sh`/dash): a dash-parseable top guard SHALL detect an unset `$BASH`, verify `bash` availability via `command -v`, and re-exec the script under bash with `exec bash "$0" "$@"`. `start.sh` relies on bash-only syntax beyond its prologue; `stop.sh` SHALL remain fully dash-parseable today, with the guard as forward compatibility for future edits.

#### Scenario: sh start.sh re-execs under bash

- **WHEN** `sh develop/linux/start.sh` is invoked
- **THEN** the guard SHALL re-exec the script under bash before any bash-only code runs
- **AND** the pre-start port check SHALL behave identically to a direct `bash start.sh` invocation (e.g. refusing to start with a named occupant and guidance when a port is held by a mismatched process) instead of failing with a dash parse error

#### Scenario: sh stop.sh completes the no-op contract

- **WHEN** `sh develop/linux/stop.sh` is invoked with no matching processes running
- **THEN** the script SHALL complete normally (empty-run contract) without bash-only syntax errors

#### Scenario: direct bash invocation is unaffected

- **WHEN** `bash develop/linux/start.sh` (or `./start.sh` with a bash shebang) is invoked
- **THEN** `$BASH` is set and the guard SHALL be a no-op, with behavior byte-identical to the pre-guard script

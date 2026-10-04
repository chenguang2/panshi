# Unified Deploy Output

## Purpose

为 磐石Admin 生成自包含的 Linux 离线部署包，所有运行必需文件统一输出到单个目录，即拷即用。

## Requirements

### Requirement: Single self-contained deployment directory

`gen-linux.sh` SHALL generate all deployment artifacts into a single directory `product/linux/panshi/`.

#### Scenario: Output directory structure
- **WHEN** `bash gen-linux.sh` completes successfully
- **THEN** directory `product/linux/panshi/` SHALL exist with the following structure:
  - `backend/app/` — backend source code (without `__pycache__`)
  - `backend/ansible/` — Ansible playbooks and roles
  - `backend/python/` — standalone Python 3.11 interpreter
  - `backend/.venv/` — virtual environment with all dependencies
  - `backend/pyproject.toml` — project metadata
  - `backend/data/` — writable directory for SQLite database
  - `frontend/dist/` — built frontend static files
  - `start.sh` — deployment start script
  - `stop.sh` — deployment stop script

#### Scenario: No stray artifacts in project root
- **WHEN** `gen-linux.sh` completes
- **THEN** no new files or directories SHALL be created outside `product/linux/panshi/`, except for build intermediates in the source project's `frontend/node_modules/` and `frontend/dist/`

### Requirement: Deploy directory is relocatable

The generated deployment package SHALL work correctly when copied to any absolute path on the target Linux machine.

#### Scenario: .pth uses relative path
- **WHEN** `gen-linux.sh` completes
- **THEN** the `.pth` file in `backend/.venv/lib/python*/site-packages/__editable__*.pth` SHALL contain a relative path, not the development machine's absolute path

#### Scenario: Start script resolves paths from its own location
- **WHEN** `start.sh` runs from the deployment directory
- **THEN** `PROJECT_ROOT` SHALL resolve to the deployment directory itself, independent of where it was copied

### Requirement: Scripts are POSIX-compatible

`gen-linux.sh`, `start.sh`, and `stop.sh` SHALL work correctly when invoked with `sh` (e.g., dash).

#### Scenario: No bash-ism syntax
- **WHEN** running `sh gen-linux.sh`, `sh start.sh`, or `sh stop.sh`
- **THEN** the script SHALL NOT use `&>` redirect syntax; only POSIX `>/dev/null 2>&1` SHALL be used

### Requirement: Ansible operations work in deployment

Edge node management (start/stop/statistic) SHALL work in the deployment environment.

#### Scenario: private_data_dir exists
- **WHEN** running an Ansible playbook via `AnsibleRunnerService`
- **THEN** the `private_data_dir` path SHALL resolve to a valid `backend/ansible/` directory within the deployment package

### Requirement: Unified backend dependency installation and PyPI mirror configuration

`gen-linux.sh` SHALL delegate backend dependency installation (step 4) to `product/tools/install-backend-deps.sh`, which SHALL pick the first available installation mode: fully offline via `WHEELS_DIR` (`pip --no-index --find-links` plus `--no-build-isolation`, wheels produced by `product/tools/vendor-wheels.sh`) → `uv pip install` (aggressive cache reuse) → plain pip fallback. The mirror SHALL resolve with the priority: `PIP_INDEX_URL` environment variable > `product/tools/.mirror` (persisted by `product/tools/switch-pypi-mirror.sh`) > aliyun default, and the helper SHALL override `UV_DEFAULT_INDEX`/`UV_INDEX_URL`/`PIP_INDEX_URL` inside its process tree so that machine-level environment pointing at a throttled mirror cannot break packaging.

#### Scenario: gen-linux delegates to the unified install entry

- **WHEN** `bash gen-linux.sh` runs step 4
- **THEN** backend dependencies SHALL be installed via `product/tools/install-backend-deps.sh` with the offline → uv → pip mode priority
- **AND** the mirror environment variables SHALL be overridden within the helper's process tree, regardless of the invoking shell's values

#### Scenario: mirror selection persists across platforms

- **WHEN** an operator selects a mirror in `product/tools/switch-pypi-mirror.sh` (interactive menu, preset name, index number, or full URL; unrecognized input SHALL exit with code 1 after printing the menu)
- **THEN** the `-i <mirror>` literals in all three gen scripts SHALL be rewritten idempotently, with a residual non-target mirror count of 0 validated after the rewrite
- **AND** the choice SHALL be persisted to `product/tools/.mirror` (machine-local, git-ignored)
- **AND** `install-backend-deps.sh` and `vendor-wheels.sh` SHALL read `.mirror` as the default mirror (a one-shot `PIP_INDEX_URL` still wins), so the selection applies consistently on linux/mac/windows

#### Scenario: offline wheels are vendored to product/wheels

- **WHEN** `product/tools/vendor-wheels.sh` runs
- **THEN** it SHALL lock dependencies via `uv pip compile` and download the full wheel set to `product/wheels/` (a git-ignored, rebuildable local cache that MUST be re-run after pyproject dependency changes)
- **AND** installing with `WHEELS_DIR` pointing at that directory SHALL complete without any network access

#### Scenario: temp files do not depend on agent workspace

- **WHEN** `vendor-wheels.sh` creates its mktemp template or download-failure log
- **THEN** the base directory SHALL be `${TMPDIR:-/tmp}` (never a hardcoded agent workspace path such as `/tmp/opencode`)
- **AND** the trap cleanup SHALL cover the failure log as well

#### Scenario: packaging hints follow the actual mirror

- **WHEN** `switch-pypi-mirror.sh` rewrites a gen script's mirror with `-i <URL>`
- **THEN** the adjacent hint line (bash `echo` / PowerShell `Write-Host` forms) SHALL be rewritten in the same pass to embed the actual mirror URL, and re-running the switch SHALL be idempotent

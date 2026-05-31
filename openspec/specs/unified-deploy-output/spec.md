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

# mac-deployment

## Purpose

macOS 平台的离线部署能力，包括部署准备（gen-mac.sh）、启动（start.sh）、停止（stop.sh）三个脚本，使 macOS 开发者和目标机器能够完成磐石 Admin 的离线部署。

## Requirements

### Requirement: macOS deployment preparation script (gen-mac.sh)

The system SHALL provide a `product/mac/gen-mac.sh` script that prepares an offline macOS deployment package.

#### Scenario: Script copies backend source code
- **WHEN** user runs `bash product/mac/gen-mac.sh`
- **THEN** the script copies `backend/app/`, `backend/ansible/`, and `backend/pyproject.toml` to `product/mac/panshi/backend/`

#### Scenario: Script downloads standalone Python 3.11
- **WHEN** running gen-mac.sh step 2
- **THEN** `uv python install 3.11` downloads standalone Python and copies it to `panshi/backend/python/`

#### Scenario: Script creates virtual environment with dylib fix
- **WHEN** running gen-mac.sh step 3
- **THEN** the script creates `.venv` using `--without-pip`, copies `libpython3.11.dylib` to `.venv/lib/`, and runs `ensurepip` to install pip

#### Scenario: Script installs backend dependencies
- **WHEN** running gen-mac.sh step 4
- **THEN** the script installs all Python dependencies into the `.venv` through the PyPI mirror configured in the script (default `https://mirrors.aliyun.com/pypi/simple/`)
- **AND** the mirror SHALL remain switchable via `product/tools/switch-pypi-mirror.sh`, which idempotently rewrites the `-i <mirror>` literals in all three gen scripts (linux/mac/windows) and validates that the residual non-target mirror count is 0

#### Scenario: Script installs Ansible collections
- **WHEN** running gen-mac.sh step 4.6
- **THEN** the script installs Ansible collections from `requirements.yml` into `panshi/backend/ansible/collections/`

#### Scenario: Script corrects .pth to relative paths
- **WHEN** running gen-mac.sh step 4.5
- **THEN** the script rewrites `__editable__*.pth` to use relative paths for deploy directory portability

#### Scenario: Script builds frontend
- **WHEN** running gen-mac.sh step 5
- **THEN** the script builds the frontend via `npm install && npm run build` and copies `dist/` to `panshi/frontend/dist/`

#### Scenario: npm registry hint matches the actual mirror
- **WHEN** gen-mac.sh prints the frontend build hint about the npm registry
- **THEN** the hint SHALL name npmmirror（阿里运营的国内 npm 镜像，原淘宝源）with the actual registry `registry.npmmirror.com`
- **AND** the hint SHALL NOT claim a different provider (e.g. 清华/Tsinghua)

#### Scenario: Script copies start/stop scripts with corrected paths
- **WHEN** running gen-mac.sh final step
- **THEN** the script copies `start.sh` and `stop.sh` to `panshi/` and uses `sed -i ''` to fix PROJECT_ROOT paths (macOS-specific sed syntax)

### Requirement: macOS start script (start.sh)

The system SHALL provide a `product/mac/start.sh` script that starts the backend service on macOS.

#### Scenario: Script starts backend with correct Python
- **WHEN** user runs `bash start.sh`
- **THEN** the script starts Uvicorn using `.venv/bin/python3` on the configured port (default 9000)

#### Scenario: Script kills existing process on the same port
- **WHEN** port 9000 is already in use
- **THEN** the script kills the existing process via `lsof -ti:PORT` before starting

#### Scenario: Script verifies port is listening using lsof
- **WHEN** backend starts
- **THEN** the script checks `lsof -iTCP -sTCP:LISTEN -P -n` for the configured port (macOS-specific, replacing `ss`/`netstat`)

#### Scenario: Script writes PID and port files
- **WHEN** backend starts
- **THEN** the script writes `.pid` and `.port` files to `backend/` for the stop script

### Requirement: macOS stop script (stop.sh)

The system SHALL provide a `product/mac/stop.sh` script that stops the backend service on macOS.

#### Scenario: Script stops by PID file
- **WHEN** user runs `bash stop.sh` and `.pid` file exists
- **THEN** the script kills the process by PID and removes the PID file

#### Scenario: Script stops by port as fallback
- **WHEN** user runs `bash stop.sh` and no PID file exists
- **THEN** the script kills processes on the configured port via `lsof -ti:PORT`

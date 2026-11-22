#!/usr/bin/env bash
# =============================================================================
# scripts/e2e-isolated.sh — 用「活动库快照」跑前端 Playwright E2E，真实库零接触
#
# 背景（2026-11-22 批次 B4，见 docs/refactoring/open-items-2026-11-22.md）：
#   开发环境的活动库就是用户正在用的库，直接 `npx playwright test` 会被 e2e 的
#   造数/删除写脏。上一轮隔离是手工搭的（复制库 → 临时 db_config.json → 启动器
#   重建引擎 → 写 backend/.port → 跑 → 还原），且踩过三个坑，本脚本把流程固化
#   并把三个坑做成硬防错：
#
#   ① 隔离校验硬断言：`app/core/__init__.py` 在导入期就把 database 的
#      CONFIG_PATH / 引擎按值绑定到真实配置，**只设 DATABASE_URL 环境变量无效**。
#      启动器必须在 `uvicorn.run` 之前改写 db_config/database 的模块常量、重建
#      引擎，并 `assert get_db_url()` 指向临时库；脚本再 grep 启动器输出复核，
#      不一致立即 abort（上一轮首版启动器绑到真实库，跑了约 3 秒才发现）。
#   ② 真实库零写入校验：开始前记录活动库（含 -wal/-shm）的 mtime+大小指纹，
#      全程结束后复核；任何变化 → 非零退出并告警（可能是常驻后端在写，仍需人看）。
#   ③ `.port` 原状还原：`backend/.port` 决定 vite 代理转发到哪个后端。原状有两种
#      （「文件不存在」= 开发默认 12344 / 「原本是 N」），必须原样还原，且异常
#      退出也要还原 —— 故 `trap cleanup EXIT/INT/TERM` 覆盖全部退出路径。
#
# 用法：
#   scripts/e2e-isolated.sh                          # 全量 e2e（workers=1）
#   scripts/e2e-isolated.sh --spec "e2e/login.spec.ts|e2e/validation.spec.ts"
#   scripts/e2e-isolated.sh --spec e2e/login.spec.ts --workers 1 --keep
#
# 参数：
#   --spec <pattern>  Playwright 文件过滤（位置参数按正则匹配 e2e/ 相对路径）
#   --workers N       并发数（默认 1：e2e 套件共享同一份数据，多 worker 会互相污染）
#   --keep            成功也保留临时目录（默认只在失败时保留，便于排查）
#
# 环境变量：
#   E2E_ISOLATED_TMP  临时根目录（默认 /tmp/opencode/e2e-db）
#
# 明确不做的事：
#   - 不修改 backend/db_config.json（临时配置只写临时目录；启动器改的是内存常量）
#   - 不启停用户常驻的 12344 / 12345
#   - 不修改仓库内任何已跟踪文件（.port 与 e2e 产物除外，.port 收尾还原）
#
# 注意：脚本需要「活动连接是 SQLite」才能做快照隔离。若活动连接是 PostgreSQL，
#      脚本会直接退出 —— 别改成去连真实 PG，那等于没隔离。
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
PORT_FILE="$BACKEND_DIR/.port"

TMP_ROOT="${E2E_ISOLATED_TMP:-/tmp/opencode/e2e-db}"
START_PORT=12355
MAX_PORT_TRIES=5
RESIDENT_BACKEND_URL="http://localhost:12344"
RESIDENT_FRONTEND_URL="http://localhost:12345"
PLAYWRIGHT_URL="http://localhost:9100"

SPEC=""
WORKERS=1
KEEP_TMP=0

usage() {
  sed -n '2,50p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --spec)
      [ $# -ge 2 ] || { echo "错误：--spec 需要一个匹配模式" >&2; exit 2; }
      SPEC="$2"
      shift 2
      ;;
    --workers)
      [ $# -ge 2 ] || { echo "错误：--workers 需要一个数字" >&2; exit 2; }
      WORKERS="$2"
      shift 2
      ;;
    --keep)
      KEEP_TMP=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "错误：未知参数 $1（用 --help 查看用法）" >&2
      exit 2
      ;;
  esac
done

case "$WORKERS" in
  '' | *[!0-9]*) echo "错误：--workers 必须是正整数（收到 '$WORKERS'）" >&2; exit 2 ;;
esac

# ── 依赖检查（缺一个就明确中文报错，不要跑到一半才炸） ─────────────────────
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "错误：缺少依赖命令『$1』，请先安装后再运行（$2）" >&2
    exit 1
  }
}
require_cmd uv "后端运行器（uv run python 启动隔离后端）"
require_cmd npx "前端 Playwright 入口（frontend/node_modules 需已安装）"
require_cmd curl "启动/收尾健康检查"
require_cmd python3 "复制库快照前置解析与临时配置生成"
if ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
  echo "错误：缺少依赖命令『lsof』或『ss』（用于端口占用检测），请先安装其一" >&2
  exit 1
fi

port_in_use() {
  local p="$1"
  if command -v lsof >/dev/null 2>&1; then
    [ -n "$(lsof -ti:"$p" 2>/dev/null || true)" ]
  else
    [ -n "$(ss -ltnH "sport = :$p" 2>/dev/null || true)" ]
  fi
}

stat_sig() {
  # GNU stat 优先；macOS 回退 BSD stat（时间+大小，纳秒/秒精度足够发现写入）
  if stat -c '%y|%s' "$1" >/dev/null 2>&1; then
    stat -c '%y|%s' "$1"
  else
    stat -f '%Sm|%z' -t '%F %T' "$1" 2>/dev/null || echo '?'
  fi
}

# ── 状态（cleanup 依赖，先声明再 trap） ─────────────────────────────────────
RUNDIR=""
BACKEND_PID=""
PORT_TOUCHED=0
PORT_ORIG_EXISTS=0
PORT_ORIG_VALUE=""
PORT=""
DB_PATH=""
DB_FP_BEFORE=""
CLEANED=0
E2E_OK=0

restore_port_file() {
  # 原状可能是「文件不存在」→ 删除；「原本是 N」→ 写回原值。
  [ "$PORT_TOUCHED" = 1 ] || return 0
  if [ "$PORT_ORIG_EXISTS" = 1 ]; then
    printf '%s\n' "$PORT_ORIG_VALUE" >"$PORT_FILE"
  else
    rm -f "$PORT_FILE"
  fi
  PORT_TOUCHED=0
}

stop_isolated_backend() {
  [ -n "$BACKEND_PID" ] || return 0
  if kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    local i
    for i in $(seq 1 50); do
      kill -0 "$BACKEND_PID" 2>/dev/null || break
      sleep 0.2
    done
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
      kill -KILL "$BACKEND_PID" 2>/dev/null || true
    fi
  fi
  # 后台进程若不在此 shell 作业表（极少见），wait 会失败 —— 忽略
  wait "$BACKEND_PID" 2>/dev/null || true
  BACKEND_PID=""
}

cleanup() {
  [ "$CLEANED" = 1 ] && return 0
  CLEANED=1
  # 只做同步操作（不做 curl/清库）：异常退出（含 Ctrl+C）也必须还原 .port 并杀后端
  restore_port_file
  stop_isolated_backend
  if [ -n "$RUNDIR" ] && [ -d "$RUNDIR" ]; then
    # 只有「成功且未 --keep」才清理；失败/Ctrl+C 一律保留证据（库里排障全靠 backend.log）
    if [ "$KEEP_TMP" = 1 ] || [ "$E2E_OK" != 1 ]; then
      echo "临时目录保留：$RUNDIR（隔离后端日志：$RUNDIR/backend.log）"
    else
      rm -rf "$RUNDIR"
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── 解析活动库（只读 db_config.json，不导入 app，不碰数据库） ─────────────
if [ ! -f "$BACKEND_DIR/db_config.json" ]; then
  echo "错误：找不到 $BACKEND_DIR/db_config.json（无法确定活动库）" >&2
  exit 1
fi

DB_INFO="$(python3 - "$BACKEND_DIR" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
cfg = json.loads((root / "db_config.json").read_text(encoding="utf-8"))
active_id = cfg.get("active")
conn = next((c for c in cfg.get("connections", []) if c.get("id") == active_id), None)
if conn is None:
    print(f"ERROR 活动连接不存在：{active_id}")
    raise SystemExit(0)
ctype = conn.get("type") or ""
if ctype != "sqlite":
    print(f"ERROR 活动连接不是 SQLite（type={ctype}，id={active_id}）：本脚本只支持 SQLite 快照隔离")
    raise SystemExit(0)
p = Path(conn.get("path") or "data/panshi.db")
if not p.is_absolute():
    p = root / p
print(f"OK {p.as_posix()}")
PY
)" || {
  echo "错误：解析 backend/db_config.json 失败" >&2
  exit 1
}

case "$DB_INFO" in
  OK\ *) DB_PATH="${DB_INFO#OK }" ;;
  *) echo "错误：${DB_INFO#ERROR }" >&2; exit 1 ;;
esac

if [ ! -f "$DB_PATH" ]; then
  echo "错误：活动库文件不存在：$DB_PATH" >&2
  exit 1
fi

# 指纹必须在任何复制/探活之前记录
db_fingerprint() {
  local out="" f
  for f in "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"; do
    if [ -e "$f" ]; then
      out+="$(basename "$f")=$(stat_sig "$f");"
    fi
  done
  printf '%s' "$out"
}
DB_FP_BEFORE="$(db_fingerprint)"

# 记录 .port 原状（可能不存在 —— 开发默认 12344，属于合法原状）
if [ -f "$PORT_FILE" ]; then
  PORT_ORIG_EXISTS=1
  PORT_ORIG_VALUE="$(cat "$PORT_FILE")"
fi

# ── 选端口（12355 起，被占用则 +1，最多试 5 个） ───────────────────────────
PORT=""
for i in $(seq 0 $((MAX_PORT_TRIES - 1))); do
  candidate=$((START_PORT + i))
  if ! port_in_use "$candidate"; then
    PORT="$candidate"
    break
  fi
  echo "端口 $candidate 已被占用，尝试下一个…"
done
if [ -z "$PORT" ]; then
  echo "错误：端口 $START_PORT..$((START_PORT + MAX_PORT_TRIES - 1)) 均被占用，无法启动隔离后端" >&2
  exit 1
fi

# 9100 由 playwright.config 的 webServer 固定，且 reuseExistingServer=!CI 会复用已有服务
# （复用到的 vite 可能读的是旧 .port → 静默打到真实库）。故要求它空闲。
if port_in_use 9100; then
  echo "错误：端口 9100 已被占用（Playwright 会复用它，可能指向真实库）。" >&2
  echo "      请先停止占用 9100 的进程（多为上一次未退出的 vite dev server）后重试。" >&2
  exit 1
fi

mkdir -p "$TMP_ROOT"
RUNDIR="$TMP_ROOT/run-$(date +%Y%m%d_%H%M%S)_$$"

# ===========================================================================
echo "[1/6] 复制库快照 → $RUNDIR/e2e.db"
# ===========================================================================
echo "      活动库：$DB_PATH"
echo "      指纹：$DB_FP_BEFORE"
mkdir -p "$RUNDIR"
cp -p "$DB_PATH" "$RUNDIR/e2e.db"
# 说明：这是文件级快照。若常驻后端（12344）恰好正在写入，副本可能与某一瞬间不一致；
# e2e 用不上强一致性，收尾的指纹复核会把「真实库被写过」显式报出来（可能是常驻后端）。
# WAL 模式：-wal 里可能有未 checkpoint 的已提交页，必须一并复制（-shm 一并带上更稳定）
for ext in -wal -shm; do
  if [ -e "$DB_PATH$ext" ]; then
    cp -p "$DB_PATH$ext" "$RUNDIR/e2e.db$ext"
  fi
done

# 临时 db_config.json（只写临时目录，绝不碰 backend/db_config.json）
python3 - "$RUNDIR/db_config.json" "$RUNDIR/e2e.db" <<'PY'
import json
import os
import sys

cfg = {
    "version": 1,
    "active": "e2e_isolated",
    "connections": [
        {
            "id": "e2e_isolated",
            "type": "sqlite",
            "name": "e2e 隔离库（脚本临时）",
            "path": sys.argv[2],
            "host": None,
            "port": 5432,
            "database": None,
            "username": None,
            "password_enc": None,
            "ssl": False,
        }
    ],
}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(cfg, fh, ensure_ascii=False, indent=2)
os.chmod(sys.argv[1], 0o600)
PY
echo "      临时配置：$RUNDIR/db_config.json（active=e2e_isolated）"

# ansible / task-log / 静态资源 / 脚本上传的写路径全部改到临时目录：
#   - ansible 用「符号链接 + inventory 实拷贝」保持 playbook/collections 可读，
#     同时让 inventory/host、inventory/gateways、artifacts 的写入落在临时目录
#     （真实 inventory 是用户的清单文件，绝不能被子库 e2e 改写）。
TMP_ANSIBLE="$RUNDIR/ansible"
mkdir -p "$TMP_ANSIBLE" "$RUNDIR/task-logs" "$RUNDIR/static" "$RUNDIR/task-scripts/temp"
for entry in "$BACKEND_DIR"/ansible/*; do
  [ -e "$entry" ] || continue
  name="$(basename "$entry")"
  [ "$name" = "inventory" ] && continue
  ln -s "$entry" "$TMP_ANSIBLE/$name"
done
if [ -d "$BACKEND_DIR/ansible/inventory" ]; then
  cp -a "$BACKEND_DIR/ansible/inventory" "$TMP_ANSIBLE/inventory"
else
  mkdir -p "$TMP_ANSIBLE/inventory"
fi

# ── 启动器 ─────────────────────────────────────────────────────────────────
# 关键：不能在 shell 里 `DATABASE_URL=... uvicorn app.main:app` 了事 ——
# app/core/__init__.py 在导入期就把 database 的 CONFIG_PATH / 引擎按值绑定到
# backend/db_config.json（真实库）。必须改模块常量 + 重建引擎，且**启动前断言**。
cat >"$RUNDIR/launcher.py" <<'PY'
#!/usr/bin/env python3
"""e2e 隔离后端启动器（由 scripts/e2e-isolated.sh 生成）。

为什么需要它：`app/core/__init__.py` 会 `from .database import ...`，import 期
database 已按真实 db_config.json 建好模块级引擎与 CONFIG_PATH 常量。设
DATABASE_URL 环境变量无效（只在「配置文件不存在」时兜底）。因此这里：
  1) 改写 db_config / database 的 CONFIG_PATH 常量指向临时配置；
  2) `database._reload_active_engine()` 重建 async 引擎 + sessionmaker；
  3) **启动前硬断言** `get_db_url()` 指向临时库，并打印出来给 shell 复核；
  4) 再把运行期写路径（inventory/静态资源/脚本上传/备份调度）改到临时目录；
  5) 最后才 uvicorn.run。
"""
import os
import sys
from pathlib import Path

backend_root = Path(sys.argv[1]).resolve()
cfg_path = Path(sys.argv[2]).resolve()
temp_db = Path(sys.argv[3]).resolve()
real_db = Path(sys.argv[4]).resolve()
port = int(sys.argv[5])

sys.path.insert(0, str(backend_root))
os.chdir(backend_root)

# ① 导入 app.core（会顺带建一个指向真实库的模块级引擎 —— 引擎是惰性的，
#    建对象不连库、不写库；下面立刻换成临时库的引擎）。
from app.core import db_config  # noqa: E402

db_config.CONFIG_PATH = str(cfg_path)
db_config.CONFIG_BAK_PATH = str(cfg_path) + ".bak"
db_config.LEGACY_CONFIG_PATH = str(cfg_path) + ".legacy-unused"

from app.core import database  # noqa: E402

database.CONFIG_PATH = str(cfg_path)
database.CONFIG_BAK_PATH = str(cfg_path) + ".bak"
database._reload_active_engine()

# ② 运行期写路径改到临时目录（产品代码零改动，仅隔离进程内生效）
from app.services import gateways_inventory_service  # noqa: E402

tmp_inventory = Path(os.environ["E2E_TMP_INVENTORY_DIR"]).resolve()
tmp_inventory.mkdir(parents=True, exist_ok=True)
gateways_inventory_service.GATEWAYS_PATH = str(tmp_inventory / "gateways")

from app.api.v1 import cluster_static_resources  # noqa: E402

cluster_static_resources.BASE_STORAGE_DIR = os.environ["E2E_TMP_STATIC_DIR"]

from app.config import script_upload  # noqa: E402

script_storage = Path(os.environ["E2E_TMP_SCRIPT_DIR"]).resolve()
(script_storage / "temp").mkdir(parents=True, exist_ok=True)
script_upload._SCRIPT_STORAGE_DIR = script_storage
script_upload.TEMP_DIR = script_storage / "temp"
script_upload.TASK_SCRIPTS_DIR = script_storage

# ③ 副本库里的「备份位置」配置不应被调度器误触发（否则可能备份到真实远端/真实数据目录）
from app.services import db_backup_service  # noqa: E402


async def _disabled_backup_scheduler(*_args, **_kwargs):
    import asyncio

    while True:
        await asyncio.sleep(3600)


db_backup_service.backup_scheduler_loop = _disabled_backup_scheduler

# ④ 硬断言（顺序不可调：必须在 uvicorn.run 之前）
db_url = database.get_db_url()
print(f"[E2E-ISOLATED] db_url={db_url}", flush=True)
print(f"[E2E-ISOLATED] temp_db={temp_db}", flush=True)
print(f"[E2E-ISOLATED] real_db={real_db}", flush=True)
if str(temp_db) not in db_url:
    print("[E2E-ISOLATED] ABORT 隔离失败：get_db_url() 未指向临时库（上一版启动器曾在此绑到真实库）", flush=True)
    raise SystemExit(9)
if str(real_db) in db_url:
    print("[E2E-ISOLATED] ABORT 隔离失败：get_db_url() 仍指向真实活动库", flush=True)
    raise SystemExit(9)
print("[E2E-ISOLATED] OK 引擎已绑定临时库；真实库不会被本进程写入", flush=True)

import uvicorn  # noqa: E402

uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="info")
PY

# ===========================================================================
echo "[2/6] 起隔离后端(:$PORT) —— 端口已确认空闲"
# ===========================================================================
(
  cd "$BACKEND_DIR"
  env -u DATABASE_URL \
    PANSHI_ANSIBLE_DIR="$TMP_ANSIBLE" \
    PANSHI_TASK_LOG_DIR="$RUNDIR/task-logs" \
    E2E_TMP_INVENTORY_DIR="$TMP_ANSIBLE/inventory" \
    E2E_TMP_STATIC_DIR="$RUNDIR/static" \
    E2E_TMP_SCRIPT_DIR="$RUNDIR/task-scripts" \
    uv run --no-sync python "$RUNDIR/launcher.py" \
    "$BACKEND_DIR" "$RUNDIR/db_config.json" "$RUNDIR/e2e.db" "$DB_PATH" "$PORT"
) >"$RUNDIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "      启动器 PID=$BACKEND_PID，日志：$RUNDIR/backend.log"

READY=0
for _ in $(seq 1 300); do
  if grep -qF '[E2E-ISOLATED] OK' "$RUNDIR/backend.log" 2>/dev/null; then
    READY=1
    break
  fi
  grep -qF '[E2E-ISOLATED] ABORT' "$RUNDIR/backend.log" 2>/dev/null && break
  kill -0 "$BACKEND_PID" 2>/dev/null || break
  sleep 0.2
done

if [ "$READY" != 1 ]; then
  echo "错误：隔离后端未通过启动前隔离断言（见下）" >&2
  grep -F '[E2E-ISOLATED]' "$RUNDIR/backend.log" >&2 || true
  tail -n 30 "$RUNDIR/backend.log" >&2 || true
  exit 1
fi

HEALTHY=0
for _ in $(seq 1 600); do
  if curl -fsS -m 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  kill -0 "$BACKEND_PID" 2>/dev/null || break
  sleep 0.2
done
if [ "$HEALTHY" != 1 ]; then
  echo "错误：隔离后端在 :$PORT 未就绪（/health 无响应），日志尾部：" >&2
  tail -n 40 "$RUNDIR/backend.log" >&2 || true
  exit 1
fi
echo "      :$PORT /health 已响应"

# ===========================================================================
echo "[3/6] 校验隔离（db_url 必须指向临时库）与真实库指纹基线"
# ===========================================================================
DB_URL_LINE="$(grep -F '[E2E-ISOLATED] db_url=' "$RUNDIR/backend.log" | tail -n 1 || true)"
if [ -z "$DB_URL_LINE" ]; then
  echo "错误：启动器未打印 db_url，无法确认隔离（中止）" >&2
  exit 1
fi
echo "      $DB_URL_LINE"
case "$DB_URL_LINE" in
  *"$RUNDIR/e2e.db"*) ;;
  *)
    echo "错误：db_url 未指向临时库 $RUNDIR/e2e.db —— 中止，不跑 e2e" >&2
    exit 1
    ;;
esac
case "$DB_URL_LINE" in
  *"$DB_PATH"*)
    echo "错误：db_url 指向真实活动库 $DB_PATH —— 中止，不跑 e2e" >&2
    exit 1
    ;;
esac
echo "      ✓ 隔离确认：db_url 含临时库路径且不含真实活动库路径"
echo "      真实库指纹基线：$DB_FP_BEFORE"

# ===========================================================================
echo "[4/6] 写 backend/.port=$PORT 并跑 Playwright"
# ===========================================================================
printf '%s\n' "$PORT" >"$PORT_FILE"
PORT_TOUCHED=1
echo "      .port 原状：$([ "$PORT_ORIG_EXISTS" = 1 ] && echo "存在（$PORT_ORIG_VALUE）" || echo "不存在（开发默认 12344）")"

PW_ARGS=(test --workers "$WORKERS")
if [ -n "$SPEC" ]; then
  PW_ARGS+=("$SPEC")
  echo "      过滤：$SPEC"
fi
echo "      ▶ cd frontend && npx playwright ${PW_ARGS[*]}"
set +e
(
  cd "$FRONTEND_DIR"
  npx playwright "${PW_ARGS[@]}"
)
PW_RC=$?
set -e

# ===========================================================================
echo "[5/6] 恢复 .port / 停隔离后端"
# ===========================================================================
restore_port_file
if [ "$PORT_ORIG_EXISTS" = 1 ]; then
  echo "      .port 已还原为原值：$PORT_ORIG_VALUE"
else
  echo "      .port 已删除（还原为「原本不存在」）"
fi
stop_isolated_backend
RELEASED=0
for _ in $(seq 1 50); do
  if ! port_in_use "$PORT"; then
    RELEASED=1
    break
  fi
  sleep 0.2
done
if [ "$RELEASED" = 1 ]; then
  echo "      :$PORT 已释放"
else
  echo "警告：:$PORT 仍被占用（可能有残留进程，请手工检查）" >&2
fi

[ "$PW_RC" -eq 0 ] && E2E_OK=1

# ===========================================================================
echo "[6/6] 健康检查与结论"
# ===========================================================================
FAIL=0

DB_FP_AFTER="$(db_fingerprint)"
if [ "$DB_FP_AFTER" = "$DB_FP_BEFORE" ]; then
  echo "      ✓ 真实库未被写入（指纹一致）：$DB_FP_AFTER"
else
  echo "错误：真实活动库指纹发生变化！" >&2
  echo "      之前：$DB_FP_BEFORE" >&2
  echo "      之后：$DB_FP_AFTER" >&2
  echo "      可能由常驻后端（12344）或其它进程写入；请人工确认后再采信本次 e2e 结果。" >&2
  FAIL=1
fi

if [ "$PORT_ORIG_EXISTS" = 1 ]; then
  if [ -f "$PORT_FILE" ] && [ "$(cat "$PORT_FILE")" = "$PORT_ORIG_VALUE" ]; then
    echo "      ✓ .port 已还原为原状（$PORT_ORIG_VALUE）"
  else
    echo "错误：.port 未还原（当前：$([ -f "$PORT_FILE" ] && cat "$PORT_FILE" || echo '<不存在>')）" >&2
    FAIL=1
  fi
else
  if [ ! -e "$PORT_FILE" ]; then
    echo "      ✓ .port 已还原为原状（不存在）"
  else
    echo "错误：.port 本应不存在，但现在存在（内容：$(cat "$PORT_FILE")）" >&2
    FAIL=1
  fi
fi

if [ "$RELEASED" != 1 ]; then
  FAIL=1
fi

BACKEND_CODE="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$RESIDENT_BACKEND_URL/health" 2>/dev/null || echo 000)"
FRONTEND_CODE="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$RESIDENT_FRONTEND_URL/" 2>/dev/null || echo 000)"
echo "      常驻后端 12344 /health → $BACKEND_CODE"
echo "      常驻前端 12345 /       → $FRONTEND_CODE"
if [ "$BACKEND_CODE" != "200" ] || [ "$FRONTEND_CODE" != "200" ]; then
  echo "提示：常驻服务不健康（后端 $BACKEND_CODE / 前端 $FRONTEND_CODE）。" >&2
  echo "      若本次 e2e 前是正常的，请检查是否误停；需要时可执行 develop/linux/start.sh 重新拉起。" >&2
fi

echo
if [ "$FAIL" = 0 ] && [ "$PW_RC" -eq 0 ]; then
  E2E_OK=1
  echo "结论：e2e 全绿，隔离完整（真实库零写入、.port 已还原、:$PORT 已释放）"
else
  if [ "$PW_RC" -ne 0 ]; then
    echo "结论：e2e 失败（Playwright 退出码 $PW_RC）" >&2
  fi
  if [ "$FAIL" -ne 0 ]; then
    echo "结论：收尾校验未通过（见上方错误）" >&2
  fi
  KEEP_TMP=1
  echo "临时目录保留以便排查：$RUNDIR（后端日志：$RUNDIR/backend.log）" >&2
fi

if [ "$FAIL" -ne 0 ]; then
  exit 3
fi
exit "$PW_RC"

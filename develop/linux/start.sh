#!/bin/bash
# `sh start.sh` 兼容守卫（2026-10-02 用户实测）：/bin/sh 是 dash，`sh start.sh`
# 会绕过 shebang 并在 bash 数组处解析炸（`local pids=()`）；交回 bash 重执行。
if [ -z "$BASH_VERSION" ]; then
    exec bash "$0" "$@"
fi
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# 启动路径永远指向脚本相对的真实仓库；PANSHI_PROJECT_ROOT 仅供测试把「身份锚点」
# 指向临时目录（只影响身份校验，不影响 mkdir/cd/日志路径）——2026-10-02 实测教训：
# 若让它污染启动路径，uv run 会在临时目录里找不到 pyproject.toml 静默失败。
LAUNCH_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="${PANSHI_PROJECT_ROOT:-$LAUNCH_ROOT}"

# 可测性：端口 / pid 文件可被环境变量覆盖，缺省行为不变
BACKEND_PORT="${BACKEND_PORT:-12344}"
FRONTEND_PORT="${FRONTEND_PORT:-12345}"
BACKEND_PID_FILE="${PANSHI_BACKEND_PID_FILE:-/tmp/panshi_backend.pid}"
FRONTEND_PID_FILE="${PANSHI_FRONTEND_PID_FILE:-/tmp/panshi_frontend.pid}"

echo "Starting Panshi Admin..."

# /proc 身份校验（与 stop.sh 同款，两重）：
# ① 身份模式：后端 `app.main:app|spawn_main`（uvicorn --reload 的 spawn worker cmdline
#    只含 spawn_main 引导串、不含 app.main:app，而端口 fd 恰由 worker 持有——2026-10-02 实测）；
# ② 路径锚点：cmdline 含本项目 backend/frontend 路径，或 /proc/PID/cwd 指向其下——
#    防误杀其他项目同名/同形态进程。
_pid_is_project_svc() {
    local pid="$1" pattern="$2" anchor="$3"
    local cmdline cwd
    cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null) || return 1
    echo "$cmdline" | grep -Eq "$pattern" || return 1
    case "$cmdline" in *"$anchor"*) return 0 ;; esac
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null) || return 1
    case "$cwd" in "$anchor"|"$anchor"/*) return 0 ;; esac
    return 1
}

# ---------- pre-start cleanup（spec: start 前对目标端口做同款逐 PID 身份校验）----------
# 空闲 → 直接启动；已验证的本项目进程（含 reloader/spawn worker 拓扑）→ SIGTERM 优先、
# SIGKILL 兜底后启动；不匹配进程 → 打印其 cmdline 与处理指引后以非零码拒绝启动，绝不误杀。
_check_port_before_start() {
    local port="$1" pattern="$2" anchor="$3" label="$4"
    local pids=() pid bad=0 alive
    for pid in $(lsof -ti:"$port" 2>/dev/null || true); do
        pids+=("$pid")
        if ! _pid_is_project_svc "$pid" "$pattern" "$anchor"; then
            echo "错误: 端口 $port（$label）被不相关进程占用，PID $pid：" >&2
            tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || echo "  (cmdline 不可读)" >&2
            bad=1
        fi
    done
    if [ "$bad" = "1" ]; then
        echo "请先运行 develop/linux/stop.sh 或手动处理该进程后重试。" >&2
        exit 1
    fi
    if [ "${#pids[@]}" -gt 0 ]; then
        for pid in "${pids[@]}"; do
            kill "$pid" 2>/dev/null || true
        done
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            alive=0
            for pid in "${pids[@]}"; do
                kill -0 "$pid" 2>/dev/null && alive=1
            done
            [ "$alive" = "0" ] && break
            sleep 0.3
        done
        for pid in "${pids[@]}"; do
            kill -9 "$pid" 2>/dev/null || true
        done
        sleep 1
    fi
}

_check_port_before_start "$BACKEND_PORT" 'app\.main:app|spawn_main' "$PROJECT_ROOT/backend" "后端"
_check_port_before_start "$FRONTEND_PORT" 'vite|npm' "$PROJECT_ROOT/frontend" "前端"

mkdir -p "$LAUNCH_ROOT/backend/data"

UV_BIN="${HOME}/.local/bin/uv"
[ ! -f "$UV_BIN" ] && UV_BIN="uv"

BACKEND_LOG="${LAUNCH_ROOT}/backend.log"
FRONTEND_LOG="${LAUNCH_ROOT}/frontend.log"

cd "$LAUNCH_ROOT/backend" && $UV_BIN run --python /home/qcg/.local/bin/python3.11 uvicorn app.main:app --reload --port "$BACKEND_PORT" >> "$BACKEND_LOG" 2>&1 &

BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

sleep 2

cd "$LAUNCH_ROOT/frontend" && npm run dev -- --port "$FRONTEND_PORT" >> "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

echo $BACKEND_PID > "$BACKEND_PID_FILE"
echo $FRONTEND_PID > "$FRONTEND_PID_FILE"

echo ""
echo "Panshi Admin started!"
echo "- Backend: http://localhost:$BACKEND_PORT (log: $BACKEND_LOG)"
echo "- Frontend: http://localhost:$FRONTEND_PORT (log: $FRONTEND_LOG)"

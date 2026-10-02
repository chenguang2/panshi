#!/bin/bash
# 停止开发环境（后端 12344 / 前端 12345）。
# 身份守卫（spec: start-stop-scripts）：只终止 cmdline 可确认属于本项目的进程；
# 逐 PID 读取 /proc/$PID/cmdline 校验，多 PID 共享端口（reloader + worker）逐个击杀；
# 端口清扫后做仓库路径限定的 cmdline 孤儿清扫（捕获漂移端口进程）。
# 可测性：端口 / pid 文件 / 项目根锚点均可被环境变量覆盖，缺省行为不变。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# PANSHI_PROJECT_ROOT 仅供测试把孤儿清扫锚点指向临时目录，生产语义不变
PROJECT_ROOT="${PANSHI_PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

BACKEND_PORT="${BACKEND_PORT:-12344}"
FRONTEND_PORT="${FRONTEND_PORT:-12345}"
BACKEND_PID_FILE="${PANSHI_BACKEND_PID_FILE:-/tmp/panshi_backend.pid}"
FRONTEND_PID_FILE="${PANSHI_FRONTEND_PID_FILE:-/tmp/panshi_frontend.pid}"

echo "Stopping Panshi Admin..."

# /proc 身份校验（两重）：
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

# /proc cmdline 子串校验（固定串，用于仓库路径锚点防误杀）
_cmdline_contains() {
    local pid="$1" needle="$2"
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -qF -- "$needle"
}

BACKEND_IDENTITY='app\.main:app|spawn_main'
FRONTEND_IDENTITY='vite|npm'

# 1. PID 文件优雅停止（既有行为，不变）
if [ -f "$BACKEND_PID_FILE" ]; then
    kill $(cat "$BACKEND_PID_FILE") 2>/dev/null || true
    rm -f "$BACKEND_PID_FILE"
fi

if [ -f "$FRONTEND_PID_FILE" ]; then
    kill $(cat "$FRONTEND_PID_FILE") 2>/dev/null || true
    rm -f "$FRONTEND_PID_FILE"
fi

# 2. 端口兜底停止：多 PID 共享端口（reloader + spawn worker）逐 PID 校验、逐个击杀
for PORT in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    if [ "$PORT" = "$BACKEND_PORT" ]; then
        VERIFY_PATTERN="$BACKEND_IDENTITY"
        VERIFY_ANCHOR="$PROJECT_ROOT/backend"
    else
        VERIFY_PATTERN="$FRONTEND_IDENTITY"
        VERIFY_ANCHOR="$PROJECT_ROOT/frontend"
    fi
    for pid in $(lsof -ti:"$PORT" 2>/dev/null || true); do
        if _pid_is_project_svc "$pid" "$VERIFY_PATTERN" "$VERIFY_ANCHOR"; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
done

# 3. 孤儿清扫：捕获漂移端口的本项目进程（pgrep 模式 + /proc 复核双保险）。
#    锚点 = 仓库 backend/frontend 路径（cmdline 或 cwd），防止误杀同名无关进程。
for pid in $(pgrep -f 'uvicorn app\.main:app' 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    if _pid_is_project_svc "$pid" "$BACKEND_IDENTITY" "$PROJECT_ROOT/backend"; then
        kill -9 "$pid" 2>/dev/null || true
    fi
done

# spawn_main 形态（孤儿 worker：reloader 已死但 worker 仍持漂移端口）
for pid in $(pgrep -f 'spawn_main' 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    if _pid_is_project_svc "$pid" "$BACKEND_IDENTITY" "$PROJECT_ROOT/backend"; then
        kill -9 "$pid" 2>/dev/null || true
    fi
done

for pid in $(pgrep -f 'node_modules/\.bin/vite' 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    if _pid_is_project_svc "$pid" "$FRONTEND_IDENTITY" "$PROJECT_ROOT/frontend"; then
        kill -9 "$pid" 2>/dev/null || true
    fi
done

echo "Panshi Admin stopped."

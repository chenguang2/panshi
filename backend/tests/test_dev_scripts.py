"""开发启停脚本集成测试（db-switch-restart-completion 组 3/4）。

D5（design.md）：真实进程集成测试——哑监听替身 + `exec -a` 伪造 argv0 + 临时端口，
绝不占用 12344/12345（真实开发服务常驻运行，见 AGENTS.md 约定 #8）。

测试安全闸门（_require_safe_script）：脚本必须已实现 BACKEND_PORT/FRONTEND_PORT
与 PANSHI_PROJECT_ROOT / pid 文件环境变量覆盖，否则拒绝执行——否则 RED 阶段的
旧脚本会按硬编码端口操作真实 12344/12345（旧 stop.sh 甚至会经 pid 文件杀掉真实
后端）。该闸门与 tests/test_publish_response.py 的「源码模式守卫」同款思路。

平台耦合：仅 Linux（/proc 身份校验），与 spec 场景一一对应。
替身说明：`exec -a` 只改 argv[0]（/proc/cmdline 首段）；若未来校验逻辑改为读
/proc/$PID/exe，替身需同步调整。
"""

import os
import shlex
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

pytestmark = [pytest.mark.skipif(sys.platform != "linux", reason="/proc 身份校验仅 Linux")]

REPO_ROOT = Path(__file__).resolve().parents[2]
STOP_SH = REPO_ROOT / "develop" / "linux" / "stop.sh"
START_SH = REPO_ROOT / "develop" / "linux" / "start.sh"


# ---------------------------------------------------------------------------
# 环境前置与安全闸门
# ---------------------------------------------------------------------------

def _require_safe_script(path: Path, required_snippets: list[str]) -> None:
    """闸门：脚本缺少环境变量覆盖实现时拒绝执行（防止测试操作真实 12344/12345）。"""
    text = path.read_text(encoding="utf-8")
    missing = [s for s in required_snippets if s not in text]
    if missing:
        pytest.fail(
            f"{path} 缺少测试安全前置条件（未实现环境变量覆盖）：{missing}。\n"
            "真实开发服务常驻在 12344/12345（约定 #8），旧版脚本按硬编码端口操作会"
            "误伤它们（旧 stop.sh 还会经 /tmp/panshi_*.pid 杀掉真实后端）。"
            "请先实现 BACKEND_PORT/FRONTEND_PORT、PANSHI_PROJECT_ROOT、"
            "PANSHI_BACKEND_PID_FILE/PANSHI_FRONTEND_PID_FILE 覆盖再跑本用例。"
        )


_STOP_GATE = [
    "${BACKEND_PORT:-12344}",
    "${FRONTEND_PORT:-12345}",
    "${PANSHI_PROJECT_ROOT:-",
    "${PANSHI_BACKEND_PID_FILE:-",
    "${PANSHI_FRONTEND_PID_FILE:-",
]

_START_GATE = [
    "${BACKEND_PORT:-12344}",
    "${FRONTEND_PORT:-12345}",
    "${PANSHI_BACKEND_PID_FILE:-",
    "${PANSHI_FRONTEND_PID_FILE:-",
    "${PANSHI_PROJECT_ROOT:-",
]


@pytest.fixture
def ensure_safe_scripts():
    from shutil import which

    missing = [n for n in ("lsof", "pgrep") if not which(n)]
    if missing:
        pytest.skip(f"缺少依赖命令：{missing}")
    _require_safe_script(STOP_SH, _STOP_GATE)
    _require_safe_script(START_SH, _START_GATE)


# ---------------------------------------------------------------------------
# 端口 / 进程工具
# ---------------------------------------------------------------------------

def _free_port() -> int:
    """空闲 ephemeral 端口（绝不使用 12344/12345）。"""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    assert port not in (12344, 12345)
    return port


def _port_listening(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_listening(port: int, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _port_listening(port):
            return
        time.sleep(0.1)
    raise AssertionError(f"端口 {port} 在 {timeout}s 内未进入监听")


def _wait_gone(pid: int, timeout: float = 5.0) -> None:
    """等待孤儿进程（非本测试直接子进程，无法 poll）从 /proc 消失。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not Path(f"/proc/{pid}").exists():
            return
        time.sleep(0.1)
    raise AssertionError(f"PID {pid} 在 {timeout}s 后仍存活")


def _descendants(pid: int) -> list[int]:
    """经 /proc 收集进程树。"""
    out: list[int] = []
    try:
        with open(f"/proc/{pid}/task/{pid}/children") as f:
            kids = [int(p) for p in f.read().split()]
    except OSError:
        kids = []
    for k in kids:
        out.append(k)
        out.extend(_descendants(k))
    return out


def _kill_tree(pid: int) -> None:
    for p in reversed(_descendants(pid)):
        try:
            os.kill(p, signal.SIGKILL)
        except ProcessLookupError:
            pass
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def _ensure_dead(dummy: subprocess.Popen) -> None:
    if dummy.poll() is None:
        dummy.kill()
    dummy.wait(timeout=5)


# ---------------------------------------------------------------------------
# 哑监听替身
# ---------------------------------------------------------------------------

def _spawn_http_server(port: int, argv0: str | None = None, cwd: Path | None = None) -> subprocess.Popen:
    """起哑 HTTP 监听；argv0 非空时经 `exec -a` 伪造 /proc/cmdline 首 arg（合法身份）。"""
    if argv0 is not None:
        cmd = ["bash", "-c", f"exec -a {shlex.quote(argv0)} python3 -m http.server {port} --bind 127.0.0.1"]
    else:
        cmd = ["python3", "-m", "http.server", str(port), "--bind", "127.0.0.1"]
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=cwd)


_MULTIPROC_HOLDER = r"""
import socket, sys, time, multiprocessing

def _hold(_sock):
    time.sleep(180)

if __name__ == "__main__":
    port = int(sys.argv[1])
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(64)
    child = multiprocessing.Process(target=_hold, args=(srv,))
    child.start()
    print(child.pid, flush=True)
    time.sleep(180)
"""


def _spawn_multiproc_holders(port: int, argv0: str, workdir: Path, tmp_path: Path):
    """模拟 uvicorn reloader + worker 共享监听 socket：fork 子进程继承 fd，两 PID 同持端口。"""
    script = tmp_path / "mp_holder.py"
    script.write_text(_MULTIPROC_HOLDER)
    cmd = ["bash", "-c", f"exec -a {shlex.quote(argv0)} python3 {script} {port}"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, cwd=workdir)
    assert proc.stdout is not None
    child_pid = int(proc.stdout.readline().strip())
    return proc, child_pid


_SPAWN_HOLDER = r"""
import os, socket, subprocess, sys, time

if __name__ == "__main__":
    port = int(sys.argv[1])
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(64)
    fd = srv.fileno()
    # 子进程 cmdline 复刻 uvicorn --reload 的真实 worker 形态（spawn_main 引导串），
    # 经 pass_fds 继承 LISTEN fd 并原号包成 socket 持有——与真实拓扑一致：
    # reloader 父进程 cmdline 含 app.main:app，worker cmdline 只含 spawn_main。
    worker_code = (
        "import os, socket, time\n"
        f"s = socket.socket(fileno={fd})\n"
        "time.sleep(180)\n"
    )
    worker_argv = [
        "python3", "-c", worker_code,
        "from multiprocessing.spawn import spawn_main; spawn_main(tracker_fd=7, pipe_handle=9)",
        "--multiprocessing-fork",
    ]
    child = subprocess.Popen(worker_argv, pass_fds=(fd,))
    print(child.pid, flush=True)
    time.sleep(180)
"""


def _spawn_spawnworker_holders(port: int, argv0: str, workdir: Path, tmp_path: Path):
    """模拟 uvicorn --reload 的 spawn 拓扑：父进程（reloader 形态 cmdline）与
    worker 子进程（spawn_main 形态 cmdline、实际持 socket fd）共享监听端口。
    workdir 作为 /proc/PID/cwd 路径锚点（真实 uvicorn worker 的 cwd 即 backend 目录）。
    """
    script = tmp_path / "spawn_holder.py"
    script.write_text(_SPAWN_HOLDER)
    cmd = ["bash", "-c", f"exec -a {shlex.quote(argv0)} python3 {script} {port}"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, cwd=workdir)
    assert proc.stdout is not None
    child_pid = int(proc.stdout.readline().strip())
    return proc, child_pid


def _script_env(
    backend_port: int,
    frontend_port: int,
    tmp_path: Path,
    project_root: Path | None = None,
) -> dict:
    env = dict(os.environ)
    env["BACKEND_PORT"] = str(backend_port)
    env["FRONTEND_PORT"] = str(frontend_port)
    env["PANSHI_BACKEND_PID_FILE"] = str(tmp_path / "backend.pid")
    env["PANSHI_FRONTEND_PID_FILE"] = str(tmp_path / "frontend.pid")
    if project_root is not None:
        env["PANSHI_PROJECT_ROOT"] = str(project_root)
    return env


def _run_script(script: Path, env: dict, timeout: float = 60) -> SimpleNamespace:
    """执行脚本并把 stdout/stderr 落临时文件再读回。

    不用 capture_output（PIPE）：start.sh 拉起的 uv/vite 服务树会继承管道写端，
    管道永不 EOF，communicate() 将永久阻塞（实测 60s 超时假象）。文件重定向
    让 run() 只等脚本进程本身退出。
    """
    out_file = script.parent / f".{script.name}.out"
    err_file = script.parent / f".{script.name}.err"
    with open(out_file, "w") as fo, open(err_file, "w") as fe:
        proc = subprocess.run(["bash", str(script)], env=env, stdout=fo, stderr=fe, timeout=timeout)
    result = SimpleNamespace(
        returncode=proc.returncode,
        stdout=out_file.read_text(),
        stderr=err_file.read_text(),
    )
    out_file.unlink(missing_ok=True)
    err_file.unlink(missing_ok=True)
    return result


def _wait_exit(dummy: subprocess.Popen, timeout: float = 5.0) -> None:
    """有界等待进程退出（SIGKILL → 内核回收存在调度窗口，瞬时 poll 会假阴性）。"""
    deadline = time.monotonic() + timeout
    while dummy.poll() is None:
        if time.monotonic() > deadline:
            return
        time.sleep(0.05)


# ===========================================================================
# stop.sh（组 3）
# ===========================================================================

class TestStopScript:
    def _run_stop(self, tmp_path, backend_port, frontend_port, project_root=None):
        env = _script_env(backend_port, frontend_port, tmp_path, project_root)
        return _run_script(STOP_SH, env)

    @pytest.mark.usefixtures("ensure_safe_scripts")
    @pytest.mark.parametrize(
        "port_role,argv0_fmt",
        [
            ("backend", "uvicorn app.main:app --reload --port {port}"),
            ("frontend", "npm run dev -- --port {port}"),
        ],
    )
    def test_matching_identity_on_port_is_killed(self, port_role, argv0_fmt, tmp_path):
        """单 PID + 合法身份（cmdline 无仓库路径、经 cwd 锚点确认）：端口兜底击杀。"""
        backend, frontend = _free_port(), _free_port()
        fake_root = tmp_path / "projroot"
        (fake_root / "backend").mkdir(parents=True)
        (fake_root / "frontend").mkdir(parents=True)
        port = backend if port_role == "backend" else frontend
        anchor_dir = fake_root / ("backend" if port_role == "backend" else "frontend")
        argv0 = argv0_fmt.format(port=port)
        dummy = _spawn_http_server(port, argv0=argv0, cwd=anchor_dir)
        try:
            _wait_listening(port)
            result = self._run_stop(tmp_path, backend, frontend, project_root=fake_root)
            assert result.returncode == 0, result.stderr
            _wait_exit(dummy)
            assert dummy.poll() is not None, "合法身份进程未被停止"
        finally:
            _ensure_dead(dummy)

    @pytest.mark.usefixtures("ensure_safe_scripts")
    @pytest.mark.parametrize("port_role", ["backend", "frontend"])
    def test_mismatched_process_on_port_not_killed(self, port_role, tmp_path):
        """不匹配进程（无 app.main:app / vite|npm 身份）不杀且端口仍活。"""
        backend, frontend = _free_port(), _free_port()
        port = backend if port_role == "backend" else frontend
        dummy = _spawn_http_server(port)  # 无伪造身份
        try:
            _wait_listening(port)
            result = self._run_stop(tmp_path, backend, frontend)
            assert result.returncode == 0, result.stderr
            assert dummy.poll() is None, "不匹配进程被误杀"
            assert _port_listening(port), "不匹配进程所在端口应保持存活"
        finally:
            _ensure_dead(dummy)

    @pytest.mark.usefixtures("ensure_safe_scripts")
    def test_multi_pid_shared_socket_all_killed(self, tmp_path):
        """回归根因：多 PID（reloader + worker 共享 socket）逐 PID 校验并全部击杀。

        旧实现把 "PID1\\nPID2" 拼进单个 /proc/$PIDS/cmdline 路径 → 守卫必败 →
        kill 永不执行。本用例以 fork 子进程继承 socket fd 复现该形态。
        """
        backend, frontend = _free_port(), _free_port()
        fake_root = tmp_path / "projroot"
        (fake_root / "backend").mkdir(parents=True)
        argv0 = f"uvicorn app.main:app --reload --port {backend}"
        parent, child_pid = _spawn_multiproc_holders(backend, argv0, fake_root / "backend", tmp_path)
        try:
            _wait_listening(backend)
            # 前置确认：端口确实由多个 PID 持有（否则用例失去回归意义）
            holders = (
                subprocess.run(["lsof", "-ti", f":{backend}"], capture_output=True, text=True)
                .stdout.split()
            )
            assert len(set(holders)) >= 2, f"期望多 PID 共享端口，实际 {holders}"

            result = self._run_stop(tmp_path, backend, frontend, project_root=fake_root)
            assert result.returncode == 0, result.stderr
            _wait_exit(parent)
            assert parent.poll() is not None, "父进程未被停止"
            _wait_gone(child_pid)
            time.sleep(0.3)
            assert not _port_listening(backend), "端口应已释放"
        finally:
            _kill_tree(parent.pid)
            parent.wait(timeout=5)

    @pytest.mark.usefixtures("ensure_safe_scripts")
    def test_spawn_worker_topology_all_killed(self, tmp_path):
        """回归（2026-10-02 实测）：uvicorn --reload 的 spawn worker cmdline 不含
        app.main:app（只有 `spawn_main` 引导串），而端口 fd 恰由 worker 持有；
        仅按 app.main:app 校验会漏杀 → start.sh 重复执行永远误判「不相关进程」、
        stop.sh 杀不掉 worker（reloader 重生 worker）。后端身份模式须放宽为
        app.main:app 或 spawn_main，并叠加本项目路径锚点（cmdline 或 cwd）防误杀。
        """
        backend, frontend = _free_port(), _free_port()
        fake_root = tmp_path / "projroot"
        (fake_root / "backend").mkdir(parents=True)
        argv0 = f"uvicorn app.main:app --reload --port {backend}"
        parent, child_pid = _spawn_spawnworker_holders(backend, argv0, fake_root / "backend", tmp_path)
        try:
            _wait_listening(backend)
            # 前置 1：端口确由父+子两 PID 持有
            holders = (
                subprocess.run(["lsof", "-ti", f":{backend}"], capture_output=True, text=True)
                .stdout.split()
            )
            assert set(holders) >= {str(parent.pid), str(child_pid)}, f"期望父子双 PID 持端口，实际 {holders}"
            # 前置 2：worker cmdline 形态确为 spawn_main（不含 app.main:app，否则失真）
            child_cmd = Path(f"/proc/{child_pid}/cmdline").read_bytes().replace(b"\0", b" ").decode()
            assert "spawn_main" in child_cmd, f"worker cmdline 缺 spawn_main 形态：{child_cmd}"
            assert "app.main:app" not in child_cmd, f"worker cmdline 意外含 app.main:app：{child_cmd}"

            result = self._run_stop(tmp_path, backend, frontend, project_root=fake_root)
            assert result.returncode == 0, result.stderr
            _wait_exit(parent)
            assert parent.poll() is not None, "reloader 父进程未被停止"
            _wait_gone(child_pid)
            time.sleep(0.3)
            assert not _port_listening(backend), "端口应已释放（worker 未被杀）"
        finally:
            _kill_tree(parent.pid)
            parent.wait(timeout=5)

    @pytest.mark.usefixtures("ensure_safe_scripts")
    def test_foreign_spawn_main_process_not_killed(self, tmp_path):
        """spawn_main 身份放宽的防误杀面：cmdline 含 spawn_main 但 cwd 不在本项目
        backend（外部程序的 multiprocessing worker）不得被杀。
        """
        backend, frontend = _free_port(), _free_port()
        foreign_dir = tmp_path / "some-other-project"
        foreign_dir.mkdir()
        argv0 = "python3"
        dummy = subprocess.Popen(
            ["bash", "-c", f"exec -a {shlex.quote(argv0)} python3 -m http.server {backend} --bind 127.0.0.1"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        # 借外壳进程把 cmdline 改写成 spawn_main 形态：python3 -c <hold> <spawn_main 串>
        # 直接再包一层：dummy 自身 cmdline 无身份，需要真实 spawn_main 形态进程持端口
        spawn_main_dummy = subprocess.Popen(
            [
                "python3", "-c",
                "import socket, time\nsrv = socket.socket()\nsrv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)\n"
                f"srv.bind((\"127.0.0.1\", {backend}))\nsrv.listen(64)\ntime.sleep(180)\n",
                "from multiprocessing.spawn import spawn_main; spawn_main(tracker_fd=7, pipe_handle=9)",
                "--multiprocessing-fork",
            ],
            cwd=foreign_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        dummy.kill()
        dummy.wait(timeout=5)
        try:
            _wait_listening(backend)
            result = self._run_stop(tmp_path, backend, frontend, project_root=tmp_path / "projroot-anchor")
            assert result.returncode == 0, result.stderr
            assert spawn_main_dummy.poll() is None, "外部 spawn_main 进程被误杀"
            assert _port_listening(backend)
        finally:
            _ensure_dead(spawn_main_dummy)

    @pytest.mark.usefixtures("ensure_safe_scripts")
    def test_drifted_port_orphan_swept_by_cmdline(self, tmp_path):
        """漂移端口孤儿（vite 替身监听非默认端口）被 cmdline 清扫捕获。"""
        fake_root = tmp_path / "projroot"
        (fake_root / "frontend" / "node_modules" / ".bin").mkdir(parents=True)
        backend, frontend = _free_port(), _free_port()
        drifted_port = _free_port()
        argv0 = f"node {fake_root}/frontend/node_modules/.bin/vite --port {drifted_port}"
        dummy = _spawn_http_server(drifted_port, argv0=argv0)
        try:
            _wait_listening(drifted_port)
            result = self._run_stop(tmp_path, backend, frontend, project_root=fake_root)
            assert result.returncode == 0, result.stderr
            _wait_exit(dummy)
            assert dummy.poll() is not None, "漂移端口孤儿未被 cmdline 清扫捕获"
        finally:
            _ensure_dead(dummy)

    @pytest.mark.usefixtures("ensure_safe_scripts")
    def test_unrelated_same_name_process_not_swept(self, tmp_path):
        """无关同名进程（cmdline 匹配模式但路径锚点不属于本项目）不被清扫。"""
        other_root = tmp_path / "someone-else"
        (other_root / "frontend" / "node_modules" / ".bin").mkdir(parents=True)
        backend, frontend = _free_port(), _free_port()
        drifted_port = _free_port()
        argv0 = f"node {other_root}/frontend/node_modules/.bin/vite --port {drifted_port}"
        dummy = _spawn_http_server(drifted_port, argv0=argv0)
        # 清扫锚点指向第三个目录：dummy 路径不匹配锚点，不得被杀
        guarded_root = tmp_path / "another-project"
        guarded_root.mkdir()
        try:
            _wait_listening(drifted_port)
            result = self._run_stop(tmp_path, backend, frontend, project_root=guarded_root)
            assert result.returncode == 0, result.stderr
            assert dummy.poll() is None, "无关同名进程被误杀"
            assert _port_listening(drifted_port)
        finally:
            _ensure_dead(dummy)


# ===========================================================================
# start.sh（组 4）
# ===========================================================================

class TestStartScript:
    @pytest.fixture(autouse=True)
    def _gate_and_cleanup(self, ensure_safe_scripts, tmp_path):
        self._tracked: list[int] = []
        yield
        # 收尾：杀掉 start.sh 拉起的真实服务树（uvicorn/vite），释放临时端口
        for name in ("backend.pid", "frontend.pid"):
            f = tmp_path / name
            if f.exists():
                try:
                    self._tracked.append(int(f.read_text().strip()))
                except ValueError:
                    pass
        for pid in self._tracked:
            _kill_tree(pid)
        # 兜底升级：服务树可能未被 pid 文件登记（如用例中途超时失败，start.sh 已
        # 拉起 uv/vite 但 pid 文件尚未写），按本用例专用临时端口 pkill 扫尾。
        # 模式来自测试内临时端口变量，pytest 自身 cmdline 不可能包含它们。
        for port in getattr(self, "_used_ports", []):
            subprocess.run(["pkill", "-9", "-f", f"--port {port}"], capture_output=True)
            deadline = time.monotonic() + 10
            while _port_listening(port) and time.monotonic() < deadline:
                subprocess.run(["pkill", "-9", "-f", f"--port {port}"], capture_output=True)
                time.sleep(0.5)
            if _port_listening(port):
                print(f"WARNING: 临时端口 {port} 清理后仍被占用")

    def _track_pid_files(self, tmp_path: Path) -> None:
        for name in ("backend.pid", "frontend.pid"):
            f = tmp_path / name
            if f.exists():
                try:
                    self._tracked.append(int(f.read_text().strip()))
                except ValueError:
                    pass

    def test_refuses_mismatched_occupation(self, tmp_path):
        """端口被不匹配进程占用：非零码退出 + 指引 + 目标进程存活。"""
        backend, frontend = _free_port(), _free_port()
        dummy = _spawn_http_server(backend)  # 无伪造身份
        try:
            _wait_listening(backend)
            env = _script_env(backend, frontend, tmp_path)
            result = _run_script(START_SH, env)
            assert result.returncode != 0, "不匹配占用时 start.sh 不应启动成功"
            combined = result.stdout + result.stderr
            assert "stop.sh" in combined, f"错误信息缺处理指引：{combined}"
            assert dummy.poll() is None, "占用进程被误杀"
            assert _port_listening(backend)
        finally:
            _ensure_dead(dummy)

    @pytest.mark.parametrize("topology", ["single", "spawn_tree"])
    def test_cleans_matching_process_then_starts(self, topology, tmp_path):
        """端口被合法身份占用：先清理（SIGTERM→SIGKILL 兜底）后启动，端口成功让位。

        真实启动段（uv run uvicorn + npm run dev，均在临时端口）：断言后端端口
        最终进入监听；收尾夹具负责杀掉拉起的服务树。
        """
        backend, frontend = _free_port(), _free_port()
        self._used_ports = [backend, frontend]
        fake_root = tmp_path / "projroot"
        (fake_root / "backend").mkdir(parents=True)
        argv0 = f"uvicorn app.main:app --reload --port {backend}"
        if topology == "spawn_tree":
            # spawn worker 拓扑：端口 fd 由仅含 spawn_main 的 worker 持有
            dummy, _worker_pid = _spawn_spawnworker_holders(backend, argv0, fake_root / "backend", tmp_path)
        else:
            dummy = _spawn_http_server(backend, argv0=argv0, cwd=fake_root / "backend")
        try:
            _wait_listening(backend)
            env = _script_env(backend, frontend, tmp_path, project_root=fake_root)
            result = _run_script(START_SH, env)
            assert result.returncode == 0, (result.stdout, result.stderr)
            _wait_exit(dummy)
            assert dummy.poll() is not None, "合法身份旧进程未被清理"
            # 启动继续：新后端成功绑定该端口。
            # 预算放宽到 75s：真实 dev 后端的 StatReload 监视 backend/，编辑测试文件会
            # 触发其重启并与本用例的 uv run 争项目锁，冷启动窗口可能显著拉长。
            _wait_listening(backend, timeout=75)
            self._track_pid_files(tmp_path)
        finally:
            _ensure_dead(dummy)

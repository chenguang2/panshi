"""硬杀 ansible 腿（2026-11-01 实机取证）。

背景：第 3 组补的 killpg 只作用于 ``_run_subprocess*``（SSH 子进程腿：脚本模式、
软件查询降级、install_openresty 第二阶段）。ansible 腿走 ansible-runner，其
``cancel_callback`` 只在**任务边界**被轮询，单个长命令内部无法中断——实测在
test 集群节点上跑 ``cmd_exec``（``sleep 45``），取消后库里 8 秒内落 cancelled，
但节点上的命令执行到自然结束（45s 才消失）。界面说「已取消」而节点仍在跑，
对重启/安装类改动型命令是危险的不准确。

用户裁决：按唯一标记硬杀 ansible-playbook。

本文件钉住三组契约：
1. 真进程：按 token 精确杀掉进程组，且**不误杀**另一并发运行的 playbook；
2. 健壮性：标记不存在时返回空列表且不抛异常（取消路径绝不能因杀进程失败而崩）；
3. run_playbook 注入 ``panshi_run_token``，cancel_event 置位后回调返回 True 且
   以同一 token 一次性硬杀（回调被反复轮询时不重复扫描 /proc）。
"""

import asyncio
import os
import signal
import subprocess
import time
import uuid
from types import SimpleNamespace

import pytest

from app.services import ansible_service


def _spawn_marked(token: str) -> subprocess.Popen:
    """起一个 cmdline 同时含 ``ansible-playbook`` 与 ``token`` 的真进程。

    两点务必如此：
    - 脚本写 ``sleep 30; echo done``（两条命令）——只有一条命令时 bash 会
      exec 优化把自身替换成 ``sleep``，标记随之从 cmdline 消失；
    - ``start_new_session=True`` 与 ansible-runner 真实行为一致（其
      ``pexpect.spawn`` 走 ``pty.fork`` → setsid，playbook 自成会话首进程），
      否则 killpg 会打到 pytest 自己的进程组。
    """
    return subprocess.Popen(
        ["bash", "-c", "sleep 30; echo ansible-playbook", "ansible-playbook", token],
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _kill_tree(proc: subprocess.Popen) -> None:
    """测试自清理：整组杀掉（已退出则跳过）。"""
    if proc.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
    try:
        proc.wait(timeout=5)
    except Exception:
        pass


# ── 1. 真进程硬杀 ────────────────────────────────────────────────────────


class TestHardKillRealProcess:
    @pytest.mark.timeout(30)
    def test_kills_only_processes_carrying_the_token(self):
        """同 token 的 playbook 5 秒内退出；不同 token 的同型进程仍存活。"""
        token = uuid.uuid4().hex
        other_token = uuid.uuid4().hex
        target = _spawn_marked(token)
        control = _spawn_marked(other_token)
        try:
            # 先确认两个进程都在跑且 cmdline 确实带标记（前置条件不成立时
            # 后续断言毫无意义）
            time.sleep(0.2)
            assert target.poll() is None
            assert control.poll() is None
            cmdline = open(f"/proc/{target.pid}/cmdline", "rb").read()
            assert b"ansible-playbook" in cmdline and token.encode() in cmdline

            started = time.time()
            pids = ansible_service.hard_kill_ansible_playbook(token)
            elapsed = time.time() - started

            assert target.pid in pids, f"命中进程应含目标 pid，实际 {pids}"
            target.wait(timeout=5)
            assert target.poll() is not None, "目标 playbook 必须被杀掉"
            assert elapsed < 6, f"硬杀不应长时间阻塞（实际 {elapsed:.1f}s）"

            assert control.poll() is None, (
                f"不同 token 的同型进程 {control.pid} 被误杀（pid 列表 {pids}）"
            )
            assert control.pid not in pids
        finally:
            _kill_tree(target)
            _kill_tree(control)


class TestHardKillRobustness:
    @pytest.mark.timeout(10)
    def test_unknown_token_returns_empty_without_raising(self):
        """token 不存在 → 返回 []，不抛异常（取消路径必须安全）。"""
        pids = ansible_service.hard_kill_ansible_playbook(f"no-such-{uuid.uuid4().hex}")
        assert pids == []


# ── 3. run_playbook 注入标记 + 回调一次性硬杀 ─────────────────────────────


def _fake_result() -> SimpleNamespace:
    return SimpleNamespace(
        rc=0,
        status="successful",
        stdout="",
        stderr="",
        events=[],
        config=SimpleNamespace(command=["ansible-playbook", "edge.yml"]),
    )


class TestRunPlaybookTokenAndCallback:
    @pytest.mark.asyncio
    async def test_injects_token_and_hard_kills_once_on_cancel(self, monkeypatch, tmp_path):
        """extravars 带 32 位 hex 标记；置位后回调以同一 token 硬杀且只杀一次。"""
        import ansible_runner

        captured: dict = {}

        def fake_run(**kwargs):
            captured.update(kwargs)
            return _fake_result()

        monkeypatch.setattr(ansible_runner, "run", fake_run)

        kills: list[str] = []
        monkeypatch.setattr(
            ansible_service,
            "hard_kill_ansible_playbook",
            lambda token, grace_seconds=3.0: kills.append(token) or [123],
        )

        svc = ansible_service.AnsibleRunnerService(private_data_dir=str(tmp_path))
        cancel_event = asyncio.Event()

        await svc.run_playbook(
            ip="10.0.0.9", tag="nginx_cmd_run", cancel_event=cancel_event,
        )

        token = captured["extravars"].get("panshi_run_token")
        assert isinstance(token, str) and len(token) == 32, f"token 应为 32 位 hex：{token!r}"
        assert all(c in "0123456789abcdef" for c in token), f"token 应为 hex：{token!r}"

        callback = captured.get("cancel_callback")
        assert callback is not None, "传了 cancel_event 就必须挂 cancel_callback"

        # ② 未取消：返回 False 且不得动硬杀
        assert callback() is False
        assert kills == []

        # ③ 取消：返回 True，以同一 token 硬杀
        cancel_event.set()
        assert callback() is True
        assert kills == [token], f"硬杀必须用本次运行的 token，实际 {kills}"

        # 回调会被 ansible-runner 反复轮询：只杀一次
        assert callback() is True
        assert kills == [token], "重复轮询不得重复扫描 /proc 重复硬杀"

    @pytest.mark.asyncio
    async def test_each_run_gets_a_distinct_token(self, monkeypatch, tmp_path):
        """并发任务各用各的标记（否则会互杀）。"""
        import ansible_runner

        tokens: list[str] = []

        def fake_run(**kwargs):
            tokens.append(kwargs["extravars"]["panshi_run_token"])
            return _fake_result()

        monkeypatch.setattr(ansible_runner, "run", fake_run)
        monkeypatch.setattr(
            ansible_service, "hard_kill_ansible_playbook", lambda *a, **kw: [],
        )

        svc = ansible_service.AnsibleRunnerService(private_data_dir=str(tmp_path))
        await svc.run_playbook(ip="10.0.0.1", tag="nginx_cmd_run")
        await svc.run_playbook(ip="10.0.0.2", tag="nginx_cmd_run")

        assert len(tokens) == 2 and tokens[0] != tokens[1]

    @pytest.mark.asyncio
    @pytest.mark.timeout(60)
    async def test_watcher_hard_kills_without_waiting_for_callback_poll(self, monkeypatch, tmp_path):
        """取消置位后立即硬杀，不等 cancel_callback 的下一个轮询窗口。

        ansible-runner 用 ``child.expect(..., timeout=pexpect_timeout)`` 读输出，
        默认 5 秒静默窗口内**不会**调用 cancel_callback——只靠回调则取消后
        playbook 还会活着 5 秒（实机实测 +4s 仍有 2 个进程）。
        """
        import threading

        import ansible_runner

        release = threading.Event()
        in_run = threading.Event()

        def fake_run(**kwargs):
            in_run.set()
            release.wait(timeout=20)  # 模拟长命令静默期：期间不轮询 cancel_callback
            return _fake_result()

        monkeypatch.setattr(ansible_runner, "run", fake_run)

        killed: list[str] = []

        def fake_kill(token, grace_seconds=3.0):
            killed.append(token)
            return [4242]

        monkeypatch.setattr(ansible_service, "hard_kill_ansible_playbook", fake_kill)

        svc = ansible_service.AnsibleRunnerService(private_data_dir=str(tmp_path))
        cancel_event = asyncio.Event()
        run_task = asyncio.ensure_future(
            svc.run_playbook(ip="10.0.0.9", tag="nginx_cmd_run", cancel_event=cancel_event)
        )
        try:
            for _ in range(250):
                if in_run.is_set():
                    break
                await asyncio.sleep(0.02)
            assert in_run.is_set(), "playbook 运行线程未启动"

            cancel_event.set()
            for _ in range(100):  # 最多等 2 秒
                if killed:
                    break
                await asyncio.sleep(0.02)
            assert killed, "取消置位后必须立即硬杀，而不是等 cancel_callback 的 5s 轮询"
        finally:
            release.set()
            await asyncio.wait_for(run_task, timeout=30)
        assert len(killed) == 1, f"watcher 与回调共用守卫，只应杀一次，实际 {killed}"

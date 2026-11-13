"""edge.service 启动自愈：残留 unix socket / pid 文件清理（2026-11-13 真实事故）。

事故现象（节点关机重启后 nginx 起不来）::

    edge[1937]: nginx: [emerg] bind() to unix:/data/.../uap-edge/conf/edge_events.sock
                failed (98: Address already in use)
    systemd[1]: edge.service: New main PID 2910714 does not exist or is a zombie.
    systemd[1]: edge.service: Failed with result 'protocol'.

根因：nginx 只在**正常退出**时 unlink 监听 unix socket
（`ngx_close_listening_sockets`：`ngx_process <= NGX_PROCESS_MASTER && ngx_new_binary == 0`），
断电 / 强杀（SIGKILL）后 `conf/edge_*.sock` 与 `logs/nginx.pid` 留在磁盘上；
`bin/edge` 的残留清理只在 `stop` 分支执行（`bin/edge` 第 ~1974 行），
`start` 分支不做清理，于是开机 `ExecStart` 必然 bind 失败。

本文件钉住两侧防线：
1. 平台下发的 edge.service：`ExecStartPre` 启动前清理残留（本文件的重点）；
2. 平台「启动 Nginx」脚本 `cmd_scripts/nginx_cmd.sh`：`nginx_start` 同样先清理
   （历史清理路径写成 `logs/` 而真实 socket 在 `conf/`，等于从未生效）。
"""

import os
import re
import subprocess
import time
from pathlib import Path

import pytest

from app.services.ansible_service import build_edge_service_content

NGINX_CMD_SH = Path(__file__).resolve().parents[1] / "ansible" / "cmd_scripts" / "nginx_cmd.sh"

_EXEC_START_PRE = re.compile(r"^ExecStartPre=(.*)$", re.MULTILINE)


def _unit(edge_path: str, run_user: str = "rocksware") -> str:
    return build_edge_service_content(run_user=run_user, edge_path=edge_path)


def _prestart_command(content: str) -> str:
    """Return the raw ExecStartPre value (systemd line value, unparsed)."""
    m = _EXEC_START_PRE.search(content)
    assert m, f"edge.service 缺失 ExecStartPre：\n{content}"
    return m.group(1)


def _prestart_script(content: str) -> str:
    """Extract the bash script from ``/bin/bash -c '<script>'``."""
    value = _prestart_command(content)
    assert value.startswith("/bin/bash -c '") and value.endswith("'"), (
        f"ExecStartPre 必须是单引号包裹的 bash -c（避免 systemd 引号嵌套/变量展开）：{value}"
    )
    return value[len("/bin/bash -c '") : -1]


def _make_edge_dir(tmp_path: Path) -> tuple[Path, list[Path], Path]:
    """Create a fake edge dir with the leftovers a hard kill leaves behind."""
    edge = tmp_path / "uap-edge"
    (edge / "conf").mkdir(parents=True)
    (edge / "logs").mkdir(parents=True)
    (edge / "bin").mkdir(parents=True)
    socks = [
        edge / "conf" / "edge_events.sock",
        edge / "conf" / "edge_stream_events.sock",
        edge / "conf" / "edge_stream_monitor.sock",
        edge / "logs" / "edge_stream_monitor.sock",
    ]
    for s in socks:
        s.write_text("")
    pidfile = edge / "logs" / "nginx.pid"
    pidfile.write_text("2910714")  # 上次开机遗留、早已回收的 PID
    return edge, socks, pidfile


def _run_script(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", "-c", script], capture_output=True, text=True, timeout=60)


def _dead_pid() -> int:
    """A PID that is guaranteed not to be running."""
    for candidate in range(999999, 999000, -1):
        try:
            os.kill(candidate, 0)
        except ProcessLookupError:
            return candidate
        except PermissionError:  # pragma: no cover - 进程存在但不可信号
            continue
    raise AssertionError("找不到可用的已退出 PID")


class TestEdgeServiceExecStartPre:
    """edge.service 必须在启动前自愈残留 socket / pid。"""

    def test_unit_declares_exec_start_pre(self):
        content = _unit("/data/rocks/uapm/3.1/uap-edge")
        assert _EXEC_START_PRE.search(content), "edge.service 缺少 ExecStartPre 自愈步骤"

    def test_prestart_script_is_systemd_safe(self):
        """脚本体内不得出现 $ / % / 单引号。

        - ``$``：systemd 会对 Exec 行做变量展开（单词级 ``$VAR``），脚本自身的
          变量会被 systemd 早一步吞掉；
        - ``%``：systemd 说明符展开，路径里出现 ``%`` 或脚本用 printf 即出错；
        - 单引号：外层用 ``'…'`` 包裹，内层再出现会截断。
        """
        script = _prestart_script(_unit("/data/rocks/uapm/3.1/uap-edge"))
        assert "$" not in script, script
        assert "%" not in script, script
        assert "'" not in script, script

    def test_prestart_script_parses_as_bash(self):
        script = _prestart_script(_unit("/data/rocks/uapm/3.1/uap-edge"))
        result = subprocess.run(["bash", "-n", "-c", script], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    def test_prestart_cleans_stale_sockets_and_pid(self, tmp_path):
        edge, socks, pidfile = _make_edge_dir(tmp_path)
        script = _prestart_script(_unit(str(edge)))

        result = _run_script(script)

        assert result.returncode == 0, (result.stdout, result.stderr)
        assert not pidfile.exists(), "残留 nginx.pid 未清理（systemd 会误判 protocol failure）"
        for sock in socks:
            assert not sock.exists(), f"残留 socket 未清理：{sock}"

    def test_prestart_keeps_live_instance_untouched(self, tmp_path):
        """本前缀的 openresty 在跑时不得动它的 socket（否则在跑实例新连接全断）。"""
        edge, socks, pidfile = _make_edge_dir(tmp_path)
        fake_or = edge / "bin" / "openresty"
        fake_or.write_text("#!/bin/bash\nsleep 30\n")
        fake_or.chmod(0o755)
        proc = subprocess.Popen([str(fake_or), "-p", str(edge)])
        try:
            time.sleep(0.3)
            script = _prestart_script(_unit(str(edge)))
            result = _run_script(script)
        finally:
            proc.kill()
            proc.wait(timeout=10)

        assert result.returncode != 0, "已有实例在跑时应显式失败，而不是继续启动第二个实例"
        assert "已在运行" in (result.stdout + result.stderr)
        for sock in socks:
            assert sock.exists(), f"在跑实例的 socket 被误删：{sock}"
        assert pidfile.exists()

    def test_stale_pid_file_does_not_block_cleanup(self, tmp_path):
        """pid 文件里的 PID 存活（PID 复用）也不得阻止清理——判据只看本前缀进程。"""
        edge, socks, pidfile = _make_edge_dir(tmp_path)
        pidfile.write_text(str(os.getpid()))
        script = _prestart_script(_unit(str(edge)))

        result = _run_script(script)

        assert result.returncode == 0, (result.stdout, result.stderr)
        assert not pidfile.exists()
        for sock in socks:
            assert not sock.exists()


class TestEdgeServiceExecStop:
    """ExecStop 必须是纯 systemd 语法（旧实现的双引号嵌套会被 systemd 截断）。"""

    def test_execstop_is_idempotent_edge_stop(self):
        edge_path = "/data/rocks/uapm/3.1/uap-edge"
        content = _unit(edge_path)
        line = next(l for l in content.splitlines() if l.startswith("ExecStop="))
        assert line == f"ExecStop=-{edge_path}/bin/edge stop", line

    def test_unit_has_no_nested_quotes(self):
        """整个 unit 不能有 `bash -c "…"$VAR"…"` 这类嵌套引号（systemd 会在内层引号处截断）。"""
        content = _unit("/opt/uap-edge")
        for line in content.splitlines():
            if line.startswith(("ExecStart", "ExecStop", "ExecReload")):
                assert line.count('"') == 0 or line.startswith('ExecStartPre='), line


class TestNginxCmdScriptCleansStaleSockets:
    """平台「启动 Nginx」脚本：nginx_start 必须先清理残留 socket。"""

    def _write_stub_edge(self, prefix: Path) -> None:
        stub = prefix / "bin" / "edge"
        stub.parent.mkdir(parents=True, exist_ok=True)
        (prefix / "conf").mkdir(parents=True, exist_ok=True)
        (prefix / "logs").mkdir(parents=True, exist_ok=True)
        stub.write_text(
            "#!/bin/bash\n"
            'WK_DIR="$(cd "$(dirname "$0")/.." && pwd)"\n'
            'if ls "$WK_DIR"/conf/*.sock >/dev/null 2>&1; then\n'
            '  echo STALE_PRESENT > "$WK_DIR/start-marker"\n'
            "else\n"
            '  echo STALE_CLEAN > "$WK_DIR/start-marker"\n'
            "fi\n"
            'echo 1 > "$WK_DIR/logs/nginx.pid"\n'
            "exit 0\n"
        )
        stub.chmod(0o755)

    def test_nginx_start_cleans_conf_sockets_first(self, tmp_path):
        prefix = tmp_path / "uap-edge"
        self._write_stub_edge(prefix)
        stale = prefix / "conf" / "edge_events.sock"
        stale.write_text("")
        (prefix / "logs" / "nginx.pid").write_text(str(_dead_pid()))

        result = subprocess.run(
            ["bash", str(NGINX_CMD_SH), "nginx_start", str(prefix), "16610"],
            capture_output=True,
            text=True,
            timeout=60,
        )

        assert "Failed to start Nginx" not in result.stdout
        assert not stale.exists(), "nginx_start 未清理 conf/ 残留 socket"
        assert (prefix / "start-marker").read_text().strip() == "STALE_CLEAN", (
            "残留 socket 必须在启动命令执行之前清理"
        )

    def test_stop_cleanup_targets_conf_and_logs(self):
        """历史实现只清 logs/（真实 socket 在 conf/），必须两处都清。"""
        source = NGINX_CMD_SH.read_text()
        assert "conf" in source and "logs" in source
        cleanup_fn = source.split("clean_stale_sockets", 1)
        assert len(cleanup_fn) > 1, "nginx_cmd.sh 应提供共享的残留清理函数"
        body = cleanup_fn[1].split("}", 1)[0]
        assert "conf" in body, body
        assert "logs" in body, body

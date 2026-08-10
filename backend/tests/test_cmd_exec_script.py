"""TDD tests for cmd_exec.sh — run the script via subprocess and assert behavior.

Tests the three security policies (blacklist/whitelist/none), base64 argument
decoding, and timeout/failure exit-code reporting.
"""

import base64
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "ansible" / "cmd_scripts" / "cmd_exec.sh"


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _run(security: str, timeout: str, cmd: str, whitelist: str = "") -> subprocess.CompletedProcess:
    """Invoke the script like the ansible script module would (arg-array, no shell)."""
    return subprocess.run(
        ["bash", str(SCRIPT), security, timeout, _b64(cmd), _b64(whitelist)],
        capture_output=True, text=True, timeout=10,
    )


class TestBlacklist:
    def test_allows_simple_ls(self):
        proc = _run("blacklist", "5", "ls /tmp")
        assert proc.returncode == 0, proc.stdout
        assert "ERROR" not in proc.stdout

    def test_allows_wildcard(self):
        """黑名单不禁 * 通配（讨论确认）"""
        proc = _run("blacklist", "5", "echo /etc/*.conf")
        assert proc.returncode == 0, proc.stdout
        assert "ERROR" not in proc.stdout

    def test_blocks_injection_semicolon(self):
        proc = _run("blacklist", "5", "ls; whoami")
        assert proc.returncode != 0
        assert "ERROR" in proc.stdout

    def test_blocks_injection_pipe(self):
        proc = _run("blacklist", "5", "ls | grep tmp")
        assert proc.returncode != 0
        assert "ERROR" in proc.stdout

    def test_blocks_dangerous_rm(self):
        """黑名单禁危险命令 rm（评审确认）——无特殊字符但危险"""
        proc = _run("blacklist", "5", "rm -rf /tmp/x")
        assert proc.returncode != 0
        assert "ERROR" in proc.stdout

    def test_blocks_dangerous_reboot(self):
        proc = _run("blacklist", "5", "reboot")
        assert proc.returncode != 0
        assert "ERROR" in proc.stdout


class TestWhitelist:
    def test_allows_builtin_bin(self):
        proc = _run("whitelist", "5", "ls -la /tmp", whitelist="ls,ps,df")
        assert proc.returncode == 0, proc.stdout
        assert "ERROR" not in proc.stdout

    def test_blocks_bin_not_in_list(self):
        proc = _run("whitelist", "5", "whoami", whitelist="ls,ps,df")
        assert proc.returncode != 0
        assert "ERROR" in proc.stdout

    def test_blocks_injection_even_if_bin_allowed(self):
        """白名单叠加注入校验（评审确认）：BIN 在白名单但含 ; 也被拦"""
        proc = _run("whitelist", "5", "ls; whoami", whitelist="ls,ps,df")
        assert proc.returncode != 0
        assert "ERROR" in proc.stdout

    def test_allows_pipe_between_whitelisted_bins(self):
        """任务 6 场景（修复）：白名单模式放行管道 |——各段首词均命中白名单即可。

        命令 ps -ef|grep -a ps 中 ps 与 grep 都在白名单，应可执行。
        grep 目标选 ps 保证管道必命中（grep 退出码为 0）。
        """
        proc = _run("whitelist", "5", "ps -ef | grep -a ps", whitelist="ls,ps,grep")
        assert proc.returncode == 0, proc.stdout
        assert "ERROR" not in proc.stdout
        assert "ERROR" not in proc.stderr

    def test_blocks_pipe_with_unwhitelisted_segment(self):
        """白名单管道中某段命令不在白名单 → 拦截（防 ls | whoami 绕过）。"""
        proc = _run("whitelist", "5", "ls -la | whoami", whitelist="ls,ps,df")
        assert proc.returncode != 0
        assert "不在白名单" in proc.stdout

    def test_blocks_pipe_with_injection_in_segment(self):
        """白名单管道某段含注入字符（;）→ 拦截。"""
        proc = _run("whitelist", "5", "ps -ef | grep -a nginx; whoami", whitelist="ls,ps,grep")
        assert proc.returncode != 0
        assert "注入字符" in proc.stdout or "不在白名单" in proc.stdout

    def test_blacklist_still_blocks_pipe(self):
        """黑名单策略仍然禁管道 |（修复不影响黑名单严格性）。"""
        proc = _run("blacklist", "5", "ps -ef | grep -a nginx", whitelist="")
        assert proc.returncode != 0
        assert "ERROR" in proc.stdout

    def test_allows_task_added_command(self):
        """任务内添加的命令（仅本次）可通过"""
        proc = _run("whitelist", "5", "echo added-ok", whitelist="ls,echo")
        assert proc.returncode == 0, proc.stdout
        assert "added-ok" in proc.stdout
        assert "ERROR" not in proc.stdout


class TestNone:
    def test_runs_any_command(self):
        proc = _run("none", "5", "whoami")
        assert proc.returncode == 0, proc.stdout
        assert "ERROR" not in proc.stdout


class TestTimeoutAndFailure:
    def test_timeout_reports_timeout(self):
        proc = _run("none", "1", "sleep 5")
        assert proc.returncode != 0
        assert "命令超时" in proc.stdout

    def test_failure_reports_exit_code(self):
        proc = _run("none", "5", "exit 3")
        assert proc.returncode != 0
        assert "exit=3" in proc.stdout


class TestBase64Transport:
    def test_command_with_spaces_and_quotes(self):
        """base64 传参（评审确认）：含空格/引号命令完整到达"""
        proc = _run("none", "5", 'echo "hello world"')
        assert proc.returncode == 0, proc.stdout
        assert "hello world" in proc.stdout

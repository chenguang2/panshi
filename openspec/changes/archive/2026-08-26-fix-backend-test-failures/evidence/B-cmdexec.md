FF....F..F...FFFFF                                                       [100%]
=================================== FAILURES ===================================
_____________________ TestBlacklist.test_allows_simple_ls ______________________

self = <tests.test_cmd_exec_script.TestBlacklist object at 0x109ce1ed0>

    def test_allows_simple_ls(self):
        proc = _run("blacklist", "5", "ls /tmp")
>       assert proc.returncode == 0, proc.stdout
E       AssertionError: ERROR: 命令执行失败 (exit=127)
E         /Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found
E         
E       assert 127 == 0
E        +  where 127 = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'blacklis...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').returncode

tests/test_cmd_exec_script.py:31: AssertionError
______________________ TestBlacklist.test_allows_wildcard ______________________

self = <tests.test_cmd_exec_script.TestBlacklist object at 0x109ce2bd0>

    def test_allows_wildcard(self):
        """黑名单不禁 * 通配（讨论确认）"""
        proc = _run("blacklist", "5", "echo /etc/*.conf")
>       assert proc.returncode == 0, proc.stdout
E       AssertionError: ERROR: 命令执行失败 (exit=127)
E         /Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found
E         
E       assert 127 == 0
E        +  where 127 = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'blacklis...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').returncode

tests/test_cmd_exec_script.py:37: AssertionError
____________________ TestWhitelist.test_allows_builtin_bin _____________________

self = <tests.test_cmd_exec_script.TestWhitelist object at 0x109cf4990>

    def test_allows_builtin_bin(self):
        proc = _run("whitelist", "5", "ls -la /tmp", whitelist="ls,ps,df")
>       assert proc.returncode == 0, proc.stdout
E       AssertionError: ERROR: 命令执行失败 (exit=127)
E         /Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found
E         
E       assert 127 == 0
E        +  where 127 = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'whitelis...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').returncode

tests/test_cmd_exec_script.py:65: AssertionError
___________ TestWhitelist.test_allows_pipe_between_whitelisted_bins ____________

self = <tests.test_cmd_exec_script.TestWhitelist object at 0x109cf5910>

    def test_allows_pipe_between_whitelisted_bins(self):
        """任务 6 场景（修复）：白名单模式放行管道 |——各段首词均命中白名单即可。
    
        命令 ps -ef|grep -a ps 中 ps 与 grep 都在白名单，应可执行。
        grep 目标选 ps 保证管道必命中（grep 退出码为 0）。
        """
        proc = _run("whitelist", "5", "ps -ef | grep -a ps", whitelist="ls,ps,grep")
>       assert proc.returncode == 0, proc.stdout
E       AssertionError: ERROR: 命令执行失败 (exit=127)
E         /Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found
E         
E       assert 127 == 0
E        +  where 127 = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'whitelis...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').returncode

tests/test_cmd_exec_script.py:86: AssertionError
_________________ TestWhitelist.test_allows_task_added_command _________________

self = <tests.test_cmd_exec_script.TestWhitelist object at 0x109cf7390>

    def test_allows_task_added_command(self):
        """任务内添加的命令（仅本次）可通过"""
        proc = _run("whitelist", "5", "echo added-ok", whitelist="ls,echo")
>       assert proc.returncode == 0, proc.stdout
E       AssertionError: ERROR: 命令执行失败 (exit=127)
E         /Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found
E         
E       assert 127 == 0
E        +  where 127 = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'whitelis...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').returncode

tests/test_cmd_exec_script.py:111: AssertionError
________________________ TestNone.test_runs_any_command ________________________

self = <tests.test_cmd_exec_script.TestNone object at 0x109cf7c10>

    def test_runs_any_command(self):
        proc = _run("none", "5", "whoami")
>       assert proc.returncode == 0, proc.stdout
E       AssertionError: ERROR: 命令执行失败 (exit=127)
E         /Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found
E         
E       assert 127 == 0
E        +  where 127 = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'none', '...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').returncode

tests/test_cmd_exec_script.py:119: AssertionError
______________ TestTimeoutAndFailure.test_timeout_reports_timeout ______________

self = <tests.test_cmd_exec_script.TestTimeoutAndFailure object at 0x109cf8490>

    def test_timeout_reports_timeout(self):
        proc = _run("none", "1", "sleep 5")
        assert proc.returncode != 0
>       assert "命令超时" in proc.stdout
E       AssertionError: assert '命令超时' in 'ERROR: 命令执行失败 (exit=127)\n/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n'
E        +  where 'ERROR: 命令执行失败 (exit=127)\n/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n' = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'none', '...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').stdout

tests/test_cmd_exec_script.py:127: AssertionError
_____________ TestTimeoutAndFailure.test_failure_reports_exit_code _____________

self = <tests.test_cmd_exec_script.TestTimeoutAndFailure object at 0x109cf8b10>

    def test_failure_reports_exit_code(self):
        proc = _run("none", "5", "exit 3")
        assert proc.returncode != 0
>       assert "exit=3" in proc.stdout
E       AssertionError: assert 'exit=3' in 'ERROR: 命令执行失败 (exit=127)\n/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n'
E        +  where 'ERROR: 命令执行失败 (exit=127)\n/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n' = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'none', '...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').stdout

tests/test_cmd_exec_script.py:132: AssertionError
___________ TestBase64Transport.test_command_with_spaces_and_quotes ____________

self = <tests.test_cmd_exec_script.TestBase64Transport object at 0x109cf93d0>

    def test_command_with_spaces_and_quotes(self):
        """base64 传参（评审确认）：含空格/引号命令完整到达"""
        proc = _run("none", "5", 'echo "hello world"')
>       assert proc.returncode == 0, proc.stdout
E       AssertionError: ERROR: 命令执行失败 (exit=127)
E         /Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found
E         
E       assert 127 == 0
E        +  where 127 = CompletedProcess(args=['bash', '/Users/qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh', 'none', '...qichenguang/project/test-03/backend/ansible/cmd_scripts/cmd_exec.sh: line 88: timeout: command not found\n', stderr='').returncode

tests/test_cmd_exec_script.py:139: AssertionError
=========================== short test summary info ============================
FAILED tests/test_cmd_exec_script.py::TestBlacklist::test_allows_simple_ls - ...
FAILED tests/test_cmd_exec_script.py::TestBlacklist::test_allows_wildcard - A...
FAILED tests/test_cmd_exec_script.py::TestWhitelist::test_allows_builtin_bin
FAILED tests/test_cmd_exec_script.py::TestWhitelist::test_allows_pipe_between_whitelisted_bins
FAILED tests/test_cmd_exec_script.py::TestWhitelist::test_allows_task_added_command
FAILED tests/test_cmd_exec_script.py::TestNone::test_runs_any_command - Asser...
FAILED tests/test_cmd_exec_script.py::TestTimeoutAndFailure::test_timeout_reports_timeout
FAILED tests/test_cmd_exec_script.py::TestTimeoutAndFailure::test_failure_reports_exit_code
FAILED tests/test_cmd_exec_script.py::TestBase64Transport::test_command_with_spaces_and_quotes
9 failed, 9 passed in 0.35s

=== 初步归类 (1.3) ===
簇: B 命令执行脚本 (9 失败)
根因: ansible/cmd_scripts/cmd_exec.sh line 88 使用 `timeout` 命令，macOS 无 GNU timeout (需 coreutils)
环境事实: macOS 默认无 timeout 命令
D2 归类: 环境依赖 — 生产环境为 Linux (含 timeout)，开发机 macOS 缺失
置信度: 0.95
建议处置: skip(reason="macOS 缺 GNU timeout，生产环境 Linux 自带") + 登记豁免；或在 cmd_exec.sh 增加 fallback (perl alarm / python -c signal)
涉及文件: backend/ansible/cmd_scripts/cmd_exec.sh, tests/test_cmd_exec_script.py

=== 修复结论 ===
根因: cmd_exec.sh 第 88 行使用 GNU `timeout`，macOS 无此命令
处置: 环境依赖 → 代码修复（加跨平台兜底）
修改: backend/ansible/cmd_scripts/cmd_exec.sh 增加 run_timeout_bash() 函数：
  - 优先用 GNU timeout（Linux 生产环境自带）
  - 回退纯 bash 实现：后台跑命令 + sleep 监控 + kill，超时返回 124（匹配 GNU timeout 语义）
验证: test_cmd_exec_script.py 18/18 PASS
D2 归类: 环境依赖（macOS 缺 GNU timeout）→ 代码修复实现兼容
涉及提交: 待用户显式请求

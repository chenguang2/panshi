## 1. ansible 脚本与 playbook

- [x] 1.1 新增 `backend/ansible/cmd_scripts/cmd_exec.sh`：base64 解码命令与白名单；三策略（黑名单禁注入字符+危险命令 / 白名单叠加注入校验 / 不限制）；超时区分（124=超时，非 124 显示退出码）
- [x] 1.2 新增 `backend/ansible/roles/edge/tasks/cmd_exec.yml`（tag `cmd_exec_run`，script 带参模式仿 check_env.yml）+ main.yml 引用 + group_vars 变量
- [x] 1.3 手动验证：ls 通过、rm -rf 被黑名单拦、ls; whoami 被白名单拦、超时截断

## 2. 后端分支（TDD）

- [x] 2.1 新增测试：cmd_exec.sh 输出解析（成功/黑名单拦截/白名单拦截/超时/失败）为结构化结果
- [x] 2.2 新增测试：`_execute_node` 的 `cmd_exec` 分支 base64 编码命令与白名单，构造正确 extravars
- [x] 2.3 ALLOWED_TAGS 加 `cmd_exec_run`；实现分支，运行测试 GREEN

## 3. 前端表单（NodeTaskCenter）

- [x] 3.1 taskTypes 加 `{ value: 'cmd_exec', label: '命令执行' }`
- [x] 3.2 命令输入框（必填）+ 安全策略单选（默认黑名单）+ 超时输入（默认 30）
- [x] 3.3 白名单模式下：内置命令列表 + 自定义添加（仅本次）
- [x] 3.4 提交 `params={cmd, security, timeout, whitelist?}`

## 4. 前端测试

- [x] 4.1 表单测试：命令必填、三策略切换、白名单添加、超时默认
- [x] 4.2 提交 params 组装测试

## 5. 验证

- [x] 5.1 后端全量 pytest（无新增失败）
- [x] 5.2 前端 vitest + build
- [x] 5.3 手动链路：创建命令执行任务（ls）→ 执行 → 详情日志显示输出；rm -rf 被拦截验证

## Context

- `AnsibleService.__init__`（进程启动时执行一次）创建 `/tmp/panshi-cp`；`run_playbook` 通过 `ANSIBLE_SSH_CONTROL_PATH=/tmp/panshi-cp/%h-%p-%r` 使用它。
- `/tmp` 生命周期：重启清空 + `systemd-tmpfiles-clean` 会删除长期未访问的目录 → 运行一段时间后目录消失。
- 方案比选：持久目录方案被否决——Unix socket 路径上限约 108 字符，部署路径深时（如 /data/irtm/uapm/...）有超限风险；且残留套接字需自行清理。修"创建时机"优于"换位置"。

## Goals / Non-Goals

**Goals:** 每次运行 playbook 前自愈目录；失败注入测试证明自愈能力。

**Non-Goals:** 不改 ControlPath 位置；不做后台定时巡检。

## Decisions

- 抽取 `_ensure_control_path_dir()` 静态方法（`os.makedirs(..., exist_ok=True)`），`__init__` 与 `run_playbook` 入口各调用一次（双保险）。

## Risks / Trade-offs

- makedirs 失败（权限异常）时 playbook 仍会失败——与现状一致，不引入新问题；错误信息会包含目录缺失原因。

## Why

生产环境（/data/irtm/uapm/panshi 部署）出现「获取 edge.env」失败：`unix_listener: cannot bind to path /tmp/panshi-cp/...: No such file or directory`。根因：SSH ControlMaster 套接字目录 `/tmp/panshi-cp` 只在平台进程启动时创建一次（`AnsibleService.__init__`），而 `/tmp` 会被系统重启或 `systemd-tmpfiles-clean` 定期清理——目录消失后所有 ansible 操作（读 env、节点任务、安装）全部失败，直到重启平台。

## What Changes

- `run_playbook` 入口处每次确保 `/tmp/panshi-cp` 存在（抽公共方法 `_ensure_control_path_dir()`，构造函数与运行入口共用）
- 保持 ControlPath 位置不变（/tmp 短路径规避 Unix socket 108 字符上限；持久目录方案已评估并否决）

## Capabilities

### New Capabilities
- `ansible-controlpath-selfheal`: SSH ControlPath 目录的运行时自愈

### Modified Capabilities
<!-- 无 -->

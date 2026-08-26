## ADDED Requirements

### Requirement: ControlPath 目录运行时自愈

系统 SHALL 在每次运行 playbook 前确保 SSH ControlMaster 套接字目录存在，使 `/tmp` 清理或重启导致的目录缺失在下一次操作时自动恢复。

#### Scenario: 目录被清理后下一次运行自愈
- **WHEN** `/tmp/panshi-cp` 目录被删除后发起任意 ansible 操作（如读取 edge.env）
- **THEN** 运行入口重新创建该目录，SSH 连接正常建立，操作成功

#### Scenario: 目录已存在时不重复报错
- **WHEN** 目录已存在
- **THEN** 创建调用幂等通过（exist_ok），行为与现状一致

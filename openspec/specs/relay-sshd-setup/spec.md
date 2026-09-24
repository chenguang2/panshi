# relay-sshd-setup Specification

## Purpose

网关机 sshd 跳板转发配置的 root 通道下发：以 root 直连 SSH 在网关机写 `/etc/ssh/sshd_config.d/relay-tunnel.conf`（`AllowTcpForwarding yes` + `PermitOpen` 白名单），改前备份、`sshd -t`/`sshd -T` 双校验、失败自动回滚、仅 reload；root 凭据界面输入、仅本次使用、零残留。

## Requirements

### Requirement: 网关 sshd 跳板配置经 root 通道下发
系统 SHALL 提供 `POST /relay/gateways/{id}/sshd-setup`（SSE），以 root 直连 SSH 在网关机写 `/etc/ssh/sshd_config.d/relay-tunnel.conf`（`AllowTcpForwarding yes` + `PermitOpen` 白名单），并 SHALL 确保主 `sshd_config` 以置顶 `Include` 该目录（使 drop-in 的首个匹配生效）。root 凭据由界面输入，仅本次使用。

#### Scenario: 成功配置并生效
- **WHEN** 运维填入网关 root 凭据并触发
- **THEN** 写入 drop-in、`sshd -t` 语法校验通过、`sshd -T` 显示 `allowtcpforwarding yes`、`systemctl reload sshd` 成功

#### Scenario: 校验失败自动回滚
- **WHEN** 任一步骤校验失败
- **THEN** 恢复备份的主配置并移除 drop-in、再次 `sshd -t` 确认、reload 回滚后配置，**运行中的 sshd 不受影响**，失败原因（含校验输出）回显

#### Scenario: 厂商 sshd 不支持多目标 PermitOpen
- **WHEN** `sshd -t` 因 `PermitOpen` 格式报错（如 LinxOS `bad port number in permitopen`）
- **THEN** 回退为仅 `AllowTcpForwarding yes`，校验成功后应用，并回显已回退及原因

### Requirement: root 凭据仅本次使用
root 凭据 SHALL NOT 落库、SHALL NOT 出现在命令行/展示命令/日志；SHALL 仅行级临时写入网关清单供本次 playbook 使用，并在流的 `finally` 还原（与自启动同款）。

#### Scenario: 运行后零残留
- **WHEN** sshd-setup 执行结束（成功或失败）
- **THEN** 网关清单恢复为执行前内容（字节级一致），且凭据不存在于任何持久化位置

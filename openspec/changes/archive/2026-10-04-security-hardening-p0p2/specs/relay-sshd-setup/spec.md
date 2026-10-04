# relay-sshd-setup Delta

## MODIFIED Requirements

### Requirement: root 凭据仅本次使用

root 凭据 SHALL NOT 落库、SHALL NOT 出现在命令行/展示命令/日志；SHALL 仅行级临时写入网关清单供本次 playbook 使用，并在流的 `finally` 还原（与自启动同款）。注入行 SHALL 打标，进程崩溃后可被启动清扫移除。

#### Scenario: 运行后零残留

- **WHEN** sshd-setup 执行结束（成功或失败）
- **THEN** 网关清单恢复为执行前内容（字节级一致），且凭据不存在于任何持久化位置

#### Scenario: 注入行打标

- **WHEN** root 凭据被行级临时注入网关清单
- **THEN** 注入行 SHALL 携带 `# panshi-injected` 标记（清扫依据）
- **AND** 正常还原后清单 SHALL NOT 残留该标记

#### Scenario: 崩溃残留启动清扫

- **WHEN** 进程在注入后崩溃（内存备份丢失，`finally` 未执行）且后端重启
- **THEN** 启动生命周期 SHALL 执行 `sweep_injected_creds` 清扫：移除全部打标行、清单收权 0600
- **AND** 清扫 SHALL 记录警告日志提示运维复核（被替换的原生行值不可恢复，回退清单默认身份）
- **AND** 未打标的原生行 SHALL NOT 被误删

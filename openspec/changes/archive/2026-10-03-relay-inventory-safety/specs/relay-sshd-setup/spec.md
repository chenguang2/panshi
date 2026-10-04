# relay-sshd-setup Delta

## MODIFIED Requirements

### Requirement: root 凭据仅本次使用

root 凭据 SHALL NOT 落库、SHALL NOT 出现在命令行/展示命令/日志；SHALL 仅行级临时写入网关清单供本次 playbook 使用，并在流的 `finally` 还原（与自启动同款）。凭据注入 SHALL 覆盖该网关 IP 在清单中的**全部主机块**：同一 IP 出现在多个区域组（多个主机块）时，任一块未注入都会让该块原有的身份变量（如 `jboss`）在 ansible 主机变量合并中胜出，导致 root 流程以普通账号连接。还原 SHALL 在该 IP 的各主机块内定位注入行逐行还原（尾部配对、倒序），SHALL NOT 全文件扫描首个变量行（防凭据残留到其他块）。

#### Scenario: 运行后零残留

- **WHEN** sshd-setup 执行结束（成功或失败）
- **THEN** 网关清单恢复为执行前内容（字节级一致），且凭据不存在于任何持久化位置

#### Scenario: 同一 IP 多主机块全部注入

- **WHEN** 网关机 IP 同时出现在网关清单的多个区域组（多个主机块），sshd-setup 注入 root 凭据
- **THEN** 注入 SHALL 为该 IP 的每一个主机块写入 `ansible_user`/`ansible_ssh_pass`
- **AND** 任一块未注入都会导致 root 流程以该块原身份变量连接（实测以 jboss 连接报 `/etc/ssh/sshd_config not readable`），SHALL NOT 发生

#### Scenario: 还原块内锚定且不越块

- **WHEN** 流结束执行凭据还原
- **THEN** 还原 SHALL 在该 IP 的各主机块内定位注入行：新插入的行删除、改写的行恢复原值（尾部配对、倒序还原）
- **AND** 清单在注入后若被手工增删主机块，多出的块 SHALL NOT 被改动、缺失的块跳过
- **AND** 还原 SHALL NOT 触及该 IP 主机块以外的任何行

## ADDED Requirements

### Requirement: 网关清单防呆与路径字段卫生

系统 SHALL 对网关清单实施三层防呆，并保证区域路径字段卫生：

1. init/push 端点 SHALL 在 SSE 流开始前校验 `gateways_<code>` 主机组存在，缺失时返回 503，错误信息 SHALL 附可照抄的 YAML 片段（`ssh_jump` 可解析时预填账号/地址）；
2. init/push 的 ansible 流 SHALL 启用空匹配守卫：rc=0 但输出含「Could not match supplied host pattern」/「no hosts matched」时，终态 SHALL 判 failed 并附 error（ansible 对空匹配以 rc=0 退出的假成功陷阱）；
3. `GET /relay/gateways` 每行 SHALL 返回 `inventory_group_missing` 漂移标记，界面状态列 SHALL 显示「清单缺组」。

区域的 `http_base_url` / `ssh_jump` / `openresty_prefix` SHALL 在创建/更新落库前去首尾空白（strip 后为空串归 `None`）。网关清单主机组解析 SHALL 收敛单一实现，init/push/sshd-setup/列表标记同源。

#### Scenario: 缺组前置拦截

- **WHEN** init/push 触发且网关清单缺 `gateways_<code>` 主机组
- **THEN** 端点 SHALL 在 SSE 流开始前返回 503，错误信息附可照抄的 YAML 片段
- **AND** 片段在 `ssh_jump` 可解析时 SHALL 预填账号与地址

#### Scenario: 空匹配假成功守卫

- **WHEN** init/push 的 ansible 执行以 rc=0 结束，但输出含「no hosts matched」/「Could not match supplied host pattern」
- **THEN** 流终态 SHALL 判 failed 并附「主机组不存在或为空，未对任何主机执行」类 error，SHALL NOT 呈现为成功

#### Scenario: 清单漂移标记

- **WHEN** 管理员查看网关列表（`GET /relay/gateways`）
- **THEN** 区域已注册但清单缺该局主机组的行 SHALL 带 `inventory_group_missing` 标记
- **AND** 界面状态列 SHALL 显示「清单缺组」，提示运维补齐清单后再执行 init/push

#### Scenario: 路径字段保存前 strip

- **WHEN** 创建或更新区域时提交的 `http_base_url` / `ssh_jump` / `openresty_prefix` 带首尾空白
- **THEN** 落库值 SHALL 去除首尾空白，strip 后为空串的 SHALL 存为 `None`
- **AND** 前导空格曾致 init 的 nginx 探测静默失败（2026-10-03 kjc 实发），此类脏值 SHALL NOT 入库

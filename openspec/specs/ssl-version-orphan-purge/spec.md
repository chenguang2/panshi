## Purpose

SSL 证书版本快照的孤儿治理：删除证书时同一事务清理全部版本快照（消除 id 复用导致的孤儿继承，uapm 案例）、启动时幂等清理历史遗留孤儿、版本管理弹窗对异代快照（快照 name ≠ 当前资源名）可见化并在回滚确认时红色警示，防止把已删除证书的身份整个复活。

# ssl-version-orphan-purge 变更规格

## Requirements
### Requirement: 删除证书时清理版本快照

删除 SSL 证书（`delete_db` 分支）时，系统 SHALL 同一事务内删除该证书（`resource_type='ssl'`，`resource_id=cert_id`）的全部配置版本快照。

#### Scenario: 删除证书后版本历史不留孤儿
- **GIVEN** 某证书存在若干配置版本快照
- **WHEN** 用户删除该证书（delete_db=true）
- **THEN** 该证书的全部版本快照 SHALL 被删除
- **AND** 后续同 id 新建的证书 SHALL NOT 在版本历史中看到任何被删证书的条目

#### Scenario: 仅删 Edge 不删库时保留版本
- **GIVEN** 某证书存在版本快照
- **WHEN** 用户删除该证书且仅勾选 delete_edge（delete_db=false）
- **THEN** 平台记录与版本快照 SHALL 保留（与现状一致）

### Requirement: 启动时清理存量孤儿版本

后端启动时 SHALL 一次性清理 ssl 域中「`created_at` 早于所属证书 `created_at`」的版本快照；该操作 SHALL 幂等且不影响任何晚于证书创建时间的快照（无论快照内容归属）。

#### Scenario: id 复用遗留的孤儿被清理
- **GIVEN** 证书 X（id=2，今天创建）名下有一条 7 月的版本快照（早于 X 创建时间）
- **WHEN** 后端启动
- **THEN** 该 7 月快照 SHALL 被删除
- **AND** X 名下晚于其创建时间的快照 SHALL 全部保留

#### Scenario: 重复启动幂等
- **WHEN** 后端多次启动
- **THEN** 清理 SHALL 幂等（无孤儿时零删除、无报错）

### Requirement: 异代快照可见与回滚警示

版本管理弹窗 SHALL 解析版本快照 `config` 中的 `name`；当快照名与当前资源名不一致时，SHALL 在该版本列表项显示异代标记，并在回滚确认弹窗显示红色警示（说明恢复将覆盖当前证书的名称与内容）。快照名解析失败或一致时 SHALL NOT 显示标记。其它域（快照含 `name` 者）自动获得同等可见性，SHALL NOT 受本变更破坏。

#### Scenario: 异代快照列表标记
- **GIVEN** 某证书的版本历史含一条快照 name 为「gm-server」的条目，当前证书名为「uapm」
- **WHEN** 用户打开版本管理
- **THEN** 该条目 SHALL 显示异代标记（含快照名提示）

#### Scenario: 回滚确认警示
- **WHEN** 用户对异代快照执行「恢复」并确认
- **THEN** 确认弹窗 SHALL 显示红色警示（恢复将覆盖当前证书的名称与内容）

#### Scenario: 正常快照不标记
- **GIVEN** 版本快照 name 与当前资源名一致（或解析失败）
- **WHEN** 用户打开版本管理
- **THEN** 该条目 SHALL NOT 显示异代标记

# Delta Spec: sqlite-remote-backup

## MODIFIED Requirements

### Requirement: SSH 推送与远端保留清理
系统 SHALL 通过 SSH 将备份包推送到配置的远端机器目录（先 `mkdir -p`，再以 `.part` 临时名上传，成功后原子改名）；备份包名 SHALL 为 `panshi_backup_{source}_{YYYYMMDD_HHMMSS}.tar.gz`（source 为来源标识，取值规则见「备份配置模型与安全存储」）；远端列表与保留清理 MUST 仅匹配**组合白名单正则**——同时接受新格式与升级前旧格式 `panshi_backup_{YYYYMMDD_HHMMSS}.tar.gz`（正则 MUST 单点定义于备份服务并由恢复服务复用，禁止两处硬编码各自演化）；保留清理的候选集 MUST 为「来源标识等于本机的包 ∪ 旧格式包」，**MUST NOT 删除来源标识不同的新格式包**；候选集内 MUST 按包名中的时间戳倒序保留 `retain_count` 份、删除更旧的；密码认证 MUST 经 SSHPASS 环境变量传递且绝不进入命令行参数；密钥认证 MUST NOT 依赖 sshpass；日志与审计中的命令 MUST 脱敏密码；**远端侧命令中拼接的路径与文件名参数 MUST 经 `shlex.quote` 转义**。

#### Scenario: 包名含来源标识
- **WHEN** 来源标识为 `192.168.0.5` 的平台实例执行备份
- **THEN** 生成的备份包名形如 `panshi_backup_192.168.0.5_20260930_153000.tar.gz`

#### Scenario: 共享目录同秒互不覆盖
- **WHEN** 两台平台实例（来源标识不同）同一秒内备份到同一远端目录
- **THEN** 两个包文件名不同，互不覆盖

#### Scenario: 密码认证推送
- **WHEN** 配置为密码认证且 sshpass 已安装
- **THEN** 远端目录自动创建，备份包上传并原子改名完成，命令行参数中不含密码明文

#### Scenario: 上传中断不留半截文件
- **WHEN** 上传过程中连接中断
- **THEN** 远端仅存在 `.part` 临时文件（不计入保留份数、不出现在备份列表），下次备份不受影响

#### Scenario: sshpass 缺失提示
- **WHEN** 配置为密码认证且 sshpass 未安装
- **THEN** 备份失败并给出包含安装指引的明确错误信息

#### Scenario: 超保留量清理最旧
- **WHEN** 本机来源的包数达到 retain_count 且新备份上传成功
- **THEN** 系统删除候选集内最旧的超出份，保持候选集份数不超过 retain_count

#### Scenario: 不删他源新格式包
- **WHEN** 远端共享目录存在来源标识为其他实例的新格式包且本机清理触发
- **THEN** 那些包不被删除、不计入本机保留份数

#### Scenario: 旧格式包自然老化
- **WHEN** 升级后远端仍存在本机升级前产生的旧格式包
- **THEN** 旧格式包参与本机保留窗口排序，随新备份增加自然老化删除，不永久堆积

#### Scenario: 远端命令参数转义
- **WHEN** 远端目录配置含空格或特殊字符
- **THEN** 拼接进远端命令的路径经 shlex.quote 转义，命令按预期执行且无注入风险

### Requirement: 备份配置模型与安全存储
系统 SHALL 以单行配置表存储备份目标与策略（启用、主机、端口、用户、认证方式、密码、密钥路径、远端目录、间隔、保留份数、三个打包开关、**来源标识**、最近状态）；配置保存 MUST 校验间隔 ≥ 1 分钟、保留份数 ≥ 1；**来源标识非空时 MUST 匹配 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`（首字符必须字母/数字），否则校验拒绝**；**来源标识为空或未提供时 MUST 自动解析并持久化**（解析顺序：到备份目标方向的出口 IP → 主机名 → 兜底常量；配置保存时与存量空值首次备份时各解析一次并回写）；**备份执行 MUST 使用已存储的来源标识，MUST NOT 每次备份动态重新探测**；**容灾恢复落位后新机 MUST 保留恢复包配置内的来源标识（保证远端旧包的保留清理连续性）**；密码 MUST 以 Fernet 加密落库且 API 响应 MUST NOT 回显明文；系统 SHALL 以历史表记录每次备份（时间、状态、包体积、耗时、错误信息、触发来源）。

#### Scenario: 密码加密落库与不回显
- **WHEN** 保存含密码的备份配置后查询配置
- **THEN** 库中存储为 Fernet 密文，API 响应不含密码明文

#### Scenario: 非法配置值被拒
- **WHEN** 保存间隔为 0 分钟或保留份数为 0 的配置
- **THEN** 返回校验错误，配置不落库

#### Scenario: 来源标识非法字符被拒
- **WHEN** 保存含 `/`、空格、首字符非字母数字（如 `..`、`-x`）或超过 64 字符的来源标识
- **THEN** 返回校验错误，配置不落库

#### Scenario: 来源标识空值自动解析
- **WHEN** 保存备份配置时未填写来源标识
- **THEN** 系统解析出口 IP（不可得时取主机名，再不可得取兜底常量）并持久化，配置响应回显该值

#### Scenario: 存量空值首次备份回写
- **WHEN** 升级部署后存量配置的来源标识为空且首次备份执行
- **THEN** 备份前解析并回写配置行，本次及后续包名均使用该值

#### Scenario: 恢复继承来源标识
- **WHEN** 容灾恢复将备份包内的站点库落位到新机
- **THEN** 新机的备份配置保留恢复包内的来源标识，后续备份沿用该标识（旧机产生的远端包被新机视为己方，保留清理连续）

#### Scenario: 备份历史可查
- **WHEN** 任一次备份（成功或失败）完成
- **THEN** 历史表新增记录含状态、耗时、包体积与触发来源，UI 历史列表可见

### Requirement: 备份包内容与环境一致性
备份包 SHALL 为 tar.gz，包含：meta.json、databases/（注册库快照，**按连接 id 平铺命名，meta 记录每个库的原路径**）、config/（db_config.json、features.yaml、clickhouse.yaml、.jwt_secret、**全部存在的 .env.\***）、ansible/（inventory/host、inventory/backups/、group_vars/）、data/（仅勾选开关项）；data/ 下 static/、task-scripts/、task-logs/ 三项 MUST 为配置开关且默认全部不勾选。meta.json SHALL 记录 app 版本标识（pyproject version，部署目录存在 .git 时附 commit hash，皆不可得记 unknown）、备份时间（UTC）、active 连接 id、**来源标识**、每个文件的字节大小与 SHA256、各库原路径与 skipped 清单。

#### Scenario: A 类配置文件必含
- **WHEN** 备份执行
- **THEN** 包内包含 db_config.json、features.yaml、clickhouse.yaml，且 .jwt_secret 与全部已存在的 .env.* 一并打包

#### Scenario: 库原路径记录
- **WHEN** 某注册库位于 data/ 相对路径、另一注册库位于绝对路径
- **THEN** 两者均以连接 id 平铺进入 databases/，meta.json 分别记录其原路径供恢复落位

#### Scenario: B 类开关默认关闭
- **WHEN** 用户未修改打包开关配置即触发备份
- **THEN** 包内 data/ 段不含 static/、task-scripts/、task-logs/

#### Scenario: 勾选后随包
- **WHEN** 用户勾选 static 与 task-scripts 后触发备份
- **THEN** 包内 data/ 段包含 static/ 与 task-scripts/，不含 task-logs/

#### Scenario: 元数据记录版本与校验和
- **WHEN** 备份包生成
- **THEN** meta.json 记录 app 版本标识（尽力而为，不可得记 unknown）、active 连接 id、每个文件的字节大小与 SHA256、skipped 清单

#### Scenario: 元数据记录来源标识
- **WHEN** 备份包生成
- **THEN** meta.json 记录本机来源标识，供恢复侧展示与核对

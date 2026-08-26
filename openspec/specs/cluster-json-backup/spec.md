# cluster-json-backup

## Purpose

提供集群级 JSON 全量备份导出与导入重建能力（区别于面向人阅读的 Excel 报表导出）。备份覆盖 Excel 未包含的全部表与字段（路由高级匹配、四层代理超时/健康检查、节点 SSH 等），支持敏感内容开关；导入采用单一模式——新建集群、数据库分配新 ID、按插入时捕获的旧 ID→新 ID 映射重建外键，源数据悬空引用自动清理并计入警告清单，内容缺失进入"需补齐清单"。整库级灾备恢复由「数据库管理」的整库迁移承担，不在本能力范围内。

## Requirements

### Requirement: 集群 JSON 备份导出

系统 SHALL 提供集群级 JSON 备份导出，覆盖集群全部业务表的全量字段，且不依赖 Excel 导出。

#### Scenario: 导出包含 Excel 缺失的字段
- **WHEN** 管理员对某集群执行备份下载
- **THEN** 备份内容包含路由的 `vars`、`remote_addrs`、`enable_websocket`、`advanced_match_enabled`，四层代理的 `timeout`、`checks`、`retries`、`retry_timeout`、`sni`、`ref_node_id`，节点的 `ssh_port`、`status_detail` 等 Excel 报表中不存在的字段

#### Scenario: 敏感字段默认排除
- **WHEN** 以默认参数（`include_secrets=false`）导出
- **THEN** 备份中 SSL 证书的 `cert`、`key`、`sign_cert`、`sign_key`、`client_ca` 为 null，集群 `admin_key` 不出现于文件任何位置

#### Scenario: 显式包含敏感字段
- **WHEN** 以 `include_secrets=true` 导出
- **THEN** 上述证书字段写入备份明文内容

#### Scenario: 静态资源文件缺失时降级
- **WHEN** `include_files=true` 但某静态资源文件在磁盘上已不存在
- **THEN** 该资源仅导出元数据，导出不中断，且响应警告清单中列出该资源

#### Scenario: 备份文件自带元信息
- **WHEN** 备份文件生成
- **THEN** 文件含 `format` 标识、递增 `version`、生成时间、源集群标识，且响应提供 `data` 内容的 SHA-256 校验和

### Requirement: 单一模式导入重建（新 ID + 映射重建外键）

系统 SHALL 仅支持一种导入模式：创建新集群，忽略备份中的平台自增 ID（由数据库分配），并按名称（节点按 ip+service_port）映射重建外键。

#### Scenario: 导入生成新集群
- **WHEN** 管理员上传备份并指定新集群名
- **THEN** 系统创建新集群，所有行获得数据库新分配的 ID，`cluster_id` 指向新集群

#### Scenario: 外键映射重建
- **WHEN** 导入执行
- **THEN** 路由的 `upstream_id`、静态资源的 `route_id`、证书的 `ca_cert_id`、四层代理的 `ref_node_id` 均通过插入时捕获的旧 ID → 新 ID 映射指向新分配的 ID；`route.plugin_config_ids` 中引用的插件组 `edge_uuid` 保持原值且引用有效

#### Scenario: 节点运行态重置
- **WHEN** 导入包含节点数据
- **THEN** 所有节点 `status` 重置为离线，不继承备份中的在线/离线状态

#### Scenario: 字段修正
- **WHEN** 导入完成
- **THEN** `creator_id` 为当前操作者，各实体 `current_version` 为空，集群状态为启用

#### Scenario: 目标集群名冲突时整体失败
- **WHEN** 指定的新集群名已存在于系统中
- **THEN** 导入整体回滚，返回 400 并说明冲突项，不产生部分数据

#### Scenario: 备份内重名实体不阻断导入
- **WHEN** 备份数据中存在同名实体（源集群历史数据常见）
- **THEN** 导入照常完成并忠实保留重名（外键按 ID 映射，与名称无关）

### Requirement: 悬空引用自动清理与警告清单

系统 SHALL 对源数据中无法解析的引用自动清理（剔除/置空）而非拒绝导入，并将全部降级事项汇总为警告清单与需补齐清单随导入结果返回。

#### Scenario: 插件组悬空引用被清理
- **WHEN** 备份中某路由的 `plugin_config_ids` 含有备份内不存在的插件组 edge_uuid（源库历史脏数据）
- **THEN** 该失效项从数组中移除，路由照常导入，该项计入警告清单

#### Scenario: 节点引用无法解析时置空
- **WHEN** 某四层代理的 `ref_node_id` 无法通过 ip+service_port 解析到备份内节点
- **THEN** 该字段置空，代理照常导入，计入警告清单

#### Scenario: 内容缺失进入需补齐清单
- **WHEN** 导入的备份中存在无内容的证书（include_secrets=false 导出）或无文件的静态资源
- **THEN** 它们照常导入元数据，并在"需补齐清单"中提示用户重新生成证书 / 重新上传文件

#### Scenario: 导入后未发布提示
- **WHEN** 导入成功完成
- **THEN** 结果明确提示新集群处于未发布状态，需手动发布才生效到 Edge；系统不自动发布

### Requirement: 导入前置硬校验

系统 SHALL 在导入前完成格式与结构校验，任何硬校验失败都不产生部分导入。

#### Scenario: 格式版本不符
- **WHEN** 上传文件的 `format` 标识不匹配或 `version` 高于系统支持版本
- **THEN** 返回 400 并说明版本问题

#### Scenario: 校验和不匹配
- **WHEN** 文件内容校验和与记录值不一致（文件损坏或被篡改）
- **THEN** 返回 400 并拒绝导入

#### Scenario: 结构缺失
- **WHEN** 备份缺少必备数据键或行内必备字段非法
- **THEN** 返回 400 并列出全部结构问题

### Requirement: 权限控制

集群备份与导入操作 SHALL 仅对管理员开放。

#### Scenario: 非管理员访问被拒
- **WHEN** 非管理员用户调用备份下载或导入接口
- **THEN** 返回 403

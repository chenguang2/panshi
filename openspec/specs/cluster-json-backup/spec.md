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

系统 SHALL 仅支持一种导入模式：创建新集群，忽略备份中的平台自增 ID（由数据库分配），并按名称（节点按 ip+service_port）映射重建外键。导入 SHALL 对备份中的 ISO 时间字符串按目标模型列类型矫正（DateTime/Date 列解析回原生类型），MUST NOT 将字符串原样绑定时间列；导入 MUST NOT 迁移源集群的运行态发布状态（`last_publish_ok`/`last_publish_detail`/`last_published_at`）；集群业务属性（含 `region_code` 区域绑定）SHALL 随导入保留；导入失败 SHALL 回滚全部数据库变更且不留任何已落盘文件（失败即无副作用）。

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

#### Scenario: 含已发布静态资源的备份可完整导入（回归 P0）
- **GIVEN** 源集群存在至少一个 `last_published_at` 非空的静态资源（备份中为 ISO 字符串）
- **WHEN** 导入该备份
- **THEN** 导入 SHALL 成功创建新集群，不再出现 `SQLite DateTime type only accepts Python datetime` 错误
- **AND** 时间类列的值 SHALL 为原生 datetime/date 类型或 NULL，MUST NOT 为字符串

#### Scenario: 运行态发布状态不迁移
- **WHEN** 备份中静态资源携带 `last_publish_ok=true`、`last_published_at`、`last_publish_detail`
- **THEN** 导入后的对应行三列 SHALL 全为 NULL/空（新集群未发布，不继承源集群发布痕迹）

#### Scenario: 区域绑定保留
- **WHEN** 备份源集群 `region_code` 非空
- **THEN** 导入出的新集群 `region_code` SHALL 与源值一致
- **AND** 新集群仍处于未发布状态（`status=1`），区域绑定变化后的网关白名单下发引导照常适用

#### Scenario: 失败即无副作用
- **WHEN** 导入在中途失败（校验错误、数据错误或写库异常）导致事务回滚
- **THEN** 磁盘上 SHALL NOT 残留本次导入写入的静态资源 zip 文件（含部分写入）
- **AND** 数据库 SHALL 无任何新建行

#### Scenario: 时间字段通用矫正（按类修）
- **WHEN** 备份条目包含目标模型定义为 DateTime/Date 列的字段且值为字符串
- **THEN** 导入 SHALL 按 ISO 格式解析为原生类型后写入；解析失败或空值 SHALL 置 None 并继续（不中断导入）
- **AND** 该矫正 SHALL 基于模型元数据通用实现，未来新增时间列无需修改导入逻辑即被覆盖

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

系统 SHALL 在导入前完成格式与结构校验，任何硬校验失败都不产生部分导入。条目级未知字段 SHALL 按 ORM 模型白名单过滤丢弃（前向兼容：新版本平台产出的备份含本版本不认识的字段时，按未知字段过滤而非结构错误回滚），字段白名单以模型属性为准（含 `SslCertificate.private_key`→`key` 列名错位兼容）。

#### Scenario: 格式版本不符
- **WHEN** 上传文件的 `format` 标识不匹配或 `version` 高于系统支持版本
- **THEN** 返回 400 并说明版本问题

#### Scenario: 校验和不匹配
- **WHEN** 文件内容校验和与记录值不一致（文件损坏或被篡改）
- **THEN** 返回 400 并拒绝导入

#### Scenario: 结构缺失
- **WHEN** 备份缺少必备数据键或行内必备字段非法
- **THEN** 返回 400 并列出全部结构问题

#### Scenario: 条目级未知字段前向兼容过滤
- **WHEN** 导入文件的实体条目含本版本模型不认识的字段
- **THEN** 未知字段 SHALL 按模型白名单过滤丢弃，导入正常完成，MUST NOT 触发 TypeError 级整体回滚
- **AND** 条目级过滤不豁免结构级校验：缺节点、重复 route_id 等结构问题仍整单拒绝（BAK-08）

### Requirement: 权限控制

集群备份与导入操作 SHALL 仅对管理员开放。

#### Scenario: 非管理员访问被拒
- **WHEN** 非管理员用户调用备份下载或导入接口
- **THEN** 返回 403

### Requirement: 导入完成后的前端闭环

备份导入成功后，前端 SHALL 打通「结果感知 → 列表刷新 → 前往新集群」最后一公里。

#### Scenario: 导入成功后列表刷新与去向引导
- **WHEN** 导入成功完成
- **THEN** 结果区 SHALL 提供按钮「前往新集群」，携带新 `cluster_id` 跳转统一管理页深链（复用既有 `editClusterId` query）
- **AND** 关闭弹窗时父页面 SHALL 刷新集群列表（监听 `imported` 事件），使新集群即时可见，MUST NOT 需要用户手动刷新

### Requirement: 导入错误可读

导入失败时系统 SHALL 返回结构化中文错误（`detail.errors` 数组），说明失败原因与建议动作；MUST NOT 向前端透出未加工的 500「服务器内部错误」。

#### Scenario: 数据类失败返回可读原因
- **WHEN** 导入因数据问题失败（如时间格式非法且不可回退、引用损坏）
- **THEN** 响应 SHALL 为 400，`detail.errors` 至少包含一条中文原因，定位到出错的资源类型/名称

#### Scenario: 前端呈现
- **WHEN** 导入失败
- **THEN** 弹窗错误区 SHALL 逐条展示原因（现有 `errorLines` 渲染路径，无前端结构改动）

### Requirement: 备份导入弹窗术语与表单体验

集群备份导入的用户界面 SHALL 如实表达 clone-only 单向语义（约定 #17）：入口、标题与主按钮 SHALL 使用「导入（新集群）」表述而非「恢复」；新集群名称 SHALL 在提交前按后端同款规则（小写字母/数字/中划线，中划线不得首尾）前置校验并在表单内联展示规则；文件选择 SHALL 使用与全站一致的中文控件呈现已选文件；导入失败 SHALL 在弹窗错误区逐条呈现后端原因并附建议动作。

#### Scenario: 术语诚实化
- **WHEN** 用户查看统一管理/集群管理页顶栏与导入弹窗
- **THEN** 入口按钮、弹窗标题、主按钮 SHALL 表达「从备份导入（将创建新集群）」语义，MUST NOT 使用「恢复」一词描述本动作
- **AND** 版本管理语境的「恢复（回滚）」术语 SHALL 不受影响（两语境不再撞词）

#### Scenario: 名称规则前置校验
- **GIVEN** 用户在导入弹窗输入新集群名称
- **WHEN** 名称包含大写字母、下划线或首尾中划线等非法字符
- **THEN** 表单 SHALL 即时提示规则与错误原因，主按钮 SHALL 禁用或提交被拦截，MUST NOT 依赖后端 400 才暴露规则

#### Scenario: 中文文件选择控件
- **WHEN** 导入弹窗渲染文件选择
- **THEN** SHALL 呈现中文按钮/拖放区与已选文件名，MUST NOT 裸露浏览器原生英文控件

#### Scenario: 失败原因与建议动作
- **WHEN** 导入失败（校验错误 / 数据错误 / 服务器错误）
- **THEN** 弹窗错误区 SHALL 逐条展示后端 `detail.errors` 中文原因，并附至少一条建议动作（如检查备份文件、更正名称后重试）

### Requirement: 备份下载弹窗内容摘要与双导出语义说明

备份下载弹窗 SHALL 展示内容摘要行（将导出的资源构成，数据取自既有集群统计字段），并 SHALL 说明「JSON 备份（机器可恢复）」与「Excel 导出（人工阅读报表）」的用途差异。

#### Scenario: 下载摘要行
- **WHEN** 用户打开某集群的备份下载弹窗
- **THEN** 弹窗 SHALL 展示该集群节点/路由/上游/证书/静态资源等计数摘要
- **AND** 勾选「包含静态资源文件」时 SHALL 提示体积可能较大

#### Scenario: 双导出语义可区分
- **WHEN** 用户查看备份下载弹窗说明
- **THEN** SHALL 可得知 JSON 备份用于跨环境恢复重建、Excel 导出仅为人读报表不含可导入结构

### Requirement: 导入完整性校验和接线（同会话自动）

系统 SHALL 接线备份文件完整性校验：同会话内经平台下载的备份文件再次导入时，前端 SHALL 自动附带下载响应中的校验和（`X-Backup-Checksum`）作为 `expected_checksum`；无会话内校验和记录的文件按现行为（不校验）放行。

#### Scenario: 同会话下载后导入自动校验
- **GIVEN** 用户在本会话内经平台下载了某集群备份
- **WHEN** 用户选择该文件执行导入
- **THEN** 请求 SHALL 自动携带该文件对应的 `expected_checksum`
- **AND** 文件内容被意外修改时 SHALL 得到明确的「校验和不符」错误

#### Scenario: 跨会话/外来文件降级
- **WHEN** 导入的文件无会话内校验和记录
- **THEN** 导入 SHALL 正常进行（不校验），行为与现状一致

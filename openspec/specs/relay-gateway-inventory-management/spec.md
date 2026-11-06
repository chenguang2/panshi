# relay-gateway-inventory-management Specification

## Purpose
TBD - created by archiving change relay-gateway-inventory-ui. Update Purpose after archive.

## Requirements

### Requirement: 网关 SSH 凭据入库为唯一权威源

中继网关的 SSH 连接凭据（用户/口令/端口/python 解释器/ssh 公共参数）SHALL 存储于 `relay_gateways` 表并作为清单渲染的唯一权威源；`inventory/gateways` 文件 SHALL 为派生成品（渲染写盘），不再作为手工维护的事实源。

#### Scenario: 保存网关后清单同步更新

* WHEN 运维在中继区域管理页创建或编辑网关的 SSH 连接字段并保存
* THEN 系统按 DB 全量重渲染 `inventory/gateways`（按局分组 `gateways_<code>`）
* AND 写盘前将旧文件备份为 `gateways.bak.<timestamp>`，写盘后文件权限为 0600
* AND 渲染失败时网关保存仍成功，列表 `inventory_group_missing` 标志置 true

#### Scenario: 删除网关后分组收敛

* WHEN 删除一个网关注册
* THEN 渲染结果不再包含该局的 `gateways_<code>` 分组
* AND 该局路由快照经 `refresh_routing()` 立即失效重建（对齐 AGENTS #50）

### Requirement: 存量手工文件自动迁移

系统 SHALL 在启动时幂等迁移现存手工清单：备份原文件、按 IP+用户回填 DB、渲染带「由系统生成」头标注的新文件。

#### Scenario: 首启迁移

* WHEN 后端启动且文件头无生成标注
* THEN 原文件备份为 `gateways.bak.<timestamp>`
* AND 文件中每个主机的凭据按 IP+ansible_user 匹配注册网关回填 DB
* AND 渲染写盘新文件（头标注「由系统生成，勿手改」）
* AND 匹配不到网关的文件分组原样保留并在列表 API 暴露孤儿计数

#### Scenario: 幂等

* WHEN 文件头已有生成标注
* THEN 迁移函数不做任何写操作

### Requirement: 凭据展示与获取口径

网关口令 SHALL NOT 出现在列表响应中；编辑与单查场景按需获取并留审计。

#### Scenario: 列表不回传口令

* WHEN 前端拉取网关列表
* THEN 响应含 ssh_user/ssh_port/ssh_common_args/ansible_python_interpreter
* THEN 响应不含 ssh_password

#### Scenario: 按需单查口令

* WHEN 前端请求 `GET /relay/gateways/{id}/credential`
* THEN 返回该网关 ssh_password
* AND 该请求写操作审计（resource=relay_gateway, action=view_credential）

### Requirement: 临时注入机制兼容

relay_sshd 的行级临时凭据注入/还原机制 SHALL 保持不变且与整组重写并发安全。

#### Scenario: 注入期间 CRUD 重写不破坏还原

* WHEN sshd-setup 流已注入 `# panshi-injected` 行期间发生网关 CRUD 整组重写
* THEN 渲染结果不含临时行（来自 DB）
* AND 注入流的 finally 还原对不存在的临时行幂等跳过
* AND 启动清扫 `sweep_injected_creds` 语义不变

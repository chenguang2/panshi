# Proposal: relay-gateway-inventory-ui（中继网关清单界面化管理）

## Why

中继区域管理的运行依赖 `backend/ansible/inventory/gateways`（YAML 清单，按局分组 `gateways_<code>`，承载网关机 SSH 连接凭据），但该文件**只能手工编辑**：

1. **凭据唯一落点在文件**——`relay_gateways` 表没有任何凭据字段（code/name/http_base_url/ssh_jump/openresty_prefix/status），SSH 口令只存在于文件行内；换密码 = 登服务器手改文件，改错即装机/下发全断（relay_init/relay_push 均以此为 inventory，文件缺失直接报「网关清单不存在」）。
2. **双事实源漂移**——DB 管路由语义（ssh_jump/http_base_url），文件管连接凭据；界面改了「SSH 跳板」字段后文件里的 ansible_user/口令不会跟着变，排障时极易误判。
3. **审计与备份缺口**——手工改文件不落审计、无自动备份（对照：Ansible 主机清单模块有 parse/render + `host.bak.*` 备份链）。
4. **历史事故印证**——该文件曾因手工管理被误提交 git（凭据泄露，2026-11-05 已出库 + gitignore）；手工管理是事故土壤。

## What Changes

- `relay_gateways` 新增 SSH 连接凭据字段（用户/口令/端口/python 解释器/ssh 公共参数），**中继区域管理页**的网关表单/表格直接编辑。
- `inventory/gateways` 文件改为**派生成品**：CRUD 保存时由 DB 按局分组整组渲染写盘（复用 inventory_service 的 YAML 渲染 + 备份范式），文件头标注「由系统生成，勿手改」。
- 一次性迁移：现存手工文件内容自动导入 DB（按 IP/用户匹配已注册网关），导入前自动备份原文件。
- relay_sshd 临时凭据注入/还原机制**不变**（M23 行级 `# panshi-injected` + 0600 收权），但基础行来源从「文件既有内容」变为「DB 渲染」。

## Capabilities

### New: relay-gateway-inventory-management
网关 SSH 连接凭据的界面化管理：表单编辑 → DB 存储 → 清单渲染写盘 → 备份与审计闭环。

### Modified: relay-gateway-management（如已有该 spec 则并入；否则随本 change 一并创建）
网关注册模型扩展 SSH 连接字段；列表 API 暴露清单健康标志（已有 inventory_group_missing）。

## Impact

- 代码：`relay_gateways` 模型/迁移（COLUMN_MIGRATIONS）、`relay.py` CRUD schema、新 `gateways_inventory_service`（渲染/备份/导入）、`relay.py` 列表 API 补凭据脱敏策略、中继区域管理前端表单/表格。
- 不变：relay_init/push/sshd 的 ansible 执行链（仍读同一文件路径）；路由快照机制（#50）；#10 明文约定语义。
- 风险点：凭据入 DB 后的展示/脱敏口径（决策点 2）；手工文件被覆盖的运维习惯迁移（决策点 4）。

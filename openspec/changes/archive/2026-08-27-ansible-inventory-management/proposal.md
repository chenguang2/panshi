## Why

Ansible inventory 文件（`backend/ansible/inventory/host`，YAML 格式）是平台多项运维功能的运行时依赖：节点任务的 SSH 凭据解析（`get_ssh_password`/`get_ssh_user`）、`is_node_in_inventory` 检查、端口与凭据的临时注入/恢复。目前修改它必须登录服务器手工编辑，存在三个痛点：① 改动不便；② 手写 YAML 无校验，写坏会导致节点任务等功能瘫痪且难以察觉；③ 出错无备份可回退。

将 inventory 的查看与编辑搬到平台界面上，配以解析校验、自动备份、原子写回三重护栏，消除上述风险。

经讨论确认采用**双模式混合方案**：默认结构化表格视图（日常增删改），可切换 Monaco 源码视图（保留手工微调/注释能力）；SSH 密码在界面完全明文展示（仅管理员可用本功能）；入口放在工具箱下新页面，受 features.yaml 开关控制。

## What Changes

- 新增后端服务：inventory 解析（parse）/ 渲染（render）/ 校验（validate），以及 GET / PUT API
  - PUT 同时接受两种载荷：`raw_text`（源码模式，保留注释）或 `hosts + vars`（表格模式，由服务端渲染）
  - 保存护栏：YAML 解析校验 → 结构校验（必须含 `all.children.edge_cluster.hosts`）→ 自动备份（保留最近 10 份）→ 原子写回
- 工具箱新增「Ansible 主机清单」页面：
  - 表格视图：主机列表（IP、SSH 用户、SSH 密码——明文展示）、增删改、组级默认凭据编辑
  - 源码视图：Monaco YAML 编辑器，语法错误阻止保存
  - 双向切换时通过后端 render/parse 接口转换，前端零 YAML 依赖
- `features.yaml` 新增开关 `ansible_inventory`（默认 true），关闭时菜单隐藏、API 返回 404
- 节点联动提示：展示 inventory 中存在而平台节点表未录入的 IP，引导去节点管理添加

## Capabilities

### New Capabilities
- `ansible-inventory-management`: Ansible inventory 主机清单的界面化查看与编辑（双模式、保存护栏、自动备份、功能开关）

### Modified Capabilities
<!-- 无 -->

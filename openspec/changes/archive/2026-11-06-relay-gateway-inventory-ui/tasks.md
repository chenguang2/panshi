# Tasks: relay-gateway-inventory-ui

## 1. 后端模型与迁移

- [x] 1.1 `RelayGateway` 模型增列：ssh_user/ssh_password/ssh_port/ansible_python_interpreter/ssh_common_args；COLUMN_MIGRATIONS 注册（#118，PG 冒烟强制 #103）
- [x] 1.2 新建 `gateways_inventory_service`：YAML 解析（复用 inventory_service 范式）、整组渲染（按局分组）、原子写 + 0600、备份 `gateways.bak.<ts>`（保留最近 10 份）
- [x] 1.3 迁移函数 `migrate_gateways_file()`：头标注检测 → 备份 → IP+用户回填 → 渲染写盘 → 孤儿分组保留并计数；lifespan 早期接入

## 2. API 层

- [x] 2.1 RelayGatewayCreate/Update/Out schema 扩展（Out 不含 ssh_password）
- [x] 2.2 CRUD 保存后调用渲染写盘 + `refresh_routing()`（删除分支必做，#50）
- [x] 2.3 `GET /relay/gateways/{id}/credential` 单查口令（页面权限 + 审计 view_credential）；安全守卫采样补录（#19）
- [x] 2.4 孤儿分组暴露：`GET /relay/gateways/inventory-status`（generated + orphan_groups；列表行标志 inventory_group_missing 现存沿用）——设计微调：list[Out] 响应无全局计数位置，独立端点更干净
- [x] 2.5 注入并发回归：CRUD 重写后 relay_sshd finally 还原幂等 + `sweep_injected_creds` 语义不变（钉用例）

## 3. 前端

- [x] 3.1 网关表单「SSH 连接」分组（用户/密码/端口/解释器/公共参数），密码框可切换可见
- [x] 3.2 表格补「SSH 用户」列 + `inventory_group_missing` 行「清单缺失」徽标（点击开配置预览抽屉）
- [x] 3.3 编辑弹窗按需拉取口令（单查端点）；组件测试（表单校验/徽标/口令按需加载）

## 4. 测试收口

- [x] 4.1 渲染器单测（分组/多网关/孤儿保留/头标注/备份轮换/0600）
- [x] 4.2 迁移幂等两态单测 + CRUD→写盘集成测试（fake 文件系统 tmp_path）
- [x] 4.3 PG 方言冒烟（#103，新增列）；`pytest -k relay` 域回归（#51④）
- [x] 4.4 前端 `npx vitest run --no-file-parallelism` 全量（#208）；后端全量收口

## 5. 文档与验证

- [x] 5.1 手册 28 章补「SSH 连接」字段表 + 迁移说明 + 截图重拍（28-04 网关表单组）
- [x] 5.2 AGENTS.md 约定条目更新（gateways 文件=派生成品、迁移机制、单查端点）
- [x] 5.3 真链路验收：改某网关口令字段 → 文件生效（init 流可达）→ 备份存在 → 审计两行（更新+单查）；按 #51② 在用户实际操作页面截图确认
- [x] 5.4 openspec validate --all 收口 + 归档合并（#53：MODIFIED/ADDED 场景标题为稳定标识符）

## 1. 模型与迁移

- [x] 1.1 新增 `NodeAutostart` 模型（`ps_node_autostart` 表，字段 id/node_id唯一/cluster_id/status/action/command/rc/updated_at）
- [x] 1.2 确认 `Base.metadata.create_all` 自动创建新表（新表无需 alter 迁移）

## 2. 命令脱敏

- [x] 2.1 实现 `sanitize_command_for_store(command)`：把 `sshpass -p (\S+)` 的密码替换为 `*****`
- [x] 2.2 写单测：脱敏函数正确替换密码、不影响无密码命令

## 3. 后端写库 + 读库接口

- [x] 3.1 `edge_autostart.py` 操作成功后 upsert `NodeAutostart` 记录（status/action/脱敏 command/rc/updated_at）
- [x] 3.2 新增 `GET /nodes/autostart/records`：返回所有节点自启动记录（读库）
- [x] 3.3 前端"刷新"复用现有 status 接口逐个查询并写库同步（可选，已覆盖）

## 4. 前端读库展示

- [x] 4.1 `EdgeAutostart.vue` 进入页面时调用读库接口加载状态（不再全部为 null）
- [x] 4.2 操作成功后刷新记录
- [x] 4.3 "刷新"按钮重新查询并同步状态

## 5. 测试与验证

- [x] 5.1 后端单测：`NodeAutostart` 模型 CRUD
- [x] 5.2 后端单测：操作后 upsert 记录、命令脱敏
- [x] 5.3 后端单测：读库接口返回记录
- [x] 5.4 真机验证：启用/禁用/查询后记录状态，刷新页面仍显示
- [x] 5.5 运行完整后端套件确认无回归

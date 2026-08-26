# Tasks

## 1. 后端：inventory 服务（TDD）

- [x] 1.1 `parse_inventory(raw_text)` → 结构化（hosts 条目完整字段字典、完整 vars、unknown_keys），YAML 或结构错误返回带行号的错误列表
- [x] 1.2 `render_inventory(hosts, vars)` → YAML 文本（稳定排序：IP 按数值序；回写全部已知与未知键，全保真）
- [x] 1.3 `validate_structure(doc, platform_node_ips)` → 结构校验 + 删除保护（缺失平台节点 IP → 400 列表）
- [x] 1.4 备份与原子写回：`save_inventory(new_text)` → 复用 `_inventory_lock`、检查运行中任务（409）、备份 `host.bak.<ts>`（保留 10 份）+ tmp `os.replace`；文件缺失时自动创建
- [x] 1.5 服务层单元测试：解析现有真实文件样例、渲染往返一致（parse∘render 幂等）、各类非法输入、备份轮转

## 2. 后端：API + 功能开关（TDD）

- [x] 2.1 `GET /ansible/inventory`（raw_text + hosts/vars + unknown_keys + unmanaged_ips，管理员）
- [x] 2.2 `PUT /ansible/inventory`（raw_text 或 hosts+vars 二选一载荷；校验失败 400 带行号错误）
- [x] 2.3 `POST /ansible/inventory/render` 与 `POST /ansible/inventory/parse`（双模式切换转换）
- [x] 2.4 API 测试：管理员 200/403/400 路径、保存后文件内容断言、备份文件生成
- [x] 2.5 features.yaml 三件套：`ansible_inventory: true` + KNOWN_FEATURES + 路由挂 feature_routers

## 3. 前端：工具箱页面

前置：确认 `backend/ansible/.gitignore` 覆盖 `host.bak.*`（不足则补一行）

- [x] 3.1 路由 `/ansible-inventory` + AppSidebar「Ansible 主机清单」菜单项（feature: 'ansible_inventory'，工具箱分组）
- [x] 3.2 页面骨架：视图切换（表格 ⇄ 源码）、保存按钮、未保存离开提示
- [x] 3.3 表格视图：主机增删改行内编辑、组级默认凭据表单、未知字段提示、unmanaged_ips 提醒条
- [x] 3.4 源码视图：集成 MonacoEditor（yaml），切换时调 render/parse 接口转换草稿，解析失败阻止切换并标错
- [x] 3.5 保存流程：按视图提交对应载荷、成功提示"已生效"、失败展示行号错误

## 4. 验证

- [ ] 4.1 端到端：界面新增一台测试主机 → 服务器上确认文件更新 → 触发一次节点任务验证凭据解析正常
- [x] 4.2 端到端：源码模式制造语法错误 → 保存被拦截且文件未变 → 备份目录出现 .bak 文件
- [ ] 4.3 关闭 ansible_inventory 开关重启 → 菜单消失、API 404；恢复开关
- [x] 4.4 `uv run pytest` 全量回归；前端 vitest + vue-tsc 通过

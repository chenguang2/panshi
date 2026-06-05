## 1. 后端：扩展全局节点 API

- [x] 1.1 扩展 `backend/app/api/v1/nodes.py`：将 `GET /nodes` 改为完整列表 API，支持 `page`、`page_size`、`search`（搜索 IP 和名称）、`cluster_id`、`status` 参数，增加 `get_current_user` 认证依赖，非管理员通过 `UserCluster` 过滤权限，返回包含 `cluster_name` 的节点列表，响应格式 `{total, page, page_size, items: [NodeResponse]}`
- [x] 1.2 在 `backend/app/schemas/cluster.py` 的 `NodeResponse` 中增加可选 `cluster_name: str` 字段
- [x] 1.3 `GET /nodes` 原有 `?ip=&management_port=` 查找功能保持不变（向后兼容）

## 2. 前端：新增节点管理页面

- [x] 2.1 创建 `frontend/src/api/nodes.ts`：封装节点 API 调用（列表查询、创建、更新、删除、启动、停止、状态查询）
- [x] 2.2 创建 `frontend/src/views/NodeList.vue`：实现全局节点管理页面

### 2.2 子任务 - 页面结构
- [x] 2.2.1 PageHeader + 筛选栏（集群下拉框 + 搜索框 + 状态筛选下拉框 + 添加节点按钮）
- [x] 2.2.2 `<a-table>` 节点列表（列：选择框、IP、所属集群、服务端口、管理端口、Edge路径、状态、Edge版本、操作），分页
- [x] 2.2.3 操作列：详情、启动、停止、状态查询 主按钮 + 更多菜单（编辑、删除、数据库对比）
- [x] 2.2.4 详情 Modal：展示节点属性（IP、集群、端口、路径、状态、创建时间）+ 所在集群统计卡片（路由数、上游数、插件数、全局规则数）
- [x] 2.2.5 添加/编辑节点 Modal 表单（含"所属集群"下拉框，编辑时不可修改集群）
- [x] 2.2.6 删除确认弹窗
- [x] 2.2.7 执行结果 Drawer（复用现有 NodeExecutionResultDrawer.vue）

## 3. 前端：路由和导航

- [x] 3.1 `frontend/src/router/index.ts`：添加 `/nodes` 路由，关联 NodeList.vue
- [x] 3.2 `frontend/src/components/AppSidebar.vue`：核心功能区域添加"节点管理"导航项

## 4. 验证

- [x] 4.1 `lsp_diagnostics` 检查所有新增/修改文件无错误（Python 侧仅 missing imports 系虚拟环境路径问题，非代码错误；Vue 侧 LSP 未安装；前端 TypeScript 构建通过无错误）
- [x] 4.2 前端构建通过（`npm run build` 成功）

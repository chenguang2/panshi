## 1. 后端数据模型

- [x] 1.1 创建 `app/models/edge_import.py`，定义 `ImportLog` 模型（`ps_import_log` 表）
- [x] 1.2 在 `app/models/__init__.py` 注册新模型
- [x] 1.3 创建 `app/schemas/edge_import.py`，定义请求/响应 Pydantic 模型（连接测试、预览、导入执行）

## 2. 后端导入核心服务

- [x] 2.1 创建 `app/services/edge_import_service.py`，实现 `EdgeImportService` 类
- [x] 2.2 实现 `test_connection()`：调用 Edge 节点 Admin API 验证连通性，返回节点信息
- [x] 2.3 实现 `fetch_edge_data()`：从 Edge 节点拉取 routes、upstreams、plugin_configs、global_rules 原始数据
- [x] 2.4 实现插件分类逻辑：将插件按 BUILTIN_PLUGINS 分为"已知插件"和"未知插件"
- [x] 2.5 实现 `convert_upstream()`：PANSHI upstream → 磐石 `ps_upstream` + `ps_upstream_target` 格式转换
- [x] 2.6 实现 `convert_route()`：PANSHI route → 磐石 `ps_route` + `ps_route_plugin` 格式转换，含 `upstream_id` 关联重建
- [x] 2.7 实现 `convert_plugin_config()`：PANSHI plugin_config → 磐石 `ps_plugin_config` 格式转换
- [x] 2.8 实现 `convert_global_rule()`：PANSHI global_rule → 磐石 `ps_global_rule` 格式转换
- [x] 2.9 实现冲突检测逻辑：上游名称冲突、路由路径+方法冲突、Edge UUID 冲突

## 3. 后端导入流程与 API

- [x] 3.1 实现 `preview_import()`：拉取数据 → 转换 → 冲突检测 → 返回预览结果
- [x] 3.2 实现 `execute_import()`：事务性写入上游 → 路由 → 插件配置 → 节点注册 → 导入日志
- [x] 3.3 实现导入失败回滚逻辑（事务包裹）
- [x] 3.4 创建 `app/api/v1/edge_import.py`，注册路由：`POST /test-connection`、`GET /preview`、`POST /execute`
- [x] 3.5 在 `app/api/v1/__init__.py` 注册新路由

## 4. 前端页面

- [x] 4.1 创建 `frontend/src/api/edgeImport.ts`，封装三个 API 调用函数
- [x] 4.2 创建 `frontend/src/views/EdgeImport.vue`，实现三步向导页面
- [x] 4.3 实现步骤 1：集群选择器组件
- [x] 4.4 实现步骤 2：节点连接表单（IP、端口、API Key、Edge 路径）+ 测试连接按钮
- [x] 4.5 实现步骤 3：数据预览列表 + 可勾选项 + 冲突警告展示 + 确认导入按钮
- [x] 4.6 实现导入结果展示和导入日志查看入口

## 5. 路由与菜单

- [x] 5.1 在 `frontend/src/router/index.ts` 添加 `/edge-import` 路由
- [x] 5.2 在导航菜单中添加"Edge 数据导入"菜单项

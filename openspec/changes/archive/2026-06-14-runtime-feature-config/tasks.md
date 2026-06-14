## 1. Backend: 特性配置基础设施

- [x] 1.1 创建 `backend/app/core/features.py` — `load_features()`, `get_features()`, `feature_enabled()`, `get_enabled_plugins()` 全局单例
- [x] 1.2 创建 `backend/app/api/v1/system.py` — `GET /api/v1/system/features` 端点，返回 features 和 enabled_plugins
- [x] 1.3 在 `backend/app/main.py` 中引入 `load_features()`，在应用启动时加载配置
- [x] 1.4 在 `backend/app/main.py` 中注册 `system_router`（始终注册，不需要认证）

## 2. Backend: 安装路由拆分

- [x] 2.1 创建 `backend/app/api/v1/cluster_install.py` — 将 `install-openresty`、`install-edge`、`cancel-install` 端点从 `cluster_nodes.py` 移至此处
- [x] 2.2 在该文件中导出两个独立 router：`install_openresty_router`（含 install-openresty + cancel-install）和 `install_edge_router`（含 install-edge）
- [x] 2.3 从 `cluster_nodes.py` 中删除上述三个端点及相关辅助函数（`_install_openresty_stream`, `_install_proc_registry` 等）
- [x] 2.4 确保 `cluster_install.py` 导入共享的 `_ansible_service` 和 `_verify_node`
- [x] 2.5 验证：拆分后 `cluster_nodes.py` 中的 start/stop/restart/check/statistic/action/diff 端点不受影响

## 3. Backend: 条件性路由注册

- [x] 3.1 修改 `backend/app/main.py` 和 `__init__.py`，将 5 个 feature-gated router 移至 `feature_routers` 字典，在 `main.py` 中条件性 `include_router`
- [x] 3.2 修改 `backend/app/api/v1/plugins.py` 中 `GET /plugins/builtin`，增加 `get_enabled_plugins()` 硬白名单第 1 层过滤
- [x] 3.3 验证：禁用功能后对应路由不在 app.routes 中（7 个测试覆盖禁用+启用+核心三种场景）

## 4. Frontend: 特性 Store

- [x] 4.1 创建 `frontend/src/stores/features.ts` — Pinia store，6 个单元测试通过（含 load、dedup、has、error propagation）
- [x] 4.2 修改前端启动入口 `main.ts` 实现退避重试加载 features + 静态 /login 路由
- [x] 4.3 store 的 `loaded` 标志去重已在实现中覆盖

## 5. Frontend: 用户管理权限选项动态过滤

- [x] 5.1 在 `UserList.vue` 中将 `allPermissions` 从静态数组改为 `computed`，根据特性配置动态过滤
- [x] 5.2 创建 `permissionFeatureMap: Record<string, string>` 映射表（`edge_nodes → edge_client`）
- [x] 5.3-5.4 验证逻辑通过代码审查确认

## 6. Frontend: 条件性路由注册（与 4.2 合并实现）

- [x] 6.1 修改 `frontend/src/router/index.ts`：将特性控制路由移至 `featureRouteMap`，导出 `setupDynamicRoutes()`
- [x] 6.2 `main.ts` 中 `bootstrap()` 在 features 加载完成后调用 `setupDynamicRoutes(router)`
- [x] 6.3 禁用功能的路由不会通过 `addRoute()` 注册，直接访问返回 404

## 7. Frontend: 侧边栏菜单特性过滤

- [x] 7.1 `AppSidebar.vue` 中 `NavItem` 接口增加 `feature?: string` 字段
- [x] 7.2 Edge直连、数据导入、工具箱、插件开关已添加 `feature` 字段
- [x] 7.3 `edgeItems` 和系统管理 `items` 的 `.filter()` 使用 AND 逻辑：先检查 feature 再检查 permission
- [x] 7.4-7.5 Edge 功能分区在内部项全部隐藏时自动消失（原有逻辑 `visible: edgeItems.length > 0`）

## 8. Frontend: 操作按钮条件性显示

- [x] 8.1 `NodeList.vue` 下拉菜单中各自独立使用 `v-if="featuresStore.has('install_openresty')"` 和 `featuresStore.has('install_edge')"`
- [x] 8.2 `ClusterNodes.vue` 安装下拉按钮同样独立控制
- [x] 8.3-8.4 两个功能分别独立控制，核心按钮不受影响

## 9. 构建部署集成

- [x] 9.1 创建 `product/features.yaml` 模板文件（含完整注释的中文模板）
- [x] 9.2 `product/linux/gen-linux.sh` 增加 `features.yaml` 拷贝步骤
- [x] 9.3 `product/mac/gen-mac.sh` 同步修改
- [x] 9.4 创建 `backend/features.yaml`（开发环境默认配置，全启用）
- [x] 9.5 部署包包含 features.yaml，启动时自动读取

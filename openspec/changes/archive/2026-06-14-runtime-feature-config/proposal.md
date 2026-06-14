## Why

当前所有功能（Edge直连、工具箱、安装OpenResty、安装Edge、以及大量插件）在每次部署时全部编译打包。仅靠用户角色权限来"隐藏"功能，代码和 API 端点仍然存在，无法满足不同客户/站点需要不同功能集的需求。

## What Changes

- **新增** `features.yaml` 部署配置文件，定义每份部署实例启用的功能和插件
- **新增** `GET /api/v1/system/features` 后端端点，返回当前部署启用的功能列表
- **修改** 后端 `app/main.py` 启动逻辑，根据 features.yaml 条件性注册 API 路由
- **修改** 前端新增 `useFeaturesStore`，从后端获取启用的功能列表
- **修改** 前端 `AppSidebar.vue` 菜单过滤逻辑，增加 feature 字段过滤
- **修改** 前端 Vue Router 路由注册，条件性注册功能对应的路由
- **拆分** 安装相关端点（install-openresty, install-edge, cancel-install）从 `cluster_nodes.py` 移至独立路由文件 `cluster_install.py`，`install_openresty` 和 `install_edge` 各自独立控制后端端点和前端按钮
- **修改** `GET /plugins/builtin` 增加 features.yaml 插件白名单硬过滤
- **修改** `gen-linux.sh` 拷贝 `features.yaml` 到部署目录，并在启动时读取
- **修改** `NodeList.vue` / `ClusterNodes.vue` 中的安装按钮条件性显示

## Capabilities

### New Capabilities

- `deployment-feature-config`: 部署时特性配置，支持通过 features.yaml 控制每个部署实例的功能集，包括后端路由注册、前端菜单/路由/按钮可见性、插件白名单

### Modified Capabilities

- `node-management`: 节点管理中的安装 OpenResty/Edge 操作变为条件性可用，受 deployment-feature-config 控制
- `edge-client-manual-query`: Edge 直连功能变为条件性可用，受 deployment-feature-config 控制
- `dev-tools`: 工具箱功能变为条件性可用，受 deployment-feature-config 控制
- `edge-data-import`: 数据导入功能变为条件性可用，受 deployment-feature-config 控制
- `plugin-switch-management`: 插件开关功能变为条件性可用，受 deployment-feature-config 控制

## Impact

- **后端**: `app/main.py` 增加特性路由注册逻辑；`cluster_nodes.py` 拆分安装端点；`ansible_service.py` 无变更；新增 `app/api/v1/system.py` 特性端点
- **前端**: 新增 `stores/features.ts`；修改 `router/index.ts` 条件性注册路由；修改 `AppSidebar.vue` 增加 feature 过滤；修改 `NodeList.vue` 和 `ClusterNodes.vue` 条件性显示安装按钮
- **构建部署**: `gen-linux.sh` 拷贝 `features.yaml`；新增 `product/features.yaml` 模板文件
- **插件系统**: `plugins.py` 增加第二层配置白名单过滤
- **数据库**: 无变更（不涉及 schema 变更）

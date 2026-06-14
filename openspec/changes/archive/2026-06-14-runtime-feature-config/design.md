## Context

磐石 Admin 部署到不同客户现场时，需要控制功能集合。当前所有功能（Edge直连、工具箱、安装 OpenResty/Edge、以及大量插件）在每次构建时全部编译打包，仅靠运行时用户角色权限来限制访问，存在以下问题：

- 不需要的 API 端点仍然注册在 FastAPI 中，知道 URL 即可直接调用
- 不需要的插件 schema 仍然在内存中，仅靠 `ps_plugin_enabled` 表控制可见性
- 前端不需要的路由和组件仍然打包在 dist/ 中
- 需要在部署前确定功能集，而不是运行时动态切换

选择方案一（运行时特性配置）作为基础方案。核心思路：一个 `features.yaml` 配置文件 + 后端 `/system/features` 端点 + 前端 `useFeaturesStore`，分层控制。

## Goals / Non-Goals

**Goals:**
- 每份部署可以通过一个配置文件控制启用的功能集
- 禁用功能的 API 端点不在 FastAPI 中注册（404 而非 403）
- 禁用功能的前端路由不注册（直接访问返回 404）
- 禁用功能的菜单项不显示
- 禁用功能的操作按钮（如安装 OpenResty）不出现
- 插件有配置文件级别的白名单硬过滤（双层保险：DB 开关 + 配置文件）
- `gen-linux.sh` 打包时自动包含 `features.yaml`
- 与现有权限系统共存（部署特性控制"功能是否存在"，用户权限控制"谁能用"）

**Non-Goals:**
- 不修改现有权限系统（auth、roles、permissions 逻辑不变）
- 不实现运行时热加载（修改 features.yaml 需要重启）
- 不实现构建时源码裁剪（所有代码仍然部署，只是运行时禁用）
- 不实现多租户特性隔离（一个部署实例一个配置）

## Decisions

### Decision 1: 配置文件格式 YAML

**选择 YAML** 而非 JSON/TOML/环境变量。

- YAML 支持注释，方便部署人员配置时加说明
- Python 原生支持，FastAPI 生态中使用广泛
- 比 JSON 更可读，比 TOML 更通用
- 环境变量不适合复杂结构（插件白名单列表）

### Decision 2: 后端配置加载方式 + 严格校验

在 `app/main.py` 启动时读取 `features.yaml`，存储在全局单例中。**严格的错误处理原则：如果配置文件存在但格式错误，必须显式报错退出，不允许使用默认值静默启动。**

```python
# app/core/features.py
import sys
import yaml
from pathlib import Path

# 已知的所有功能名（用于校验）
KNOWN_FEATURES = {
    'edge_client', 'edge_import', 'tools',
    'install_openresty', 'install_edge', 'plugin_switches',
}

_features: dict | None = None

def validate_features(config: dict) -> None:
    """校验 features.yaml 的结构和值。失败时退出进程。"""
    if not isinstance(config, dict):
        print("错误: features.yaml 必须是顶层字典结构")
        sys.exit(1)
    
    features = config.get("features", {})
    if not isinstance(features, dict):
        print("错误: features.yaml 中 features 必须是映射（字典）")
        sys.exit(1)
    
    # 检查未知功能名
    unknown = [k for k in features if k not in KNOWN_FEATURES]
    if unknown:
        print(f"错误: features.yaml 包含未知功能名 {unknown}，允许的功能名: {sorted(KNOWN_FEATURES)}")
        sys.exit(1)
    
    # 检查值类型
    for k, v in features.items():
        if not isinstance(v, bool):
            print(f"错误: features.yaml 中 '{k}' 的值必须是 true 或 false，当前值: {v}")
            sys.exit(1)
    
    # 检查 enabled_plugins
    enabled_plugins = config.get("enabled_plugins", [])
    if enabled_plugins is None:
        config["enabled_plugins"] = []
    elif not isinstance(enabled_plugins, list):
        print("错误: features.yaml 中 enabled_plugins 必须是列表")
        sys.exit(1)

def load_features(path: str = "features.yaml") -> dict:
    global _features
    p = Path(path)
    if not p.exists():
        _features = {"features": {}, "enabled_plugins": []}  # 默认全部启用
        return _features
    
    try:
        with open(p) as f:
            content = f.read()
        _features = yaml.safe_load(content)
    except yaml.YAMLError as e:
        print(f"错误: features.yaml 格式解析失败: {e}")
        sys.exit(1)
    except IOError as e:
        print(f"错误: 无法读取 features.yaml: {e}")
        sys.exit(1)
    
    validate_features(_features)
    return _features

def get_features() -> dict:
    if _features is None:
        return load_features()
    return _features

def feature_enabled(name: str) -> bool:
    # 注意：name 不在 KNOWN_FEATURES 中不在运行时检查（性能），
    # 但调用方应确保使用已知功能名
    f = get_features().get("features", {})
    return f.get(name, True)  # 未列出的功能默认启用

def get_enabled_plugins() -> list[str]:
    return get_features().get("enabled_plugins", [])
```

### Decision 3: 后端条件性路由注册

**不在每个端点加装饰器判断，而是启动时条件性 `include_router`。**

```python
# app/main.py
from app.core.features import feature_enabled

app = FastAPI()

# ── 始终注册的 ──
app.include_router(auth_router, prefix="/api/v1")
app.include_router(clusters_router, prefix="/api/v1")
app.include_router(cluster_nodes_router, prefix="/api/v1")  # start/stop/status/statistic
app.include_router(dashboard_router, prefix="/api/v1")
# ... 其他核心路由

# ── 条件注册的 ──
if feature_enabled("edge_client"):
    app.include_router(edge_client_router, prefix="/api/v1")
if feature_enabled("edge_import"):
    app.include_router(edge_import_router, prefix="/api/v1")
if feature_enabled("install_openresty"):
    app.include_router(cluster_install_openresty_router, prefix="/api/v1")  # 安装 OpenResty
if feature_enabled("install_edge"):
    app.include_router(cluster_install_edge_router, prefix="/api/v1")  # 安装 Edge
if feature_enabled("plugin_switches"):
    app.include_router(plugin_switches_router, prefix="/api/v1")
if feature_enabled("tools"):
    pass  # 工具箱纯前端，后端无对应路由

# ── 系统端点（始终注册）──
app.include_router(system_router, prefix="/api/v1")  # GET /system/features
```

**需要拆分 `cluster_nodes.py`**：将 install-openresty、install-edge、cancel-install 移至 `cluster_install.py`。在该文件中导出两个独立 router，分别受不同 feature 控制：

```python
# backend/app/api/v1/cluster_install.py

# 共享模块级依赖
_ansible_service = AnsibleRunnerService()
_install_proc_registry: dict[int, asyncio.subprocess.Process] = {}

# Router A: 安装 OpenResty + 取消安装（cancel 只针对 SSH 编译阶段）
install_openresty_router = APIRouter(prefix="/clusters", tags=["clusters-install-openresty"])
# Router B: 安装 Edge（纯 Ansible，无 SSH 进程）
install_edge_router = APIRouter(prefix="/clusters", tags=["clusters-install-edge"])
```

在 `main.py` 中各自独立注册：

```python
if feature_enabled("install_openresty"):
    app.include_router(cluster_install_openresty_router, prefix="/api/v1")
if feature_enabled("install_edge"):
    app.include_router(cluster_install_edge_router, prefix="/api/v1")
```

### Decision 4: 前端特性 Store + 启动时序

新增 Pinia store。关键决策：**不允许 fallback 默认值，必须等待 features 加载成功才能完成应用初始化**。因为"猜测全部启用"会导致前后端不一致（前端路由注册了但后端端点 404）。

**启动时序**：

```
前端启动
  │
  ├─ 静态注册 /login 路由（立即可用，不受 features 影响）
  │
  └─ 加载 featuresStore.load()
       │
       ├─ 成功 → setupRouter() 动态注册所有路由 → app.mount()
       │
       └─ 失败 → 带退避重试，直到成功
                    （此时用户只能看到登录页）
```

**核心原则**：如果无法确定后端开启了哪些功能，就不展示任何可选功能。只有登录页（不需要 feature 信息）可以立即渲染。

**Store 实现**：
```typescript
// frontend/src/stores/features.ts
import { defineStore } from 'pinia'
import api from '@/api'

export const useFeaturesStore = defineStore('features', () => {
  const features = ref<Record<string, boolean>>({})
  const enabledPlugins = ref<string[]>([])
  const loaded = ref(false)

  async function load(): Promise<void> {
    if (loaded.value) return
    // 不做 try/catch 默认值，让错误冒泡到调用方
    const res = await api.get('/system/features')
    features.value = res.data.features || {}
    enabledPlugins.value = res.data.enabled_plugins || []
    loaded.value = true
  }

  function has(feature: string): boolean {
    if (!loaded.value) return false  // 未加载完成时，默认不可用
    return features.value[feature] !== false
  }

  return { features, enabledPlugins, loaded, load, has }
})
```

**启动入口调用方**负责重试逻辑：
```typescript
// frontend/src/main.ts 或 App.vue
async function bootstrap() {
  const router = createRouter({ /* 只包含 /login 路由 */ })
  const app = createApp(App)
  app.use(router)
  app.mount('#app')  // 先挂载，让登录页可用

  const featuresStore = useFeaturesStore()
  while (true) {
    try {
      await featuresStore.load()
      break
    } catch {
      // 退避重试，不 guess 默认值
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  // 加载成功后动态注册剩余路由
  await setupDynamicRoutes(router)
}
```

### Decision 5: 前端条件性路由注册

**不在 `router.beforeEach` 中判断，而是在路由配置阶段动态添加路由。**

```typescript
// frontend/src/router/index.ts
import { useFeaturesStore } from '@/stores/features'

const coreRoutes = [/* 始终注册的路由 */]
const featureRoutes: Record<string, RouteRecordRaw> = {
  edge_client: { path: 'edge-client', ... },
  edge_import: { path: 'edge-import', ... },
  tools: { path: 'tools', ... },
  plugin_switches: { path: 'plugin-switches', ... },
  // 注意：nodes、routes、upstreams 等是核心功能，不受特性控制
}

// 在应用初始化时动态添加
export async function setupRouter() {
  const featuresStore = useFeaturesStore()
  await featuresStore.load()
  
  for (const [feature, route] of Object.entries(featureRoutes)) {
    if (featuresStore.has(feature)) {
      router.addRoute('/', route)
    }
  }
  return router
}
```

### Decision 6: 前端菜单过滤

扩展 `AppSidebar.vue` 的 `NavItem` 接口，增加 `feature?` 字段。在 `navSections` computed 中过滤时同时检查 `permission` 和 `feature`。

```typescript
interface NavItem {
  label: string
  route: string
  icon: string
  permission?: string
  feature?: string  // 新增
}

// 过滤逻辑
.filter(item => {
  const passPermission = !item.permission || authStore.hasPermission(item.permission)
  const passFeature = !item.feature || featuresStore.has(item.feature)
  return passPermission && passFeature
})
```

### Decision 7: 节点安装按钮控制

`NodeList.vue` 和 `ClusterNodes.vue` 中的安装按钮，各自独立检查对应 feature：

```html
<!-- NodeList.vue 下拉菜单 -->
<a-menu-item v-if="featuresStore.has('install_openresty')" @click="handleInstallOpenresty(record)">
  安装 OpenResty
</a-menu-item>
<a-menu-item v-if="featuresStore.has('install_edge')" @click="handleInstallEdge(record)">
  安装 Edge
</a-menu-item>
```

### Decision 8: 插件白名单硬过滤

`GET /plugins/builtin` 端点使用**白名单优先**过滤顺序：先用 features.yaml 白名单做上限限制，再在允许范围内做 DB 开关过滤。

```python
# backend/app/api/v1/plugins.py
from app.core.features import get_enabled_plugins

@router.get("/builtin")
async def list_builtin_plugins(all: bool = False, ...):
    plugins = BUILTIN_PLUGINS
    
    # 第一层：配置文件白名单硬限制（新增）
    # enabled_plugins 是部署级别的上限。即使 all=1，也受此限制。
    enabled_list = get_enabled_plugins()
    if enabled_list:
        plugins = [p for p in plugins if p["name"] in enabled_list]
    
    # 第二层：DB 开关过滤（现有逻辑）
    # 仅在白名单允许的范围内，根据 DB 开关做细粒度控制
    if not all:
        enabled_records = await db.execute(select(PluginEnabled))
        # ... 现有过滤逻辑 ...
    
    return plugins
```

### Decision 9: `features.yaml` 放置位置

放在 `product/` 目录下，`gen-linux.sh` 打包时拷贝到部署根目录。开发模式下读取项目根目录或 `backend/` 下的 `features.yaml`。

```
product/
├── features.yaml           # 模板/默认配置
├── linux/gen-linux.sh      # 修改：拷贝 features.yaml
└── mac/gen-mac.sh          # 同步修改
```

### Decision 10: `GET /api/v1/system/features` 端点

```python
# backend/app/api/v1/system.py
from fastapi import APIRouter
from app.core.features import get_features

router = APIRouter(tags=["system"])

@router.get("/system/features")
async def get_system_features():
    """返回当前部署启用的功能和插件白名单"""
    return get_features()
```

## Interaction with Permission System

### 核心原则：两个系统是正交的独立层

**特性配置**（`features.yaml`）= 部署级："这个部署实例提供什么功能"
**权限系统**（`sys_user_permission`）= 用户级："当前用户能用这些功能中的哪些"

两者相乘，用户最终能使用的功能 = 特性配置 ∩ 用户权限。

### 优先级规则

| 特性配置 | 用户权限 | 最终结果 | 原因 |
|---|---|---|---|
| 启用 | 有权限 | ✅ 用户可以看到并使用 | 两关都过 |
| 启用 | 无权限 | ❌ 菜单隐藏、路由守卫拦截 | 权限不够 |
| 禁用 | 有权限 | ❌ 路由未注册（404），菜单不显示 | 功能根本不存在 |
| 禁用 | 无权限 | ❌ 功能不存在 | 两关都没过 |

**关键在于**：特性禁用时，用户层次完全看不到入口——路由不注册 / 端点 404 / 菜单消失。权限系统甚至没有机会触发判断。

### 具体交互点

#### 1. 后端路由注册（无条件优先）

当前权限系统在后端的控制点：某些端点有 `Depends(get_current_admin_user)`（如用户管理）。

特性配置控制优先级更高：如果特性禁用，整个 router 不注册，`Depends` 不会被执行。

| 功能 | 特性名 | 权限资源 | 后端控制方式 |
|---|---|---|---|
| Edge 直连 | `edge_client` | `edge_nodes` | 条件 `include_router` + 端点内 `get_current_user` |
| 插件开关 | `plugin_switches` | `plugin_management` | 条件 `include_router`（管理页面受特性+角色双重控制） |
| 安装功能 | `install_openresty` | 无 | 条件 `include_router` |
| 数据导入 | `edge_import` | 无 | 条件 `include_router` |

#### 2. 前端菜单过滤（AND 逻辑）

当前：`.filter(item => !item.permission || authStore.hasPermission(item.permission))`
改成：同时检查 feature 和 permission，两者都通过才显示。

```typescript
.filter(item => {
  const passFeature = !item.feature || featuresStore.has(item.feature)
  const passPermission = !item.permission || authStore.hasPermission(item.permission)
  return passFeature && passPermission  // 两关都过才显示
})
```

**实施要点**：
- `feature` 在 `permission` 之前检查（功能不存在时无需查权限）
- 对于 `admin` 用户：`hasPermission` 返回 `true`，但 `has('feature')` 仍然检查
- admin 不 bypass 特性配置（因为特性配置是部署级约束，不是用户级）

#### 3. 前端路由注册（特性配置决定路由是否存在）

特性禁用 → 路由不 `addRoute()` → 访问返回 404。
特性启用但用户权限不够 → 路由在但在 `beforeEach` 中被 `meta.permission` 守卫拦截。

这两个守卫发生在不同阶段：路由注册在应用初始化时，权限守卫在导航时。

```typescript
// 初始化阶段：特性配置决定路由是否存在
if (featuresStore.has('edge_client')) {
  router.addRoute('/', { path: 'edge-client', component: ..., meta: { permission: 'edge_nodes' } })
}

// 导航阶段：权限守卫在路由存在的前提下拦截
router.beforeEach((to) => {
  const requiredPermission = to.meta?.permission
  if (requiredPermission && !authStore.hasPermission(requiredPermission)) {
    return '/'  // 路由存在但用户没权限 → 重定向
  }
})
```

#### 4. 插件过滤（三层过滤链）

```
BUILTIN_PLUGINS (代码中所有插件的完整定义)
  │
  ▼ 第1层：配置文件白名单（部署级别上限）
features.yaml enabled_plugins
  │ ── 空列表 = 不限制
  │ ── 非空 = 只允许列表中的插件
  ▼
  │
  ▼ 第2层：DB 开关（运维级别细粒度控制）
ps_plugin_enabled 表
  │ ── all=1 时跳过这层
  └── 不跳过时：只返回 enabled=1 的插件
  ▼
  │
  ▼ 返回结果 → 前端渲染
```

**重要原则**：
- 第 1 层是**硬上限**，即使 `all=1` 也受限制
  - 因为 `all=1` 的含义是"忽略 DB 开关查看所有"，但部署级别限制是更高层的约束
- `plugin_switches` 页面（管理后台的插件开关）也受第 1 层限制
  - 部署没买的插件，管理员也不应该在管理页面看到开关

#### 5. CentralList.vue 中的权限检查

当前 `CentralList.vue` 有 `v-if="authStore.hasPermission('plugin_metadata')"` 等 tab 级权限检查。这些 tab 对应的功能（插件组、全局规则、插件元数据）是**核心功能**，不在新特性控制范围内，不需要改动。

但如果有新功能通过特性控制添加到 CentralList，需要同时检查 feature 和 permission。

#### 6. 认证绕过分析

现有权限系统有两种绕过方式：
- **admin 角色**：`hasPermission()` 返回 `true`（绕过权限检查）
- **无权限要求的端点**：没有 `meta.permission` 的路由任何人都能访问

新系统不受影响：
- admin 仍然可以访问所有**已部署**的功能（特性配置不 bypass）
- 无权限要求的端点如果被特性禁用，同样 404

### 映射表

将每个功能映射到对应的特性名和权限资源（便于实施时参考）：

| 前端路由 | 特性名 | 权限资源 | 菜单所在分区 | 核心/可选 |
|---|---|---|---|---|
| `/` Dashboard | — | — | 核心功能 | 核心 |
| `/clusters` | — | — | 核心功能 | 核心 |
| `/nodes` | — | — | 核心功能 | 核心 |
| `/upstreams` | — | — | 核心功能 | 核心 |
| `/routes` | — | — | 核心功能 | 核心 |
| `/plugin-configs` | — | `plugin_groups` | 核心功能 | 核心 |
| `/global-rules` | — | `global_rules` | 核心功能 | 核心 |
| `/plugin-metadata` | — | `plugin_metadata` | 核心功能 | 核心 |
| `/static-resources` | — | — | 核心功能 | 核心 |
| `/central-management` | — | — | 综合 | 核心 |
| `/edge-client` | `edge_client` | `edge_nodes` | Edge 功能 | 可选 |
| `/edge-import` | `edge_import` | — | Edge 功能 | 可选 |
| `/tools` | `tools` | — | Edge 功能 | 可选 |
| `/plugin-switches` | `plugin_switches` | `plugin_management` | 系统管理 | 可选 |
| `/users` | — | — | 系统管理（role=admin） | 核心 |
| install-openresty (按钮+API) | `install_openresty` | — | 节点操作 | 可选 |
| install-edge (按钮+API) | `install_edge` | — | 节点操作 | 可选 |

**实施总原则**：
1. 特性配置控制"功能是否存在"（部署级，第一道闸）
2. 权限系统控制"谁能用已部署的功能"（用户级，第二道闸）
3. 两道闸独立运作，不互相修改
4. 管理员不 bypass 特性配置（因为部署级限制高于用户角色）

### 需要处理的冲突点：用户管理中的权限分配

#### 问题

`UserList.vue` 中 `allPermissions` 数组是硬编码的，包含 `edge_nodes` 等权限选项。当 `edge_client` 功能被禁用时，admin 仍然可以看到并勾选"Edge直连"权限。这导致：

1. admin 分配了一个没意义的权限
2. 普通用户获得了 `edge_nodes` 权限但无法使用任何对应的功能（因为功能不存在）
3. 造成管理员困惑（"我明明给了权限，为什么用户说看不到？"）

#### 解决方案

在用户管理页面中，根据特性配置动态过滤 `allPermissions`，**隐藏**对应功能被禁用的权限选项。

**具体做法**：

```typescript
// 权限 key → 特性名 映射表
const permissionFeatureMap: Record<string, string> = {
  edge_nodes: 'edge_client',
}

// 改为 computed，根据特性配置动态过滤
const allPermissions = computed(() => {
  const base = [
    { key: 'plugin_groups', label: '插件组管理' },
    { key: 'global_rules', label: '全局规则管理' },
    { key: 'plugin_metadata', label: '插件元数据' },
    { key: 'edge_nodes', label: 'Edge直连' },
  ]
  const featuresStore = useFeaturesStore()
  return base.filter(p => {
    const feature = permissionFeatureMap[p.key]
    // 没有对应的特性名 → 核心权限，始终显示
    // 有对应的特性名 → 功能启用时才显示
    return !feature || featuresStore.has(feature)
  })
})
```

**影响范围**：只有 `edge_nodes` 这一个权限会受影响（其他权限对应的是核心功能，不在特性控制范围内）。

#### 后端无变更

后端 `PUT /admin/users/{id}/permissions` API 不做修改。即使前端不显示，后端仍然接受该权限 key — 这样如果后续某天功能重新启用，之前分配的权限会自动生效，不需要重新分配。

| 风险 | 缓解措施 |
|---|---|
| features 加载失败时用户只能停留在登录页 | 登录页不受影响；登录后的页面本来就需要后端可用才能操作，此时其他 API 也必然失败 |
| `features.yaml` 丢失导致所有功能禁用 | `load_features()` 中处理文件不存在的情况，默认全部启用 |
| 安装端点从 `cluster_nodes.py` 拆分后，新增的安装相关代码如果误加在 `cluster_nodes.py` 中会导致特性控制失效 | 代码审查时检查；在 `cluster_nodes.py` 顶部加注释提醒 |
| 现有权限系统和特性系统共存复杂：用户有权限但功能被禁用时，用户应看到什么？ | 功能禁用 > 权限不足。功能禁用时路由不注册、菜单不显示，用户根本看不到入口 |
| 与现有 `plugin_switches` 功能冲突：`plugin_switches` 本身是一种运行时开关，现在又加了配置文件开关 | 明确分层：配置文件是部署时决定"哪些插件可以出现在这个部署中"，plugin_switches 是运行时决定"管理员是否允许用户使用"。两者独立，配置文件的过滤优先级更高 |

## Migration Plan

1. **第一步**：创建 `app/core/features.py`、`app/api/v1/system.py`、`stores/features.ts` 基础设施
2. **第二步**：拆分 `cluster_nodes.py`，将安装端点移至 `cluster_install.py`
3. **第三步**：修改 `main.py` 条件性注册路由；修改 `plugins.py` 增加白名单过滤
4. **第四步**：修改 `AppSidebar.vue` 增加 feature 过滤字段
5. **第五步**：修改 `router/index.ts` 条件性注册前端路由
6. **第六步**：修改 `NodeList.vue` 和 `ClusterNodes.vue` 条件性显示安装按钮
7. **第七步**：创建 `product/features.yaml` 模板，修改 `gen-linux.sh` 拷贝该文件

**回滚策略**：删除 `features.yaml` 或设为全部启用即可恢复默认行为，无需改代码。

## Open Questions

- 无（所有设计决策已在本文档中覆盖）

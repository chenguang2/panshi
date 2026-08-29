# 磐石 Gateway 全面重构方案

> 日期：2026-08-29　·　范围：backend/app + frontend/src　·　证据基准：本次全量侦察（代码知识图谱 + 源码阅读）

> **实施状态**：
> - Phase 0（安全加固）已于 2026-08-29 完成（83f9525 / eb1d170）——20 个路由文件认证补齐、
>   全局异常不泄漏、CORS 收紧、JWT 密钥治理、NodeTaskCenter 流式改造、守卫测试、E2E 适配。
> - Phase 1（死代码 + 低风险合并）已于同日完成（5700f27 + 7851130）——删除 useClusterStreamProxies.ts、
>   SAVE_SCROLL_KEY 死代码；`utils/format.ts` 收敛 12 处 formatDate 重复实现；密码校验器抽取；
>   auth.py 认证实现并入 deps.py（含禁用用户状态校验）。
> - Phase 2（前端界面统一，进行中）已提交（1236394）——U2 发布状态渲染统一为 PublishStatusTag.vue
>   （publishStatusRender 委托化，11 个视图内联模板替换）；U3 列配置弹层收敛为 ColumnConfigPopover.vue。
>   剩余：U1 手写 modal → AntD AppModal（风险最高，需同步改 useClusterUtils 测试契约）。
> - Phase 3 + M5 已提交（9245ebe）——后端 `edge_sync.rollback_resource` 通用回滚工厂收敛 8 个
>   rollback 端点（history/delete-history 本已集中，无需额外工厂）；前端 `utils/error.ts`
>   `getApiErrorMessage` 统一 4+ 处手写错误提取。
> - Phase 5（工程化）已提交（20cfc8d）——ESLint 10 flat config + Prettier + husky 9 +
>   lint-staged（pre-commit 仅处理暂存文件）；存量 lint 错误 46→0；生产 TS `any` 76→~1
>   （新增 GlobalRule/StaticResource 类型、composables/api 全面定型）；.vue 模板内 any
>   474 处保留为 warn 增量治理。
> - Phase 6 安全/后端项已提交（142c058）——S6 后端资源级权限（require_permission 工厂，
>   admin 直通 / 用户按 UserPermission 门控，全局资源按前端权限键、集群子资源由 clusters
>   容器门控、/stream-proxies 用 require_any）；M1 操作审计日志（复用既有 AuditLog 模型，
>   log_audit 接入集群/用户/数据库/清单/导入/插件开关等系统级操作 + GET /system/operations）。
> - Phase 6 剩余项已提交（e880fe4）——脱敏（清单 ansible_ssh_pass/become_pass 对外掩码
>   ****** + 保存恢复、SSL 私钥抽屉默认掩码+显示切换）；列表 N+1 修复（upstreams targets
>   批量 IN 查询）；ECharts 按需加载侦察确认本已达标（三处均 echarts/core 树摇引入）。

## 0. 执行摘要

本次侦察的结论与"重构前预期"不同：**代码库整体健康度较高**，大量重构目标其实已经完成——

| 已具备的优良实践 | 位置 |
|---|---|
| 集群资源 CRUD 通用工厂（load/select/delete/publish/version 十件套） | `frontend/src/composables/useClusterResource.ts`、`useClusterPluginEntity.ts` |
| 后端认证依赖已集中（不再散落各文件手写） | `backend/app/core/deps.py` |
| 发布/版本编排单一实现 | `backend/app/services/edge_sync.py`（`publish_resource` / `list_config_versions`） |
| 路由懒加载 + 特性门控动态路由 | `frontend/src/router/index.ts` |
| Monaco 编辑器动态导入 | `frontend/src/components/MonacoEditor.vue:29` |
| 仪表盘并行请求 | `frontend/src/views/Dashboard.vue:113`（`Promise.all`） |
| 表格服务端分页/排序/搜索 | `useClusterResource.load` / 各列表端点 |
| 单测 + E2E 覆盖 | `frontend/src/**/__tests__`（40+ 用例）、`frontend/e2e`（33 个 spec）、`backend/tests` |
| 配置版本历史 + 回滚 | `ConfigVersion` 模型 + 各资源 history/rollback 端点 |

因此本方案**不做推倒重来**，而是按严重度聚焦真实问题：

- **P0（安全）**：后端约 20 个路由文件完全未鉴权，任何人可读写/删除/发布全部网关配置 —— 最优先，独立可测。
- **P1（治理/架构）**：前端 12+ 处 `formatDate` 平行重复、`useClusterUtils.ts` 721 行职能混杂、两套 CRUD 工厂并存、手写 modal 与 AntD Modal 混用、后端 10 个 cluster 路由文件的 CRUD/版本历史重复、全局异常处理泄漏内部错误。
- **P2（工程化/可维护）**：无 ESLint/Prettier/husky/lint-staged；生产代码残留 40+ 处 `any`；无操作审计日志；JWT 默认密钥兜底。

---

## 1. 关键发现总表（含证据）

| # | 级别 | 问题 | 证据 |
|---|---|---|---|
| S1 | **P0** | 集群域资源路由**全部未鉴权**：routes/upstreams/nodes/ssl/stream/dns/global_rules/plugin_configs/plugin_metadata/static_resources + dashboard/plugins/node_tasks/metrics/edge_client/edge_import/edge_autostart/plugin_switches/cluster_install/cluster_edge_env，共 20 个路由文件无任何 `Depends(get_current_user)` | `backend/app/api/v1/` 全目录 grep：仅 13 个文件含认证依赖；`cluster_upstreams.py:19` 甚至 import 了 `get_current_user` 却从未使用（认证本意未落地） |
| S2 | P0 | 全局异常处理器向客户端泄漏 `str(exc)`（内部路径/堆栈/DB 细节） | `backend/app/main.py:57-62` |
| S3 | P0 | CORS `allow_origins=["*"]` + `allow_credentials=True`（无效组合 + 安全风险） | `backend/app/main.py:45-51` |
| S4 | P1 | `JWT_SECRET_KEY` 默认密钥兜底，生产可零配置弱密钥启动 | `backend/app/core/security.py:8` |
| S5 | P1 | Token 存 `localStorage`（XSS 可窃取）；无 refresh 机制；`auth.ts` 对 `localStorage` 损坏 JSON 直接 `JSON.parse` 会崩溃 | `frontend/src/stores/auth.ts:7-11` |
| S6 | P1 | 前端权限仅前端路由守卫强制，后端无资源级权限校验（认证缺失的放大器） | `frontend/src/router/index.ts:156-162` |
| A1 | P1 | `formatDate` 在 **12+ 个视图文件各自重新实现**，与 `useClusterUtils.ts:670` 的共享导出并存 | `NodeList.vue:987`、`GlobalRuleList.vue:140`、`SslList.vue:178`、`RouteList.vue:215`、`UpstreamList.vue:208`、`UserList.vue:695`、`StreamProxyList.vue:240`、`DnsUdpProxyList.vue:208`、`PluginConfigList.vue:140`、`PluginMetadataList.vue:219`、`StaticResourceList.vue:283`、`StreamProxyViewDrawer.vue:176` |
| A2 | P1 | `useClusterUtils.ts`（721 行）职能混杂：手写 modal 渲染 + 发布/删除业务 + 日期格式化 + 批量结果表 | 单文件 13 个导出函数 |
| A3 | P1 | 两套 CRUD 工厂并存：`useClusterResource`（routes/upstreams 系）vs `useClusterPluginEntity`（plugin_configs/global_rules 系），删除/发布/版本打开逻辑 ~80% 重复 | `useClusterResource.ts`、`useClusterPluginEntity.ts` |
| A4 | P2 | 后端 10 个 `cluster_*.py` 路由文件重复"history/rollback/delete-history"三件套及 list 搜索/排序/分页骨架 | `cluster_upstreams.py:312-354` 与 `cluster_routes.py` 等逐字同构 |
| A5 | P2 | 密码强度校验器在 `UserCreate` 与 `PasswordResetRequest` 中逐字重复 | `backend/app/schemas/user.py:16-27` 与 `:60-71` |
| A6 | P2 | 后端错误提取逻辑前端 4+ 处手写重复（detail 字符串/数组/内部 message 分支） | `useClusterRoutes.ts:500-522`、`useClusterUtils.ts:512-525`、`useClusterPluginEntity.ts:130-133`、`useClusterStaticResources.ts:149-151` |
| A7 | P2 | `auth.py` 自带 `get_current_user`（含 user.status 校验），与 `deps.py` 重复 | `backend/app/api/v1/auth.py:14` vs `core/deps.py:17` |
| D1 | P2 | `useClusterStreamProxies.ts` 生产代码零引用（仅自身 + 测试文件引用）——疑似死代码 | `grep -rn useClusterStreamProxies frontend/src \| grep -v __tests__` 仅 1 处定义 |
| D2 | P2 | `router/index.ts` 每次导航写 `sessionStorage` 的滚动位置，**只写不读**（vue-router `scrollBehavior` 原生已处理 popstate 恢复） | `router/index.ts:135,148-150` |
| D3 | P2 | `cluster_upstreams.py:19` 未使用的 `get_current_user` import | 同文件无任何使用 |
| D4 | P2 | `useClusterRoutes.ts` 接口 `RouteComposableDeps.availablePlugins/loadAvailablePlugins` 声明但从未解构使用（内部恒用本地 `_localPlugins`） | `useClusterRoutes.ts:76-77` 声明，`:215-225` 本地实现 |
| U1 | P1 | 手写 `modal-overlay/modal-header` 自定义弹窗（6+ 处）与 AntD `Modal` 混用 | `useClusterUtils.ts:84-139,167-202,224-250`、`ClusterRoutes.vue:103-110`、`ClusterNodes.vue:122`；对照 AntD 用法 `useClusterPluginEntity.ts:189`、`useClusterStaticResources.ts:192` |
| U2 | P2 | 发布状态渲染三套并存：`publishStatusRender` 手写绿色 span / `a-tag` / `BadgeStatus` | `useClusterUtils.ts:644-668` vs 各 view |
| U3 | P2 | 集群 Tab 视图工具栏（添加/复制/编辑/删除 + 发布/版本 + 列配置 popover + 搜索）在 8 个视图重复 | `ClusterRoutes.vue:3-58` 等 |
| U4 | P2 | `AppSidebar.vue:21` 菜单图标用 `v-html="item.icon"`（当前硬编码无风险，但属 XSS 隐患模式） | `AppSidebar.vue:21` |
| P1-1 | P2 | 列表端点 N+1：`cluster_upstreams.py:87` 对每行上游单独查 targets | `cluster_upstreams.py:85-94` |
| E1 | P2 | 无 ESLint/Prettier/husky/lint-staged（全仓库无相关配置） | `frontend/package.json:6-13` 无 lint 脚本；仓库无 `.eslintrc*`/`eslint.config.*`/`.husky` |
| E2 | P2 | 生产代码残留 40+ 处 `any`（`as any`/`: any`），违反 AGENTS.md 规则 #5（2026-08 清零未覆盖到） | `useClusterUtils.ts`（17+）、`useStreamProxyList.ts`（10+）、`useClusterPluginEntity.ts`（8）、`useClusterBackup.ts`、`useInstallStream.ts`、`Dashboard.vue:95-96` |
| M1 | P2 | 后端无操作审计日志（仅发布结果有 `edge_logger`、节点任务有日志；CRUD 操作无痕） | `services/edge_logger.py` 仅覆盖 publish |
| M2 | P2 | 清单密码明文返回前端（`parse_inventory` 原样返回 `ansible_ssh_pass`） | `services/inventory_service.py:131-147` |

---

## 2. 方向一：函数合并与代码治理

### 2.1 合并清单与策略

| # | 待合并函数 | 现状 | 合并策略 | 目标 |
|---|---|---|---|---|
| M1 | `formatDate` ×12 个本地实现 + `useClusterUtils.formatDate` | 12+ 个视图各写一份 4-6 行实现 | 保留 `useClusterUtils.formatDate` 语义，**迁移到 `frontend/src/utils/format.ts`**，12 个视图改 import；本地同名函数删除。测试已在 `useClusterUtils.test.ts` 有覆盖，迁移时补充 `format.test.ts` | 单实现 |
| M2 | `useClusterResource` ↔ `useClusterPluginEntity` | 两套"十件套"工厂 | 保留 `useClusterResource` 为基底，增加 `entityMode: 'plugin'` 配置（插件组/全局规则/插件元数据的表单模型差异通过 config 参数化）；`useClusterPluginEntity` 变薄封装或删除。**风险最高，放 Phase 3** | 单工厂 |
| M3 | 后端版本历史三件套（history / rollback / delete-history） | 10 个 `cluster_*.py` 重复同构代码 | 抽 `edge_sync` 通用 `list_versions`/`rollback_version`/`delete_version`（现已集中 publish/delete，补齐 history 族）；路由层各文件改为 3 行薄封装 | 单实现 |
| M4 | 密码校验器 | `user.py` 两处逐字重复 | 抽 `schemas/user.py` 顶层 `validate_password_strength` 函数，两处 `field_validator` 引用 | 单实现 |
| M5 | 后端错误提取 | 前端 4+ 处手写 detail 分支 | 抽 `utils/error.ts` 的 `getApiErrorMessage(error: unknown): string`，统一处理 `string/array/内部 message/兜底`；`executeDeleteWithProgress`、`handleRouteSubmit` 等改调用 | 单实现 |
| M6 | `auth.py.get_current_user` ↔ `deps.py.get_current_user` | 两份实现，行为仅差 user.status 校验 | `deps.py` 增加 `require_active: bool = True` 参数（或新 `get_active_user`），`auth.py` 改引用 deps；删除 auth.py 内实现 | 单实现 |
| M7 | 发布状态渲染 | `publishStatusRender` 手写 span + 各 view 内联 `v{{v}} · {{formatDate}}` 字符串 | 抽 `components/PublishStatusTag.vue`（内部用 `a-tag`），替换 `publishStatusRender` 与全部内联模板 | 单组件 |
| M8 | `formatPublishDateTime` / `formatFileSize` 等纯函数 | 散落 composables | 一并收敛到 `utils/format.ts` | 工具集中 |

### 2.2 关键代码示例（M5 错误提取统一）

```ts
// frontend/src/utils/error.ts —— 新增
/** 统一从 Axios 错误中提取可展示的中文错误信息 */
export function getApiErrorMessage(error: unknown): string {
  const err = error as { response?: { data?: { detail?: unknown; message?: string } }; message?: string }
  const detail = err.response?.data?.detail
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const loc = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : ''
        return `${loc ? `${loc}: ` : ''}${d?.msg || JSON.stringify(d)}`
      })
      .filter(Boolean)
      .join('；')
  }
  if (err.response?.data?.message) return err.response.data.message
  return err.message || '操作失败'
}
```

```python
# backend/app/schemas/user.py —— M4 密码校验器抽取
def validate_password_strength(v: str) -> str:
    if len(v) < 6 or len(v) > 50:
        raise ValueError('密码长度必须为 6-50 个字符')
    if not re.search(r'[A-Za-z]', v):
        raise ValueError('密码必须包含至少一个字母')
    if not re.search(r'\d', v):
        raise ValueError('密码必须包含至少一个数字')
    return v

class UserCreate(UserBase):
    password: str = Field(...)
    @field_validator('password')
    @classmethod
    def _validate_password(cls, v): return validate_password_strength(v)

class PasswordResetRequest(BaseModel):
    new_password: str = Field(...)
    @field_validator('new_password')
    @classmethod
    def _validate_password(cls, v): return validate_password_strength(v)
```

---

## 3. 方向二：死代码删除（含判断依据）

> 原则：**只删有证据的**。删除前对每条执行 `grep -rn <符号> frontend/src backend/app --include="*.ts" --include="*.vue" --include="*.py"` 复核，确认无生产引用；依赖它的测试文件同步删除或改写。

| # | 待删除 | 判断依据 | 验证命令 |
|---|---|---|---|
| D1 | `frontend/src/composables/useClusterStreamProxies.ts` 整个文件 | 全库 grep：仅自身定义 + `__tests__/useClusterStreamProxies.test.ts` 引用，**零生产引用**（全局页用的是 `useStreamProxyList.ts`） | `grep -rn "useClusterStreamProxies" frontend/src --include="*.ts" --include="*.vue" \| grep -v __tests__` → 仅定义行 |
| D2 | `router/index.ts` 的 `SAVE_SCROLL_KEY` 常量 + `beforeEach` 内 `sessionStorage.setItem` 一行 | 只写不读（全库无 `getItem` 该 key）；vue-router `scrollBehavior` 的 `savedPosition` 已原生覆盖 popstate 场景；每次导航还引入同步存储写开销 | `grep -rn "panshi_scroll\|SAVE_SCROLL_KEY" frontend/src` → 仅 setItem |
| D3 | `cluster_upstreams.py:19` 未使用的 `from app.core.deps import get_current_user` | 同文件 10 个端点无一处使用（且是认证缺失的证据，见 S1） | `grep -n "get_current_user" cluster_upstreams.py` → 仅 import 行 |
| D4 | `useClusterRoutes.ts` `RouteComposableDeps` 接口中的 `availablePlugins?: Ref<Plugin[]>`、`loadAvailablePlugins?: () => Promise<void>` | 声明于接口、函数体解构清单（`:92-104`）从未包含这两项，恒用本地 `_localPlugins` | 阅读 `useClusterRoutes.ts:59-104` 解构处 |
| D5 | `ClusterRoutes.vue` 中 `allRouteColumns` 的 `methods` 列等未勾选项（复核项） | 若 `useColumnConfig` 默认列不含且用户配置从不开启——**此项需人工确认后再删**，不作为必删项 | — |

**明确不删**（侦察已确认有引用）：`showNameConfirm`（ClusterList/CentralList 集群删除用）、`showBatchResultModal/showBatchStatusModal`（useClusterNodes 批量创建/状态查询用）、`useProgressModal`（EdgeClient 5 处）、全部 `utils/` 工具、全部 `components/*.vue`（均有使用或测试）。

---

## 4. 方向三：前端界面优化

### 4.1 主要问题：弹窗体系分裂

当前 6+ 处**手写 `modal-overlay` 弹窗**（`useClusterUtils` 的 5 个函数 + `ClusterRoutes.vue` 添加/编辑弹窗 + `ClusterNodes.vue` 节点弹窗 + `EdgeEnv.vue`）与 **AntD `Modal`**（`RouteFormModal`、`viewPluginConfigDetail`、静态资源上传）并存。手写版存在：无焦点管理/无 ESC 关闭/无无障碍属性/样式靠全局 CSS 类。

**统一方案**：以 AntD `Modal` 为基底，新建一个带系统主题的轻封装 `AppModal.vue`（透传 AntD Modal props + 统一 `width`/`okText`/`cancelText` 默认），逐步替换手写弹窗：

```
替换映射：
  useClusterUtils.createProgressModal        → AppModal(无 footer, 自定义 body) 或 Modal 实例
  useClusterUtils.showDeleteConfirm          → AppModal.confirm + Checkbox.Group（节点选择）
  useClusterUtils.showNameConfirm            → AppModal.confirm + Input
  useClusterUtils.showBatchResultModal       → AppModal + List
  useClusterUtils.showBatchStatusModal       → AppModal + Table
  ClusterRoutes.vue / ClusterNodes.vue 内联弹窗 → <AppModal v-model:open>
```

### 4.2 高频操作路径简化

- 集群 Tab 页工具栏（8 个视图重复）：抽 `components/ResourceToolbar.vue`（props: `resourceKey`、`columnConfig`、`searchPlaceholder`；slots 扩展），把"添加/复制/编辑/删除 | 发布/版本 | 列配置 popover | 搜索"整体收敛为一行组件。**布局与交互完全不变，仅去重**。
- 发布状态三套渲染 → 统一 `PublishStatusTag.vue`（见 M7）。
- 状态徽标统一用 `BadgeStatus`（已存在），替换散落的 `a-tag`/内联 span。

### 4.3 优化前后对比（示例：路由 Tab 页）

| 维度 | 优化前 | 优化后 |
|---|---|---|
| 弹窗实现 | 手写 `modal-overlay` + 全局 CSS 类（无 ESC/焦点） | AntD `AppModal`（键盘可访问、主题一致） |
| 工具栏 | 约 55 行内联模板，与 7 个兄弟视图重复 | `<ResourceToolbar ... />` 一行，差异走 props/slots |
| 发布状态 | 手写绿色 span + `title` 提示 | `PublishStatusTag`（`a-tag` 风格统一） |
| 列配置 | 每视图一份 `a-popover` + checkbox 组 | 收敛进 `ResourceToolbar` |
| 日期 | 视图内本地 `formatDate` | `utils/format.ts` 共享 |

---

## 5. 方向四：架构优化

### 5.1 统一 API 请求层（`frontend/src/api/index.ts`）

现状：仅 401 拦截跳登录；**无统一错误提示、无 403 处理、401 只清 localStorage 不清 Pinia 状态**（`authStore.token` 仍残留旧值，store 与 localStorage 双写不一致）。

```ts
// api/index.ts 增强（关键片段）
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status
    const isLogin = error.config?.url?.includes('/auth/login')
    if (status === 401 && !isLogin) {
      localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('permissions')
      const { useAuthStore } = await import('@/stores/auth')   // 清 Pinia（避免双写不一致）
      useAuthStore().clear()
      message.error('登录状态已失效，请重新登录')
      router.push('/login')
    } else if (status === 403) {
      message.error('没有操作权限')
    }
    return Promise.reject(error)
  }
)
```

同时 `stores/auth.ts` 增加 `clear()`（重置 ref + 清 localStorage），`login()` 对 `localStorage` 读取包 `try/catch`（损坏 JSON 不再崩溃）。

### 5.2 后端全局异常处理（S2）

```python
# backend/app/main.py —— 替换现有 exception_handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s %s | %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "服务器内部错误"},
    )
```

配合 `HTTPException` 保持原样（FastAPI 默认处理），并统一在业务层主动抛带中文 detail 的 `HTTPException`。**不再向客户端透出 `str(exc)`**。

### 5.3 CORS 收紧（S3）

```python
# main.py —— 允许来源改环境变量，禁止通配 + credentials 组合
_CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:12345").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _CORS_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 5.4 状态管理

Pinia 已覆盖 auth/features/theme/metrics；集群子资源状态挂在 `Cluster` 对象动态键上（`useClusterResource.getState/setState` 的 `as unknown as Record` 写法）。**不建议重构为独立 store**（改动面大、收益低），改为：在 `types` 中给 `Cluster` 补显式索引签名，去掉双转型。低风险、纯类型改进。

---

## 6. 方向五：安全加固（最高优先级）

### 6.1 P0 — 补齐认证（S1，本方案第一优先任务）

**问题范围**：`backend/app/api/v1/` 下 20 个路由文件的所有端点无认证：

`cluster_upstreams / cluster_routes / cluster_global_rules / cluster_nodes / cluster_plugin_configs / cluster_plugin_metadata / cluster_stream_proxies / cluster_dns_proxies / cluster_ssl / cluster_static_resources / cluster_edge_env / cluster_install / plugins / dashboard / metrics / node_tasks / edge_client / edge_import / edge_autostart / plugin_switches`

（已认证的 13 个：`clusters / users / routes / upstreams / nodes / plugin_configs / global_rules / static_resources / plugin_metadata / cluster_backup / cluster_export / database / ansible_inventory`；`system/features` 与 `/health` 按设计公开——前端 bootstrap 需要，保持公开。）

**修复方案（router 级依赖，一处生效，勿逐端点加）**：

```python
# 每个未认证文件底部追加（示例 cluster_upstreams.py）
from app.core.deps import get_current_user
router = APIRouter(prefix="/clusters", tags=["clusters"],
                   dependencies=[Depends(get_current_user)])
```

> 注意：以 `router = APIRouter(...)` 声明处为准，直接在该处加 `dependencies`，无需改动任何端点签名。已认证文件不动。

**回归风险**：加装认证后前端所有请求已带 `Authorization` 头（`api/index.ts:14-25`），理论无前端改动。**但**：`edge_client.py`（Edge 直连，含节点凭据操作）、`edge_autostart.py`（SSE 流）、`cluster_install.py`（Ansible 安装，走 root 凭据）属高危面，需回归验证其调用链；`edge_client` 若存在"平台侧无登录态直连"场景需评估是否豁免。

**验证门禁**：
```bash
# 新增守卫测试：抽查 3 个未认证文件的关键端点，无 token 应 401
cd backend && uv run pytest tests/ -k "auth"   # 并新增 test_security_guard.py
# 手工验证：curl 无 token 访问 /api/v1/clusters/1/routes → 期望 401（改造前 200）
```

### 6.2 P1 项

| 项 | 措施 |
|---|---|
| S4 默认密钥 | `security.py` 启动校验：`if JWT_SECRET_KEY.endswith("change-in-production"): raise RuntimeError(...)`，并写入部署文档；密钥改环境变量必填 |
| S5 token 存储 | 短期：`auth.ts` 读取包 try/catch + 增加 `clear()`；中期评估 HttpOnly Cookie 方案（需配套 CSRF Token，改动大，单列任务） |
| S6 后端权限 | 认证补齐后，第二步：为 cluster 资源 CRUD 增加资源级权限校验（复用 `UserPermission` 表，admin 直通），与前端 `meta.permission` 对齐 |
| 脱敏 | `inventory_service.parse_inventory` 对 `ansible_ssh_pass / ansible_become_pass` 返回值置空（或掩码），保存时允许"未修改则沿用原值"；`SslViewDrawer` 私钥默认折叠 + 明文仅按需展开 |
| U4 v-html | `AppSidebar` 图标改 `<component :is>` 或模板内联，移除 `v-html` |

---

## 7. 方向六：性能优化

**已达标，无需动**：路由懒加载、Monaco 动态导入、仪表盘 `Promise.all`、服务端分页/排序（无大表虚拟滚动需求）、特性路由按需注册。

**真实可做项**：

| 项 | 说明 |
|---|---|
| D2 移除每导航 `sessionStorage` 写 | 删除 `beforeEach` 中滚动保存（只写不读的死代码） |
| P1-1 列表 N+1 | `cluster_upstreams.py:87` 每行上游单独查 targets → 一次 `IN` 批量查询组装；同型问题在其他列表端点一并核查（`cluster_routes` 的 plugins 等） |
| ECharts 按需 | `vue-echarts` 全量引入 → `echarts/core` + 按需注册图表/组件（MetricsDashboard/StatusAnalysisChart 等） |
| 构建产物核查 | `vite build` 后检查 chunk 分布，确认 monaco/echarts 已拆分；大 chunk 用 `manualChunks` 固化 |

---

## 8. 方向七：工程化建设

### 8.1 现状结论

- TypeScript：**已全量采用**（含 vue-tsc 构建校验），"评估引入 TS"一项**已完成**，无需再评估；剩余工作是 **strict 收尾 + 清 40+ 处 `any`**（E2）。
- 测试：vitest 单测 + Playwright E2E 均已就绪。
- **缺失**：ESLint、Prettier、husky、lint-staged。

### 8.2 落地步骤

1. 安装与配置：
```bash
cd frontend
npm i -D eslint @eslint/js typescript-eslint eslint-plugin-vue prettier eslint-config-prettier eslint-plugin-prettier husky lint-staged
# 或国内源：npm i -D ... --registry=https://registry.npmmirror.com
```
2. `eslint.config.js`：`typescript-eslint` 推荐 + `eslint-plugin-vue`（`plugin:vue/vue3-recommended`）+ `prettier` 关闭冲突；规则开启 `@typescript-eslint/no-explicit-any` 为 **warn**（先存量警告、增量清零，避免一次性阻断）。
3. `package.json` 脚本：`"lint": "eslint src e2e", "lint:fix": "eslint --fix src e2e"`；`"format": "prettier --write ."`。
4. husky + lint-staged：
```bash
npx husky init
# .husky/pre-commit: npx lint-staged
# lint-staged: {"*.{ts,vue}": ["eslint --fix"], "*.{ts,tsx,vue,json,css}": ["prettier --write"]}
```
5. CI 或提交时 `vue-tsc -b` 已由 build 覆盖，无需重复。

### 8.3 核心逻辑单测补充

- **路由匹配**：`convert_route_to_edge_format`（后端）已需守卫测试（`test_publish_response.py`，见项目记忆 #22），补充 `edge_sync` 版本三件套合并后的新测试。
- **权限校验**：后端资源级权限依赖（S6 引入后）配 `pytest` 用例：admin 直通 / 无权限 403 / 未登录 401。
- 前端 `utils/error.ts`（M5）与 `utils/format.ts`（M1）各补 vitest 用例（迁移后旧测试同步指向）。

---

## 9. 方向八：可维护性提升

### 9.1 统一错误处理

- 后端：见 5.2（全局 handler 只记日志不泄漏）+ 业务层统一 `HTTPException(detail=中文)`。
- 前端：`getApiErrorMessage`（M5）+ `api/index.ts` 拦截器兜底 toast；视图层 try-catch 只保留业务上下文（如刷新列表），不再重复解析 detail。

### 9.2 配置化驱动

- **已有**：`features.yaml`（特性门控）、`equivalence_rules.yaml`（字段等价）、环境变量（JWT 过期/密钥、端口）。
- **补齐**：JWT 密钥必填校验（6.2）；每文件 `*_ALLOWED_SORT_FIELDS` 常量收敛到对应 schema/service 定义处（小重构，降低散落）。

### 9.3 操作日志与版本回滚（M1）

- 版本回滚**已具备**（`ConfigVersion` + rollback 端点 + `VersionManagementModal`），无需新建。
- 新增**操作审计日志**：
```python
# backend/app/models/system.py —— 新增 OperationLog
class OperationLog(Base):
    __tablename__ = "operation_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None]
    username: Mapped[str | None]
    action: Mapped[str]        # create/update/delete/publish/rollback/import/export
    resource_type: Mapped[str] # routes/upstreams/clusters/...
    resource_id: Mapped[int | None]
    detail: Mapped[str | None] # JSON，含变更摘要
    created_at: Mapped[datetime]
```
  接入点：`edge_sync.publish_resource`（发布/回滚）与各资源 create/update/delete 路由；admin 后台（用户/权限/数据库切换）必记。前端在用户/数据库管理页展示最近操作。

---

## 10. 重构风险点与测试建议

| 风险 | 等级 | 缓解 |
|---|---|---|
| **认证补齐引发功能回归**（误伤 edge_client/edge_autostart/SSE/Ansible 链路） | 高 | Phase 0 独立验收：33 个 E2E spec 全跑 + 手工 curl 抽查；`edge_client` 链路专项回归；若存在"无登录态直连"场景先评估再豁免 |
| 合并 CRUD 工厂（M2）改动面大 | 高 | 放最后 Phase；以 `useClusterRoutes`/`useClusterUpstreams` 单测为契约，两工厂并存期逐步切换，勿一次迁移 8 个视图 |
| 弹窗统一（U1）交互差异 | 中 | 逐个替换 + 对应组件单测（`useClusterUtils.test.ts` 大量用例依赖手写 modal 契约，需同步改 mock）；E2E 覆盖删除/发布路径 |
| `formatDate` 迁移（M1）时区/格式回归 | 低 | 12 处逐一比对现有输出格式（zh-CN vs 自拼字符串），`utils/format.ts` 提供与旧实现**逐字节一致**的默认行为，旧测试迁移 |
| 死代码误删 | 低 | 每条先跑 grep 复核（见第 3 节验证命令），删后跑 `vue-tsc -b` + `vitest run` 确认无悬空引用 |
| lint-staged 首次全量格式化产生大 diff | 中 | 先 `prettier --write` 独立提交（仅格式化），再启用 lint-staged；`no-explicit-any` 先 warn 后 error |
| 操作日志表新增导致 DB 迁移 | 中 | 使用现有 `db_migration` 机制；写入失败不得阻断主流程（try/except 吞掉并记日志） |

**回归测试策略**：
1. 后端：`cd backend && uv run pytest`（含新增 `test_security_guard.py`、`test_operation_log.py`）。
2. 前端：`cd frontend && npx vitest run`（迁移文件同步更新）。
3. E2E：`npx playwright test`（33 个 spec，服务已运行于 12344/12345，按 AGENTS.md 约定复用实例，不启停服务）。

---

## 11. 分阶段实施路线图

每个 Phase 独立可合并、可验收，避免大爆炸式重构：

| Phase | 内容 | 涉及文件 | 验收门禁 |
|---|---|---|---|
| **0 · 安全（P0）** | 20 个路由文件加 `dependencies=[Depends(get_current_user)]`；全局异常不泄漏；CORS 收紧；JWT 密钥必填 | `api/v1/*.py`、`main.py`、`core/security.py` | pytest + 全 E2E + curl 401 抽查 |
| **1 · 死代码 + 低风险合并** | D1-D4 删除；M4/M6/M8 抽取；`formatDate` 统一（M1） | `useClusterStreamProxies.ts`、`router/index.ts`、`schemas/user.py`、`api/v1/auth.py`、12 个视图、`utils/format.ts` | vitest + vue-tsc + pytest |
| **2 · 前端弹窗与工具栏统一** | U1/U2/U3（AppModal、ResourceToolbar、PublishStatusTag） | `useClusterUtils.ts`、8 个 cluster 视图、全局列表视图 | vitest + 相关 E2E |
| **3 · 后端 CRUD/版本历史工厂** | M3；A4 收敛 | `edge_sync.py`、10 个 `cluster_*.py` | pytest（版本三件套专项） |
| **4 · 双工厂合并** | M2（useClusterResource 参数化吸收 useClusterPluginEntity） | 两个工厂 + 4 个视图 | vitest 契约测试全绿 |
| **5 · 工程化 + 治理** | ESLint/Prettier/husky/lint-staged；`any` 清零；`getApiErrorMessage` 落地 | 全前端 | lint 通过 + vitest |
| **6 · 可维护性** | 操作审计日志；后端资源级权限（S6）；清单/SSL 脱敏；ECharts 按需、N+1 修复 | 后端 models/api、`inventory_service.py`、前端 utils | pytest + E2E 抽查 |

**建议**：Phase 0 独立先行（安全无小事，且改动模式单一、回归面可控）；Phase 1-2 可并行（不同文件域）；Phase 3-4 顺序依赖；Phase 5-6 穿插进行。
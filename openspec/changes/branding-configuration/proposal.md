# Proposal: branding-configuration

## Why

系统名称、品牌名称和版本号目前硬编码在前端 5 处（登录页品牌名、登录页页脚、侧边栏文案、侧边栏版本徽标、浏览器标签页标题），换品牌或改版本号需要改代码重新构建。本变更把这三个概念收敛进 `features.yaml` 的 `branding` 命名空间，部署侧改配置即可生效（后端已有 mtime 热加载机制），登录页与主界面左侧实时显示配置值。

## What Changes

- `features.yaml` 新增顶层 `branding` 命名空间（4 个字符串 key：`system_name` / `brand_name` / `product_name` / `version`），与 `concurrency` 同构：严格类型校验、未知 key 报错退出、mtime 热加载、未配置回落现状默认值。
- 后端 `app/core/features.py` 新增 `get_branding()` 访问器与校验；`GET /system/features` 已返回完整 features dict，branding 自动透出，API 零改动。
- 前端 `useFeaturesStore` 新增 `branding` 响应式状态；登录页、侧边栏、浏览器标签页标题改为消费配置值。
- 前端 features store 增加轻量重取机制（visibilitychange/focus 触发），改配置后切回页面即刷新显示，无需重启后端或手动刷新浏览器。
- 侧边栏品牌文案统一：现状「磐石 Admin」与登录页「磐石 Gateway」不一致，统一由 `brand_name` 驱动（默认值下侧边栏显示变为「磐石 Gateway」——有意的一次性文案统一，见 design D2）。

## Capabilities

### New Capabilities

- `system-branding`: 系统品牌信息的配置化与展示——`branding` 配置契约（key 集合、校验、默认值、热加载）、后端透出、以及登录页/侧边栏/标签页标题三个展示面的绑定与实时刷新行为。

### Modified Capabilities

（无——现有 `deployment-feature-config` 的 requirement 均不变：branding 是新增顶层命名空间，顶层未知 key 本就不拒绝，现有功能开关语义零影响。）

## Impact

- **后端**：`backend/app/core/features.py`（校验 + 访问器）；`backend/features.yaml`（加注释示例块，向后兼容：未配置 = 现状行为）；`GET /system/features` 零改动（自动透出）。
- **前端**：`stores/features.ts`（branding 状态 + 重取）、`views/Login.vue`（3 处绑定）、`components/AppSidebar.vue`（2 处绑定）、`main.ts`（document.title）、`index.html`（静态标题保留为加载前回落）。
- **测试**：后端 `test_features.py`/`test_system_features.py` 扩展校验用例；前端 `features.test.ts`/`Login.test.ts`/`AppSidebar.test.ts` 扩展；`e2e/login.spec.ts` 现有断言（磐石 Gateway）在默认值下保持绿。
- **约束对齐**：#267（features.yaml 只放部署级配置——品牌信息是实例级属性，非用户交互偏好，符合定位）。

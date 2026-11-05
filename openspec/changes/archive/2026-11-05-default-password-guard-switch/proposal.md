# Proposal: 默认口令守卫开关（force_default_password_change）

## Why

平台以种子账号 `admin` / 默认口令起家，且该默认口令随 AGENTS.md 在公开仓库中全网可知，是当前最大的单点爆破面（optimization-audit-2026-11-05 §3.2，P2）。用户已在使用系统，强制改密必须以**显式 opt-in 开关**形式提供（features.yaml），由部署方选择启用时机，避免对存量用户造成不可预期的不打断式破坏。

## What Changes

- 新增 features.yaml 开关 `features.force_default_password_change`（**显式 opt-in，默认关**，对齐 relay_gateway 先例），mtime 热加载、改完即时生效。
- 开关开启时：登录响应新增 `must_change_password` 标记；检测方式为登录时对种子默认口令做一次 bcrypt 复核（任何用户命中即标记，非仅 admin）。
- 开关开启时：仍持默认口令的会话被**硬强制**——`get_current_user` 对带 `pwd_chg` claim 的 token 全域返回 403（机器可读 code），白名单仅放行改密与登出相关端点；改密后旧 token 经既有 pwd_ver 机制自动失效。
- 新增**自助修改密码**能力：`POST /auth/change-password`（旧口令验证 + 强度校验 + 新口令不得等于默认口令，成功返回新 token）；前端新建非关闭式强制改密弹窗 + axios 拦截器兜底（存量会话刷新页面后也能被引导）。
- 管理员重置密码同步禁止设为默认口令（自助改密与管理员重置双向封口）。
- 归档合并时修正 `login-page-assist` spec Purpose 中「无自助改密流程」的过时表述（本 change 使该表述失效）。

## Capabilities

### New Capabilities

- `account-password-security`: 账户口令安全域——默认口令守卫开关、登录强制改密标记、默认口令会话拦截、自助修改密码、管理员重置口令的默认口令禁令。

### Modified Capabilities

<!-- 无需求级变更：login-page-assist 的「忘记密码」场景行为不变（忘记密码仍引导联系管理员，
无法登录的用户不可能自助改密）；仅其 Purpose 陈述句过时，归档合并时随主 spec 文字修正，
不单开 delta。user-management-ui 既有需求（重置密码 UI 布局）不变，新增的「重置禁止默认口令」
归属新能力 account-password-security。 -->

（无）

## Impact

- 后端：`app/core/features.py`（KNOWN_FEATURES + 默认关语义）、`app/api/v1/auth.py`（登录标记/claim、change-password 端点）、`app/core/deps.py`（get_current_user 403 门）、`app/api/v1/users.py`（重置禁令）、`backend/features.yaml`（新键 + 注释）。
- 前端：新建 `src/api/auth.ts`（#6 资源模块化）、强制改密弹窗组件、`Login.vue` 登录后引导、`api/index.ts` 拦截器 code 兜底、`stores/auth.ts`（token 换发）。
- 测试：新增 `tests/test_default_password_guard.py`（开关矩阵）；`tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补采样（#19）；审计 ROUTE_MAP 覆盖新端点（#37）；前端弹窗/auth store 组件测试。
- 不涉及 schema/模型列变更（检测走登录时 bcrypt 复核，不加库列），不触发 PG 方言冒烟强制项（#103）。
- 已知边界（设计文档详述）：开关开启前签发的存量 token（无 `pwd_chg` claim）不受拦截，最长 24h token 过期或下次登录后收敛。

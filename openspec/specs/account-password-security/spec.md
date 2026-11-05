# account-password-security Specification

## Purpose
账户口令安全域：以部署方可控的开关形式治理种子默认口令风险——开关开启后，仍持默认口令的用户在登录时被标记并被硬强制完成自助改密；同时补齐平台自助修改密码能力，并对一切设置口令的路径封死默认口令回填。

## Requirements

### Requirement: 默认口令守卫开关

系统 SHALL 提供 features.yaml 开关 `features.force_default_password_change` 治理默认口令强制改密行为，该开关 SHALL 为显式 opt-in 语义（未列出或为 false 时功能整体关闭），且修改后 SHALL 热生效（无需重启后端）。

#### Scenario: 开关关闭时无任何强制行为

- **WHEN** `features.force_default_password_change` 未配置或为 false
- **THEN** 登录流程不检测默认口令、登录响应不携带强制改密标记
- **AND** 持默认口令的用户可正常调用全部 API，无任何拦截或弹窗

#### Scenario: 开关开启后热生效

- **WHEN** 部署方将 `features.force_default_password_change` 改为 true（不重启后端）
- **THEN** 后续登录立即按开启态执行检测与标记

### Requirement: 登录响应携带强制改密标记

开关开启时，登录成功响应 SHALL 携带 `must_change_password` 标记：当前账号口令经验证仍为种子默认口令时为 true，否则为 false；标记 SHALL 对任意用户生效（不限于种子 admin 账号）。

#### Scenario: 默认口令用户被标记

- **WHEN** 开关开启，用户以种子默认口令登录成功
- **THEN** 登录响应 `must_change_password` 为 true
- **AND** 后续签发的访问令牌 SHALL 携带默认口令标记 claim

#### Scenario: 非默认口令用户不受影响

- **WHEN** 开关开启，用户以非默认口令登录成功
- **THEN** 登录响应 `must_change_password` 为 false，令牌不带默认口令标记 claim

### Requirement: 默认口令会话全域拦截

开关开启时，携带默认口令标记 claim 的访问令牌调用 API SHALL 被拒绝（HTTP 403），响应 SHALL 携带机器可读的错误码供前端识别；白名单 SHALL 仅放行自助改密、获取本人信息与登出相关端点。开关关闭时 SHALL 不产生任何 403 拦截。

#### Scenario: 持默认口令调用业务 API 被拒

- **WHEN** 开关开启，用户持带默认口令标记的令牌调用白名单之外的任意端点
- **THEN** 返回 HTTP 403，错误体含机器可读 code（`default_password_change_required`）与中文提示
- **AND** 白名单内的端点（自助改密、登出、本人权限）正常响应

#### Scenario: 开关中途关闭立即放行

- **WHEN** 开关开启期间签发了带标记的令牌，随后开关被关闭
- **THEN** 该令牌调用 API 不再被 403 拦截（拦截判定实时读取开关）

#### Scenario: 开关开启前的存量令牌不受拦截

- **WHEN** 令牌签发于开关开启之前（无默认口令标记 claim）
- **THEN** 该令牌调用 API 不被本守卫拦截（收敛依赖令牌过期或下次登录）

### Requirement: 自助修改密码

已登录用户 SHALL 可通过自助改密端点修改本人口令：须验证旧口令正确；新口令 SHALL 满足既有口令强度策略且不得等于种子默认口令；改密成功 SHALL 返回新的访问令牌，旧令牌 SHALL 立即失效（复用既有改密吊销机制）。

#### Scenario: 正确旧口令改密成功

- **WHEN** 用户以正确的旧口令与合规新口令调用自助改密
- **THEN** 返回成功并携带新访问令牌，用户信息与权限一并返回供前端刷新会话
- **AND** 旧令牌随后调用 API 返回 401

#### Scenario: 旧口令错误被拒

- **WHEN** 用户提交的旧口令验证失败
- **THEN** 返回错误提示，口令不发生任何变更

#### Scenario: 新口令等于默认口令被拒

- **WHEN** 用户提交的新口令为种子默认口令
- **THEN** 返回明确错误提示（不得使用默认口令），口令不变更

#### Scenario: 新口令不满足强度策略被拒

- **WHEN** 用户提交的新口令少于 6 位或不含字母/数字
- **THEN** 返回既有强度策略的中文错误提示

### Requirement: 管理员重置口令禁止默认口令

管理员重置他人口令时，新口令 SHALL 适用与自助改密相同的约束：满足强度策略且不得等于种子默认口令。

#### Scenario: 管理员重置为默认口令被拒

- **WHEN** 管理员将某用户口令重置为种子默认口令
- **THEN** 返回明确错误提示，重置不生效

#### Scenario: 管理员重置为合规口令成功后旧令牌失效

- **WHEN** 管理员以合规新口令重置某用户
- **THEN** 重置成功，该用户存量令牌经既有 pwd_ver 机制失效

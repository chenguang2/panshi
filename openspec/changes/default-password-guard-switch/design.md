# Design: 默认口令守卫开关（default-password-guard-switch）

## Context

- 认证链路现状：JWT HS256 + `pwd_ver` claim（password_hash 摘要，改密即吊销存量 token，`security.py::password_version`）；登录限流 5 次/10 分钟；`get_current_user` 已带 `request: Request` 参数（`deps.py:34`），具备按路径白名单放行的条件。
- `ChangePasswordRequest` schema（`schemas/auth.py:27`）为既有死代码：已定义、已导出、无任何端点消费——自助改密端点此前被规划但从未落地（`login-page-assist` spec Purpose 明文「无自助改密流程」）。
- features.yaml 机制：`KNOWN_FEATURES` frozenset 校验（未知键启动即失败）；`feature_enabled()` 对未列出键缺省 **True**（opt-out 模型），不适用本开关的 opt-in 语义；relay_gateway 先例为**读取点显式 default False**（`relay_registry.py:90`），mtime 热加载免重启。
- 前端无 `api/auth.ts` 模块（登录调用内联在 `stores/auth.ts`）；全局事件采用 window CustomEvent 模式（迁移锁横幅 `api/index.ts:35-53` 为范式）。

## Goals / Non-Goals

**Goals:**
- 部署方可控（opt-in 开关）的默认口令强制改密闭环：标记 → 拦截 → 改密 → 恢复。
- 补齐自助改密能力（端点 + UI），消除 ChangePasswordRequest 死代码。
- 封死一切把口令（重）设为种子默认口令的路径。

**Non-Goals:**
- 不做密码过期策略 / 历史口令重用检查 / 复杂度升级（仍用既有 6-50 位字母+数字策略）。
- 不改 `login-page-assist` 的「忘记密码」行为（无法登录者仍引导联系管理员）。
- 不做管理员侧「批量重置」或强制下线他人会话的管理 UI（pwd_ver 吊销已自动生效）。

## Decisions

**D1 开关形态与默认值：features.yaml `features.force_default_password_change`，opt-in 默认 false。**
实现走 relay_gateway 同款：`KNOWN_FEATURES` 增键（防拼写、未知键启动报错）+ `features.py` 新增专用读取助手 `is_default_password_guard_enabled()`（`get("features", {}).get("force_default_password_change", False)`），登录标记与请求拦截**同源读这一个助手**，避免两处读取漂移。备选「复用 `feature_enabled()`」被否：其对未列出键缺省 True，语义相反。
（用户已确认开关形态；#61 四层接线中②③层 N/A——本能力无新路由/菜单项，属执行路径行为开关，①④层即 D1+D3 本体。）

**D2 默认口令检测：登录时 bcrypt 复核 `verify_password(SEED_DEFAULT_PASSWORD, user.password_hash)`，仅开关开启时执行。**
关键性质：用户把密码**改回**默认口令的场景天然覆盖（列标记方案会在改回后漏检）。成本：登录路径 +1 次 bcrypt（~50-100ms），仅开关开启时付出；登录已有一次 bcrypt，总量可接受。备选「加 `must_change_password` 库列 + COLUMN_MIGRATIONS」被否：多一次迁移负担（#118 崩溃循环风险）且有上述漏检洞；列方案唯一优势（免复核成本）在本平台登录频率下无意义。
默认口令常量收敛为单一定义（security.py `SEED_DEFAULT_PASSWORD`），seed.py 与守卫共用，禁止两处字面量漂移。

**D3 强制机制：JWT claim `pwd_chg=1` + `get_current_user` 出口全域 403 + 路径白名单。**
登录命中默认口令 → token 嵌入 `pwd_chg: 1`；`get_current_user` 判定「开关开启（实时读 D1 助手）且 payload 带 `pwd_chg`」→ 对白名单外路径抛 403，`detail` 用结构化体 `{"code": "default_password_change_required", "message": "检测到当前仍在使用默认口令，请先修改密码"}`。
- 备选「每请求 bcrypt 复核」被否：每请求 +100ms 不可接受；「(user_id, pwd_ver)→bool 内存缓存」被否：与 claim 方案等价但多一套失效管理。
- 关键性质 a：**改密即收敛**——改密后 password_hash 变化 → 旧 token pwd_ver 失配 401 → 重新登录签发无标记 token，无需额外清理。
- 关键性质 b：**开关中途关闭立即放行**——判定处实时读开关，关闭后 403 不再发生（旧 token 内残留 claim 无害）。
- 白名单（`request.url.path` 前缀精确匹配）：`/api/v1/auth/change-password`、`/api/v1/auth/logout`、`/api/v1/auth/me/permissions`。
- 已知边界（spec 已固化）：开关开启前签发的 token 无 claim，不受拦截，最长 24h（token 过期）或下次登录收敛。

**D4 自助改密范围：完整自助能力（B 方案）。**
`POST /auth/change-password`（body 复用死代码 `ChangePasswordRequest`：old_password/new_password）：① 旧口令 bcrypt 验证；② 新口令过 `validate_password_strength`；③ 新口令 ≠ 种子默认口令（明确中文报错）；④ `create_access_token(password_hash=新hash)` 签发新 token（pwd_ver 吊销自动生效）；⑤ 响应同时返回 user + permissions 供前端免二次登录刷新会话。入口：强制弹窗（守卫场景）+ 顶栏用户菜单「修改密码」一般入口（实施时按现有用户菜单落位；无现成菜单则挂顶栏头像下拉）。备选「仅守卫场景消费、无一般入口（A 方案）」被否：端点与弹窗组件反正都要建，一般入口边际成本≈0，且顺带补齐「普通用户自助改密」的既有空缺。

**D5 前端强制弹窗：共享组件 + 双消费点 + 不可关闭。**
`components/ForceChangePasswordDialog.vue`（AppModal 形态，#25 三层制的共享流程层；无关闭按钮、遮罩点击与 ESC 均不关闭）。消费点：① `Login.vue` 登录成功且 `must_change_password=true` 时拉起（不跳转，改密成功换 token 后进入系统）；② `App.vue` 级常驻监听全局事件 `panshi:force-change-password` 兜底——`api/index.ts` 响应拦截器新增 403+code 识别分支派发该事件（覆盖刷新页面后存量带 claim token 的场景，与迁移锁横幅同款事件范式）。表单三字段：旧密码 / 新密码 / 确认新密码；提交走新 `api/auth.ts` 模块（#6 资源模块化）。

**D6 管理员重置封口：`users.py` 重置端点复用「新口令 ≠ 默认口令」校验。**
校验逻辑收敛为共享函数（security.py 或 schemas 层），自助改密与管理员重置同源调用，防两处实现漂移。

## Risks / Trade-offs

- **存量 token 收敛延迟 ≤24h**：接受并固化进 spec（Scenario: 开关开启前的存量令牌不受拦截）；部署方可在启用开关后手动让用户重新登录以立即收敛。
- **403 detail 结构化 dict 的前端兼容**：仅本守卫产生该 code，前端拦截器先截获；其余 403（权限不足）仍为 string detail，展示路径不受影响。实施时核对全局错误 toast 对 dict detail 的兜底（`message.error` 收到对象时的行为）。
- **登录耗时 +bcrypt**：仅开关开启时发生，且登录限流（5 次/10 分钟）天然抑制爆破面；内网低频登录可忽略。
- **审计覆盖**：change-password 为 mutating 端点，须补 `audit_hook.ROUTE_MAP` 显式映射（#37）；登录失败已有 INFO 日志（批次 C），改密成功/失败补同款日志行。
- **PG 方言冒烟**：无 schema/模型列变更、无新写路径模式（写既有列），#103 触发条件不命中，不强制；若实施中临时引入新列则升级为强制项并在 tasks 标注。

## Migration Plan

无库表迁移。部署顺序：升级代码（开关默认关，行为零变化）→ 部署方择机在 features.yaml 写 `force_default_password_change: true`（热生效）→ 用户下次登录被引导改密。回滚 = 关开关，即时恢复。

## Open Questions

无——D1 开关形态、D4 自助改密范围（B 方案）已获用户方向确认；其余为实施细节。

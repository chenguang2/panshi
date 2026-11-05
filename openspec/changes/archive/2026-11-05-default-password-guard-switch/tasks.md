# Tasks

> 执行约定：TDD（#16）——每组先写失败测试并验证 RED，再最小实现转 GREEN；共享组件/语义变更落地前先 grep 全域消费方与既有断言（#217）；全量收口用后端 pytest + 前端 `npx vitest run --no-file-parallelism`（#208）。

## 1. 后端开关与常量

- [x] 1.1 RED：`tests/test_default_password_guard.py` 新增开关语义用例——未配置/`false` 时 `is_default_password_guard_enabled()` 为 False，`true` 时为 True（mtime 热生效），未知键不被引入（KNOWN_FEATURES 校验不炸）
- [x] 1.2 GREEN：`security.py` 增加 `SEED_DEFAULT_PASSWORD = "panshi123"` 单一定义（seed.py 改为引用，删两处字面量漂移面）；`features.py` KNOWN_FEATURES 增 `force_default_password_change` + 专用读取助手（default False，relay_gateway 同款）；`backend/features.yaml` 加注释占位（默认不列出 = 关）
- [x] 1.3 既有 features 校验测试回归（`grep -rn KNOWN_FEATURES tests/` 找到消费方补该键断言）

## 2. 后端登录标记与 claim

- [x] 2.1 RED：开关开启 + 默认口令登录 → 响应 `must_change_password=True` 且 token 解码含 `pwd_chg=1`；非默认口令 → False 且无 claim；开关关闭 → 恒 False 不复核（bcrypt 不被调用，monkeypatch 计数断言）
- [x] 2.2 GREEN：`auth.py` 登录端点按 D2/D3 实现（助手判定 + verify_password 复核 + LoginResponse 增字段 + create_access_token 嵌 claim）；`schemas/auth.py` LoginResponse 增 `must_change_password: bool = False`
- [x] 2.3 审计与日志：登录标记路径补 INFO 日志行（批次 C 风格），确认 ROUTE_MAP 对 /auth/login 既有映射不受影响

## 3. 后端 403 拦截门

- [x] 3.1 RED：带 `pwd_chg` claim 的 token——白名单外端点 403 且 detail.code=`default_password_change_required`；三个白名单端点（change-password/logout/me-permissions）放行；开关运行中改 false 后同一 token 放行（热生效）；无 claim 的存量 token 全部放行
- [x] 3.2 GREEN：`deps.py::get_current_user` 按 D3 实现（payload claim 判定 + 开关实时读 + `request.url.path` 白名单）；403 detail 用结构化 dict
- [x] 3.3 安全守卫回归：`tests/test_security_guard.py` UNAUTHENTICATED_SAMPLES 补 `POST /auth/change-password` 采样（#19）；确认 403 门不影响既有 401 语义用例

## 4. 后端自助改密与管理员重置封口

- [x] 4.1 RED：改密端点矩阵——正确旧口令+合规新口令成功（返回新 token+user+permissions，旧 token 401，新 token 无 pwd_chg）；旧口令错 → 明确报错口令不变；新口令=默认口令 → 拒绝；强度不足 → 既有中文提示；未认证 → 401
- [x] 4.2 RED：管理员重置矩阵——重置为默认口令拒绝；重置为合规口令成功且目标用户存量 token 401（pwd_ver）
- [x] 4.3 GREEN：`auth.py` 实现 `POST /auth/change-password`（消费既有 ChangePasswordRequest，D4 五步）；共享校验函数落 security/schemas 层；`users.py` 重置端点接入 D6 封口
- [x] 4.4 审计接线：ROUTE_MAP 补 `/auth/change-password` 映射（#37），启动无「审计路由映射缺失」告警；改密成功/失败补 INFO 日志
- [x] 4.5 全量后端收口：`cd backend && uv run pytest`（0 failed）

## 5. 前端

- [x] 5.1 `api/auth.ts` 资源模块（#6）：changePassword + login 类型补 must_change_password；`stores/auth.ts` 登录消费新字段
- [x] 5.2 `ForceChangePasswordDialog.vue`：AppModal 形态、三字段表单、不可关闭（无关闭钮/遮罩/ESC）、提交调 api、成功后换 token + 刷新 user/permissions + 关闭并继续原流程；组件测试（含「弹窗打开后不可关闭」断言，jsdom 下 ESC/遮罩）
- [x] 5.3 `Login.vue` 接线：must_change_password=true 时不跳转、拉起弹窗、改密成功后再进入；组件测试覆盖该分支
- [x] 5.4 `api/index.ts` 拦截器：403 + code 识别 → 派发 `panshi:force-change-password` CustomEvent（迁移锁横幅同款范式，去重窗口）；`App.vue` 常驻监听拉起共享弹窗；拦截器单测补该分支
- [x] 5.5 一般入口：顶栏用户菜单「修改密码」挂同一弹窗（可关闭变体或复用强制变体按现状落位）；入口按权限无关（所有已登录用户可见）
- [x] 5.6 前端收口：`npx vue-tsc -b` 0 error；`npx vitest run --no-file-parallelism` 全绿（#208）

## 6. 文档与归档

- [x] 6.1 AGENTS.md：features.yaml 开关清单/约定处补 `force_default_password_change` 一行说明（opt-in 默认关 + 四层接线中②③ N/A 的裁决注记）
- [x] 6.2 `openspec validate --all` 0 error 收口（#53）
- [x] 6.3 归档合并：主 spec 增 `account-password-security`；同步修正 `login-page-assist` Purpose「无自助改密流程」表述（MODIFIED 块取自主 spec 现文，#53）
- [ ] 6.4 提交推送 + 交付报告（含部署启用指引：features.yaml 写 true 即热生效）

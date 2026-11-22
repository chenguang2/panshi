# Tasks

## 1. 后端 branding 配置契约（TDD）

- [x] 1.1 RED：`backend/tests/test_features.py` 新增 branding 用例——未配置回落 4 个默认值、类型错误（namespace 非映射 / 值非字符串）报错退出、未知 key（如 `brandname`）报错退出、mtime 热加载后 `get_branding()` 返回新值；跑 `uv run pytest tests/test_features.py -k branding` 验证 RED
- [x] 1.2 GREEN：`app/core/features.py` 实现 `KNOWN_BRANDING_KEYS` + `_validate_branding`（含默认值归一）+ `get_branding()` 访问器；`uv run pytest tests/test_features.py tests/test_feature_gating.py` 全绿
- [x] 1.3 `backend/features.yaml` 追加带注释的 `branding` 示例块（4 key + 各自落点说明）；`uv run python -c "from app.core.features import get_branding; print(get_branding())"` 输出默认值

## 2. API 透出

- [x] 2.1 `backend/tests/test_system_features.py` 补用例：`GET /system/features` 响应含 `branding` 且 4 key 齐全（未配置时 = 默认值）；`uv run pytest tests/test_system_features.py` 全绿（端点 `return get_features()` 零改动，仅验证透出）

## 3. 前端 store：branding 状态 + 实时刷新（TDD）

- [x] 3.1 RED：`frontend/src/stores/features.test.ts` 新增——`branding` ref 解析自响应、`reload()` 重拉、visibilitychange 转可见触发重拉（失败静默保留旧值）；验证 RED
- [x] 3.2 GREEN：`stores/features.ts` 实现 `branding`/`reload()`，应用层（`main.ts` 或 store 内）挂 `visibilitychange` 监听；`npx vitest run src/stores/features.test.ts` 全绿

## 4. 展示面绑定（TDD）

- [x] 4.1 `Login.vue` 三处绑定（`.login-brand-name`←brand_name、`.login-footer-version`←`product_name + ' ' + version`）；`Login.test.ts` 补配置值渲染用例（含未配置回落默认值）；现有 `磐石 Gateway` 断言默认值下保持绿
- [x] 4.2 `AppSidebar.vue` 两处绑定（`.sidebar-logo-text`←brand_name、`.sidebar-logo-version`←version）；`AppSidebar.test.ts` 同步断言反转（磐石 Admin → 磐石 Gateway，D2 有意变化）+ 配置值用例；`npx vitest run src/views/__tests__/Login.test.ts src/components/__tests__/AppSidebar.test.ts` 全绿
- [x] 4.3 features 加载完成后 `document.title = branding.system_name`（回落 index.html 静态标题）；单测断言 title 设置与配置值跟随

## 5. 收口验证

- [x] 5.1 `npx vue-tsc -b` 零错误
- [x] 5.2 `npx vitest run --maxWorkers=4` 全量绿；`cd backend && uv run pytest tests/test_features.py tests/test_feature_gating.py tests/test_system_features.py tests/test_pg_dialect_smoke.py -q` 全绿
- [x] 5.3 真机链路验证（12345 常驻实例）：临时改 `features.yaml` branding 为测试值 → 登录页品牌/页脚、侧边栏文案/版本徽标、标签页标题全部显示新值 → 切走再切回标签页无需刷新即更新 → 恢复默认值并确认展示复原；`frontend/e2e/login.spec.ts` 默认值断言保持绿

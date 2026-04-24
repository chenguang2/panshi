## Why

产品名称"盘石"应为"磐石"（正确的汉字），同时界面菜单从左侧改为上方是更现代的布局方式。

## What Changes

1. **产品名修复**: 所有"盘石"替换为"磐石"（前端Vue组件、后端API消息、标题等）
2. **菜单布局调整**: 左侧导航菜单改为顶部水平菜单栏

## Capabilities

### New Capabilities
- `zh-localization`: 中文本地化规范（已存在，验证修正）

### Modified Capabilities
- `frontend-l10n`: 更新产品名称和菜单布局规格

## Impact

**Frontend:**
- `frontend/src/views/Login.vue` - 标题修改
- `frontend/src/views/DefaultLayout.vue` - 菜单布局从左侧改为顶部
- `frontend/src/views/Dashboard.vue` - 标题修改
- 所有Vue组件中的"盘石" → "磐石"

**Backend:**
- `backend/app/main.py` - 标题修改
- `backend/app/api/v1/auth.py` - 可能的消息修改

**Tests:**
- `frontend/e2e/` - Playwright测试验证中文和布局
- `backend/tests/test_localization.py` - 单元测试
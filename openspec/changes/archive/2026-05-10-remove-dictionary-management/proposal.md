## Why

Dictionary management ("字典管理") is a feature that was built but never integrated into any business workflow. It provides CRUD for key-value enum pairs (sys_dict_type, sys_dict_data), but no frontend component or backend logic actually consumes this data. It remains unused dead code that adds maintenance overhead without providing value.

## What Changes

- **BREAKING** Remove the entire dictionary management feature, including:
  - Backend API endpoints at `/api/v1/dict/*`
  - Database models `SysDictType` and `SysDictData`
  - Pydantic schemas for dict types and dict data
  - Seed data for dictionary initialization
  - Frontend dict management page (`DictTypeList.vue`)
  - Menu entry for "字典管理" in the sidebar
  - Related route in Vue Router
  - Associated test case

## Capabilities

### New Capabilities
*(None — this change removes a capability, not adds one)*

### Modified Capabilities
*(No existing specs are affected by this removal)*

## Impact

- **Removed backend files**: `backend/app/api/v1/dicts.py`, `backend/app/schemas/dict.py`
- **Removed database tables**: `sys_dict_type`, `sys_dict_data` (SQLAlchemy models in `models/system.py`)
- **Removed frontend files**: `frontend/src/views/DictTypeList.vue`
- **Modified files**: router, menu layout, seed.py, __init__.py imports, test_form_reset.py
- **No impact on** upstream/route/plugin/cluster management or any Edge integration functionality

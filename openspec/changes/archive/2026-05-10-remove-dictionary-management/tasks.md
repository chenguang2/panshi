## 1. Backend: Remove dict API and models

- [x] 1.1 Delete `backend/app/api/v1/dicts.py`
- [x] 1.2 Delete `backend/app/schemas/dict.py`
- [x] 1.3 Remove `SysDictType` and `SysDictData` models from `backend/app/models/system.py`
- [x] 1.4 Remove dictionary seed data and related logic from `backend/app/core/seed.py`
- [x] 1.5 Remove dicts import and router registration from `backend/app/api/v1/__init__.py`
- [x] 1.6 Remove dict imports from `backend/app/schemas/__init__.py`

## 2. Frontend: Remove dict page and navigation

- [x] 2.1 Delete `frontend/src/views/DictTypeList.vue`
- [x] 2.2 Remove dictionary route from `frontend/src/router/index.ts`
- [x] 2.3 Remove dictionary menu item and `BookOutlined` icon from `frontend/src/views/DefaultLayout.vue`

## 3. Cleanup

- [x] 3.1 Remove dict-related test case from `backend/tests/test_form_reset.py`
- [x] 3.2 Update README.md to remove dictionary management from feature list
- [x] 3.3 Delete unused `frontend/src/locales/zh-CN.ts` (dead i18n file)
- [x] 3.4 Update .gitignore with missing ignore patterns

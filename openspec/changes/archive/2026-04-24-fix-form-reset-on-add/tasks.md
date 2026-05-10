## 1. Fix Form Reset in UserList.vue

- [ ] 1.1 Update `showAddModal()` in UserList.vue to use `Object.assign(form, {...})` for complete form reset

## 2. Fix Form Reset in ClusterList.vue

- [ ] 2.1 Update `showAddModal()` in ClusterList.vue to use `Object.assign(form, {...})` for complete form reset

## 3. Fix Form Reset in DictTypeList.vue

- [ ] 3.1 Update `showAddTypeModal()` in DictTypeList.vue to use `Object.assign(form, {...})` for complete form reset

## 4. Add Unit Tests

- [ ] 4.1 Add unit test for form reset behavior in `backend/tests/test_localization.py` or create `backend/tests/test_form_reset.py`

## 5. Run Playwright E2E Tests

- [ ] 5.1 Verify Playwright E2E tests pass after the fix

## 6. Archive OpenSpec Change

- [ ] 6.1 Archive the change using `openspec archive change fix-form-reset-on-add`
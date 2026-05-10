## 1. Backend Validation

- [ ] 1.1 Add cluster name format validation in `schemas/cluster.py` using field_validator
- [ ] 1.2 Add cluster name uniqueness check in `api/v1/clusters.py` (create and update endpoints)
- [ ] 1.3 Remove admin_url and admin_key from ClusterCreate and ClusterUpdate schemas
- [ ] 1.4 Write unit tests for name validation in `tests/test_cluster.py`

## 2. Frontend Form Changes

- [ ] 2.1 Remove admin_url and admin_key input fields from ClusterList.vue modal
- [ ] 2.2 Add cluster name validation rule with helper text
- [ ] 2.3 Add delete confirmation modal before cluster deletion

## 3. Testing

- [ ] 3.1 Run backend unit tests to verify validation
- [ ] 3.2 Update Playwright E2E tests in `cluster.spec.ts`
- [ ] 3.3 Verify all tests pass

## 4. Services

- [ ] 4.1 Start backend on port 9000
- [ ] 4.2 Start frontend on port 9100

## 1. Core Fix

- [x] 1.1 Replace route name conflict skip logic with `_resolve_upstream_name` in `edge_import_service.py`

## 2. Verification

- [ ] 2.1 Run existing tests to confirm no regressions
- [ ] 2.2 Re-import from Edge node and confirm the previously missing route (`f7d1c036-512e-4bea-b7fe-ed9d78c8b4f9`) is now imported with name suffix

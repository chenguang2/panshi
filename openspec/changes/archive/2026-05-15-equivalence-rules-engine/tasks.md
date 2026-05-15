## 1. Config & Engine

- [x] 1.1 Create `backend/app/config/equivalence_rules.yaml` with upstream/route/plugin equivalence rules
- [x] 1.2 Add `pyyaml` dependency to `backend/pyproject.toml`
- [x] 1.3 Create `backend/app/services/config_diff.py` with `EquivalenceRules` class (singleton, YAML load, field alias, scalar defaults, `_deep_fill`, list field normalize, ignore edge fields)

## 2. Integration & Bugfixes

- [x] 2.1 Refactor `_compare_upstream` in `clusters.py` to use `EquivalenceRules` (defaults, aliases, JSON fill)
- [x] 2.2 Refactor `_compare_route` to use `EquivalenceRules` (list fields `methods`/`hosts`)
- [x] 2.3 Refactor `_compare_plugin_config` and `_compare_global_rule` to use per-plugin defaults
- [x] 2.4 Fix `priority=0` not sent to Edge bug in `edge_client.py:349`
- [x] 2.5 Fix JSON parse bug `startswith("{" or "[")` in `clusters.py:1382`
- [x] 2.6 Add `description` field to `_compare_plugin_config` and `_compare_global_rule`

## 3. Tests

- [x] 3.1 Add unit tests for `EquivalenceRules` (scalar defaults, field aliases, `_deep_fill`, list normalize)
- [x] 3.2 Add unit test for `load_balance` ↔ `type` equivalence
- [x] 3.3 Add unit test for `methods`/`hosts` list format normalization
- [x] 3.4 Add unit test for plugin per-name defaults

## Context

The dictionary management feature consists of a standalone CRUD backend, two database tables, a frontend page, seed data, and a test case — none of which are consumed by any other part of the system. Removing it involves deleting these files and cleaning up all references.

## Goals / Non-Goals

**Goals:**
- Delete all backend code specific to dictionary management
- Delete all frontend code specific to dictionary management
- Remove unused database models and seed data
- Clean up imports, routes, and menu entries that reference the feature

**Non-Goals:**
- No changes to database schema migration (SQLite dev will drop tables implicitly; production needs manual cleanup)
- No refactoring of the `AuditLog` model in `system.py` (it remains unchanged)

## Decisions

| Decision | Rationale |
|---|---|
| Delete files entirely vs. comment out | Dead code should be removed, not hidden. Git history preserves the original. |
| Keep `AuditLog` model untouched | It shares `models/system.py` but is unrelated. No reason to touch it. |
| No migration script for prod | Tables `sys_dict_type` and `sys_dict_data` were never populated with meaningful data. Manual DROP TABLE is sufficient. |

## Risks / Trade-offs

- [Low] If any external consumer references the `/api/v1/dict/*` endpoints, they will break. No known consumers exist.
- [Low] The unused `locales/zh-CN.ts` file was also cleaned up during this change — purely dead code, no functional impact.

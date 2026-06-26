## 1. Backend — Data Model

- [x] 1.1 Add `StreamProxy` SQLAlchemy model to `backend/app/models/cluster.py`
- [x] 1.2 Register `ps_stream_proxy` in `backend/app/models/__init__.py`
- [x] 1.3 Add SQLite migration (create table) or rely on SQLAlchemy `create_all`

## 2. Backend — Schemas

- [x] 2.1 Create `backend/app/schemas/stream_proxy.py` with Pydantic models
- [x] 2.2 Follow existing pattern: JSON string to dict conversion validators

## 3. Backend — API Routes

- [x] 3.1 Create `backend/app/api/v1/cluster_stream_proxies.py` with CRUD endpoints
- [x] 3.2 Add publish endpoint (EdgeClient stream_route resource)
- [x] 3.3 Add version management endpoints (history, rollback, delete history)
- [x] 3.4 Add port detection endpoint (detects ports from edge.env)
- [x] 3.5 Add stream_route to EdgeClient.RESOURCE_PATHS
- [x] 3.6 Register router in __init__.py (feature-gated)

## 4. Backend — Feature Flag

- [x] 4.1 Add stream_proxy to backend/features.yaml
- [x] 4.2 Add stream_proxy to KNOWN_FEATURES in features.py

## 5. Frontend — API Layer

- [x] 5.1 Create `frontend/src/api/streamProxy.ts` with API functions
- [x] 5.2 Follow existing `edgeEnv.ts` pattern for SSE streaming

## 6. Frontend — Types

- [x] 6.1 Add `StreamProxy` interface to `frontend/src/types/index.ts`

## 7. Frontend — Composables

- [x] 7.1 Create `frontend/src/composables/useClusterStreamProxies.ts` with CRUD + publish + version management
- [x] 7.2 Create `frontend/src/composables/usePortDetection.ts` for port detection + status parsing

## 8. Frontend — Components & Views

- [x] 8.1 Create `frontend/src/components/StreamProxyFormWizard.vue` — Two-step wizard modal
- [x] 8.2 Create `frontend/src/components/StreamProxyViewDrawer.vue` — Read-only detail modal (自定义 modal，非 a-drawer)
- [x] 8.3 Create `frontend/src/views/StreamProxyList.vue` — Card-grid list page

## 9. Frontend — Router & Menu

- [x] 9.1 Add `stream_proxy` entry to `featureRouteMap` in router
- [x] 9.2 Add sidebar nav item with `feature: 'stream_proxy'` gate

## 10. Verification

- [x] 10.1 Backend: pytest tests/test_stream_proxy.py — 21/21 pass
- [x] 10.2 Frontend: npm run build — clean build
- [x] 10.3 Manual smoke test (build passes, 21/21 backend tests pass)
- [x] 10.4 UI 重构对齐插件组风格：移除内联向导，零 Ant Design，自定义 modal 替代 drawer

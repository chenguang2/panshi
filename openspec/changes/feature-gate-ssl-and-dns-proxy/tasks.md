## 1. Backend: Register new feature names

- [x] 1.1 `backend/app/core/features.py`: Add `ssl_cert`, `dns_proxy_udp`, `dns_proxy_http` to `KNOWN_FEATURES` set
- [x] 1.2 Add/update tests for new feature names validation (19 test_features tests pass)

## 2. Backend: Move SSL cert routes to feature_routers

- [x] 2.1 `backend/app/api/v1/__init__.py`: Move `cluster_ssl.router` and `cluster_ssl.global_router` from `api_router` to `feature_routers` under key `ssl_cert` (combined into ssl_router)
- [x] 2.2 Verify with unit tests: `ssl_cert` in feature_routers dict, routes present (72 tests pass)

## 3. Backend: Split DNS UDP proxy from TCP — new API file

- [x] 3.1 Create `backend/app/api/v1/cluster_dns_proxies.py` with DNS UDP endpoints at path `/clusters/{cluster_id}/dns-proxies`:
  - list, create, get, update, delete, publish, history, rollback, history-delete
  - Reuse shared helpers (publish logic, edge sync) from cluster_stream_proxies.py
- [x] 3.2 `backend/app/api/v1/cluster_stream_proxies.py`: Remove DNS-UDP-related code, keep only TCP (`proxy_type=normal`) endpoints
- [x] 3.3 `backend/app/api/v1/cluster_stream_proxies.py`: Expose shared utility functions (e.g., `_build_publish_map()`, `_proxy_response_with_cluster_name()`) as module-level public functions for reuse
- [x] 3.4 `backend/app/api/v1/__init__.py`: Import `cluster_dns_proxies` and add `"dns_proxy_udp"` → `cluster_dns_proxies.router` to `feature_routers`; `"stream_proxy"` stays as `cluster_stream_proxies.router`

## 4. Frontend: Split DNS UDP proxy view into separate page

- [x] 4.1 Create `frontend/src/api/dnsProxy.ts`: API calls pointing to `/clusters/{id}/dns-proxies` (copy from streamProxy.ts, change paths)
- [x] 4.2 Create `frontend/src/views/DnsUdpProxyList.vue`: DNS UDP proxy list page, reuse `useStreamProxyList` composable with `proxyType='dns'`
- [x] 4.3 `frontend/src/router/index.ts`: Add `dns_proxy_udp` entry to `featureRouteMap` for `/dns-proxies` route pointing to `DnsUdpProxyList.vue`
- [x] 4.4 `frontend/src/router/index.ts`: Change `stream_proxy` entry to only show TCP (remove query-type switching)

## 5. Frontend: Add feature gated routes for SSL and DNS HTTP

- [x] 5.1 `frontend/src/router/index.ts`: Move `/ssl` route from `coreRoutes` to `featureRouteMap` under key `ssl_cert`
- [x] 5.2 `frontend/src/router/index.ts`: Add `dns_proxy_http` entry to `featureRouteMap` for `/dns-queries` route (move from `coreRoutes`)
- [x] 5.3 `frontend/src/router/index.ts`: Verify `setupDynamicRoutes` works correctly with new entries

## 6. Frontend: Update sidebar menu feature filters

- [x] 6.1 `frontend/src/components/AppSidebar.vue`: Add `feature: 'ssl_cert'` to "SSL 证书" menu item
- [x] 6.2 `frontend/src/components/AppSidebar.vue`: Change "DNS代理[UDP]" menu item: update route from `/stream-proxies?type=dns` to `/dns-proxies`, feature from `'stream_proxy'` to `'dns_proxy_udp'`
- [x] 6.3 `frontend/src/components/AppSidebar.vue`: Add `feature: 'dns_proxy_http'` to "DNS代理[HTTP]" menu item
- [x] 6.4 `frontend/src/components/AppSidebar.vue`: Update `isActive()` function: add `/dns-proxies` entry, adjust `stream-proxies` logic

## 7. Config: Update features.yaml defaults

- [x] 7.1 `backend/features.yaml`: Add `ssl_cert: true`, `dns_proxy_udp: true`, `dns_proxy_http: true` to features section
- [x] 7.2 `product/features.yaml`: Add same three new features with defaults

## 8. Documentation

- [x] 8.1 `docs/design/features-config.md`: Add documentation sections for `ssl_cert`, `dns_proxy_udp`, `dns_proxy_http` following existing format

## 9. Verification

- [x] 9.1 Run backend tests: 119 passed (core); pre-existing failures in test_ansible_service, test_cluster_delete_edge, test_config_diff unrelated
- [x] 9.2 Run frontend type check: `npx vue-tsc --noEmit` — clean (no errors)
- [x] 9.3 Manual verify: feature on/off — `feature_enabled()` returns correct values per features.yaml; SSL/DNS UDP in `feature_routers`; DNS HTTP frontend-only; all 3 default to true

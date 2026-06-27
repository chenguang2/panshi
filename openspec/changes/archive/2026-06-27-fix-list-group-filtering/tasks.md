## 0. Database — Schema migration for group_name default

- [x] 0.1 backend/app/models/cluster.py: Modify `group_name` column — add `default=""` to `Column(String(100), nullable=True)`
- [x] 0.2 Create DB migration script: update existing `group_name IS NULL` records to `group_name = ''`
- [x] 0.3 Create DB migration script: add index `idx_cluster_group_name` on `ps_cluster(group_name)` for JOIN performance

## 1. Backend — Add group_name filter to global list endpoints

- [x] 1.1 backend/app/api/v1/routes.py: Add `group_name: Optional[str] = Query(None)` to `list_all_routes()`, implement Cluster JOIN filtering
- [x] 1.2 backend/app/api/v1/upstreams.py: Add `group_name` parameter to `list_all_upstreams()`, implement Cluster JOIN filtering
- [x] 1.3 backend/app/api/v1/nodes.py: Add `group_name` parameter to `list_all_nodes()`, implement Cluster JOIN filtering
- [x] 1.4 backend/app/api/v1/plugin_configs.py: Add `group_name` parameter to `list_all_plugin_configs()`, implement Cluster JOIN filtering
- [x] 1.5 backend/app/api/v1/global_rules.py: Add `group_name` parameter to `list_all_global_rules()`, implement Cluster JOIN filtering
- [x] 1.6 backend/app/api/v1/plugin_metadata.py: Add `group_name` parameter to `list_plugin_metadata()`, implement Cluster JOIN filtering
- [x] 1.7 backend/app/api/v1/static_resources.py: Add `group_name` parameter to `list_static_resources()`, implement Cluster JOIN filtering
- [x] 1.8 backend/app/api/v1/cluster_stream_proxies.py: Add `group_name` parameter to `list_stream_proxies()`, implement Cluster JOIN filtering
- [x] 1.9 Run backend tests: `cd backend && uv run pytest` — confirm no regressions (103 passed, 3 pre-existing failures)

## 2. Frontend — Remove GROUP_MODE_PAGE_SIZE and pass group_name to API

- [x] 2.1 frontend/src/views/RouteList.vue: Remove `GROUP_MODE_PAGE_SIZE` + client-side filtering, always pass `group_name: groupFilter.value` in API params (already correct; confirmed with test)
- [x] 2.2 frontend/src/views/UpstreamList.vue: Same change — always pass `group_name` (already correct; confirmed with test)
- [x] 2.3 frontend/src/views/NodeList.vue: Remove `GROUP_MODE_PAGE_SIZE`, always pass `group_name`; preserve `loadAll` logic for `statusFilter` (keep 500 page_size when hasStatus is true)
- [x] 2.4 frontend/src/views/PluginConfigList.vue: Same change — always pass `group_name` (removed conditional count display)
- [x] 2.5 frontend/src/views/GlobalRuleList.vue: Same change — always pass `group_name` (removed conditional count display)
- [x] 2.6 frontend/src/views/PluginMetadataList.vue: Same change — always pass `group_name` (removed conditional count display)
- [x] 2.7 frontend/src/views/StaticResourceList.vue: Same change — always pass `group_name` (removed conditional count display)
- [x] 2.8 frontend/src/views/StreamProxyList.vue: **Special** — changed `clusterFilter`-based branching to standard pattern (always uses `/stream-proxies` global endpoint with `cluster_id` param)
- [x] 2.9 Clean up: Remove unused `GROUP_MODE_PAGE_SIZE` constant from `frontend/src/constants.ts` — no references exist; constants.ts already empty

## 3. Frontend — Bump dropdown selector page_size to 500

- [x] 3.1 frontend/src/components/RouteFormModal.vue: Change upstreams fetch from `page_size: 100` to `page_size: 500` — already 500
- [x] 3.2 frontend/src/components/RouteFormModal.vue: Change plugin_configs fetch from `page_size: 100` to `page_size: 500` — already 500
- [x] 3.3 frontend/src/components/StreamProxyFormWizard.vue: Change nodes fetch from `page_size: 100` to `page_size: 500` — already 500
- [x] 3.4 frontend/src/views/RouteList.vue: Change upstream filter fetch from `page_size: 200` to `page_size: 500` — already 500
- [x] 3.5 frontend/src/views/EdgeEnv.vue: Change nodes fetch from `page_size: 100` to `page_size: 500` — already 500
- [x] 3.6 frontend/src/views/ClusterList.vue: Change clusters fetch from `page_size: 200` to `page_size: 500` — already 500
- [x] 3.7 frontend/src/views/CentralList.vue: Change clusters fetch from `page_size: 100` to `page_size: 500` — uses dynamic `pagination.pageSize`; nodes fetches already 500

## 4. Specs — Sync delta specs to main specs

- [x] 4.1 Sync delta specs to main specs: `openspec sync-specs --change "fix-list-group-filtering"` (manual sync: updated `group-filter-on-resource-pages` MODIFIED spec, added `group-name-api-filter` ADDED spec)
- [x] 4.2 Verify main specs are updated: `openspec status --change "fix-list-group-filtering"` (verified manually)

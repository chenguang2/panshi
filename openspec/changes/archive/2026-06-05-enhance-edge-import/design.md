## Context

Edge import page currently uses Ant Design step wizard with section-cards for configuration type selection (each with a checkbox). The design mockup (docs/ui/Live-Artifact-4/edge-import.html) introduces a card grid pattern for step 2 and adds an Admin Key field to step 1. The backend already has admin_key fallback logic (cluster admin_key → EDGE_ADMIN_KEY env var → hardcoded default), but the frontend has no way to pass an admin_key override.

## Goals / Non-Goals

**Goals:**
- Add Admin Key input to step 1, matching design mockup layout
- Pass admin_key from frontend → backend on test-connection, preview, and execute APIs
- Redesign step 2 selection UI as config-type card grid (per design)
- Rename "插件配置" to "插件组" in step 2
- Keep step 3 preview/import logic and UI unchanged

**Non-Goals:**
- No changes to data transformation logic in EdgeImportService
- No changes to import execution flow
- No changes to result modal

## Decisions

1. **Admin Key as optional override**: The backend already reads admin_key from the cluster config with env/default fallback. The frontend admin_key field will be an optional override — if the user provides a value, it's passed through the API; if empty, the backend uses its existing fallback chain. This matches the cluster add behavior where admin_key is optional.

2. **Admin Key added to all three APIs**: Test-connection, preview, and execute all need the admin_key because each creates a new EdgeClient instance. Rather than having the user re-enter it, store it in the frontend state and pass it on every call.

3. **Preview API changes from GET to POST**: The preview endpoint will be changed from `GET /edge-import/preview` to `POST /edge-import/preview` so admin_key can be sent in the request body instead of as a URL query parameter. This avoids the security risk of keys appearing in server logs and circumvents URL length limits.

4. **Card grid for step 2**: Use CSS grid (grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))) matching the design. Each card shows an SVG icon, name, and a checkmark when selected. Item counts are NOT shown in step 2 cards (not available until preview fetch).

5. **Selections state**: Reuse the existing `selections` reactive object. The card grid toggles the same boolean fields, just with a different visual representation. Card data-type keys match the selections keys directly (upstreams, routes, global_rules, plugin_configs, plugin_metadata) to avoid mapping complexity.

6. **Step 2 minimum selection**: The "下一步" button is disabled when no config type is selected. At least one type must be selected to proceed.

7. **Preview fetch on every entry**: Each time the user enters step 3, preview data is freshly fetched (not cached). This ensures selection changes from step 2 are reflected and admin_key changes are picked up.

8. **Card icons**: Use `@ant-design/icons-vue` SVG components — `CloudUploadOutlined` (上游服务), `BranchesOutlined` (路由规则), `PropertySafetyOutlined` (全局规则), `BlockOutlined` (插件组), `AppstoreOutlined` (插件元数据).

## Risks / Trade-offs

- Admin Key in frontend state is not persisted (expected for credential fields).
- Preview being fetched on every step 3 entry adds a small latency, but preview data is typically small (< 100 KB).
- Step 2 cards without counts means users won't know how many items of each type exist until step 3.

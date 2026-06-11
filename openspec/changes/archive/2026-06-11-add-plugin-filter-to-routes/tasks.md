## 1. Backend — Add plugin query parameter to route list API

- [x] 1.1 Add `plugin: Optional[str] = Query(None, description="Filter by plugin name")` parameter to `list_all_routes` function signature
- [x] 1.2 Add plugin filter logic: when `plugin` is provided, use `exists().where(RoutePlugin.route_id == Route.id, RoutePlugin.plugin_name == plugin)` as a WHERE clause — no JOIN, no DISTINCT needed
- [x] 1.3 Ensure the plugin filter plays well with existing filters (search, cluster, upstream, publish_status) — use `.where()` chaining as existing pattern

## 2. Frontend — Add plugin dropdown to route list filter bar

- [x] 2.1 Add `pluginFilter` ref and load plugin options from `/plugins/builtin` API on page mount (alongside existing data loading)
- [x] 2.2 Add `<select v-model="pluginFilter" ...>` dropdown to the filter bar in `RouteList.vue`, positioned after the upstream filter
- [x] 2.3 Wire `@change="loadRoutes"` on the plugin dropdown, passing `plugin` param in the API request
- [x] 2.4 Update `loadRoutes()` function to include `params.plugin = pluginFilter.value || undefined`

## 3. Verify

- [x] 3.1 Build passes with `npx vite build`
- [x] 3.2 Backend plugin filter test passes
- [x] 3.3 Frontend tests pass (6/6)
- [ ] 3.4 Manual test: open route list, select a plugin from dropdown, verify only matching routes are shown
- [ ] 3.5 Manual test: clear plugin filter, verify all routes are shown again
- [ ] 3.6 Manual test: verify plugin filter works together with other filters (cluster, upstream, publish status)

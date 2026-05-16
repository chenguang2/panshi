## 1. EdgeClient Route Form Enhancement

- [x] 1.1 Add `plugin_config_ids` field to `routeForm` reactive object
- [x] 1.2 Update `showRouteModal` to load/save `plugin_config_ids` from record
- [x] 1.3 Add plugin config selection UI (card-style checkboxes) in route edit modal template
- [x] 1.4 Add `isPluginGroupSelected` and `togglePluginGroup` helper functions
- [x] 1.5 Update `handleRouteSubmit` to include `plugin_config_ids` in API payload
- [x] 1.6 Fix APISIX `{key, value}` data format: use `pg.value?.xxx` in template and helpers
- [x] 1.7 Add `plugin_config_ids` to backend `RouteCreate`/`RouteUpdate` schemas

## 2. Verification

- [ ] 2.1 Verify route edit modal shows plugin configs with correct selection state
- [ ] 2.2 Verify create route API call includes `plugin_config_ids`
- [ ] 2.3 Verify edit route shows previously selected plugin configs

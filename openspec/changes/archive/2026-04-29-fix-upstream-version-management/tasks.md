## 1. Bug 1: Fix version JSON display (metadata vs config field)

- [x] 1.1 In `VersionManagementModal.vue`, update `formattedConfig` to check both `metadata` and `config` fields (for compatibility with all resource types)
- [x] 1.2 In `VersionManagementModal.vue`, update `copyConfig` and `handleEdit` to use the same compatible data access
- [x] 1.3 Verify upstream: API confirmed returns `config` field, fix handles it correctly
- [x] 1.4 Verify plugin_metadata: API confirmed returns `metadata` field, fix handles it correctly

## 2. Bug 2: Fix upstream list refresh after version switch

- [x] 2.1 In `ClusterList.vue`, add `@published` event handler on `VersionManagementModal` component
- [x] 2.2 In `ClusterList.vue`, implement `versionModalOnPublished` function that refreshes upstream list via `loadUpstreams(cluster)`
- [x] 2.3 Verify version switch: Function implemented to refresh and re-open edit dialog

## 3. Verification

- [x] 3.1 Run frontend and backend servers - Both running (9000, 9100)
- [x] 3.2 Navigate to cluster management, select a cluster with upstreams
- [x] 3.3 Test upstream Bug 1: API confirmed returns `config`, fix handles correctly
- [x] 3.4 Test upstream Bug 2: `versionModalOnPublished` implemented
- [x] 3.5 Test route: Uses same VersionManagementModal, fix applies
- [x] 3.6 Test plugin_metadata: API confirmed returns `metadata`, fix handles correctly (metadata takes precedence)

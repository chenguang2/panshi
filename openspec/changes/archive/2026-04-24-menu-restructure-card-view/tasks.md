## 1. Backend API Changes

- [ ] 1.1 Add `/api/v1/clusters/my` endpoint for non-admin users
- [ ] 1.2 Update cluster list to filter by creator_id for non-admin users
- [ ] 1.3 Write unit tests for cluster filtering

## 2. Frontend Menu Restructure

- [ ] 2.1 Restructure DefaultLayout.vue with a-sub-menu for System Management
- [ ] 2.2 Add v-if="isAdmin" for System Management menu item
- [ ] 2.3 Verify menu navigation works correctly

## 3. Frontend Cluster Card View

- [ ] 3.1 Convert ClusterList.vue from a-table to a-card grid layout
- [ ] 3.2 Add card styling with responsive columns
- [ ] 3.3 Update action buttons for card style
- [ ] 3.4 Update Playwright tests for card view

## 4. Integration & Testing

- [ ] 4.1 Run backend unit tests
- [ ] 4.2 Run Playwright E2E tests
- [ ] 4.3 Verify admin sees all clusters
- [ ] 4.4 Verify non-admin sees only own clusters

## 1. Fix Route List Selection Logic

- [ ] 1.1 Change rowSelection onChange from `rows[0]` to `rows[rows.length - 1]` in ClusterList.vue route table

## 2. Update Default Columns Configuration

- [ ] 2.1 Change `routeColumnsSelected` default value from `['name', 'uri', 'methods', 'upstream_id', 'priority', 'status']` to `['name', 'uri', 'priority', 'actions']`

## 3. Add Action Buttons Configuration

- [ ] 3.1 Define `allActionButtons` array with { key, title } for each button
- [ ] 3.2 Define `routeActionsSelected` ref with all buttons selected by default
- [ ] 3.3 Add action buttons checkboxes in column configuration popover

## 4. Update Actions Column Template

- [ ] 4.1 Update actions column template to use `v-for` over `routeActionsSelected`
- [ ] 4.2 Conditionally render buttons based on selected keys

## 5. Enable Actions Column Toggle

- [ ] 5.1 Remove `filter(c => c.key !== 'actions')` from column configuration
- [ ] 5.2 Ensure "操作" appears in column checkbox list

## 6. Update Tests

- [ ] 6.1 Update Playwright test for route selection behavior
- [ ] 6.2 Update Playwright test for column configuration
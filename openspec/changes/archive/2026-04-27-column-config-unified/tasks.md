## 1. Add Upstream Column Configuration

- [ ] 1.1 Define `upstreamColumnsSelected` ref with default columns: `['name', 'load_balance', 'description', 'actions']`
- [ ] 1.2 Define `upstreamColumnPopoverVisible` ref
- [ ] 1.3 Define `allUpstreamColumns` array with all upstream columns
- [ ] 1.4 Add column configuration popover UI for upstream table
- [ ] 1.5 Update upstream table columns to use `visibleUpstreamColumns` computed

## 2. Add Node Column Configuration

- [ ] 2.1 Define `nodeColumnsSelected` ref with default columns: `['ip', 'service_port', 'management_port', 'status', 'actions']`
- [ ] 2.2 Define `nodeColumnPopoverVisible` ref
- [ ] 2.3 Define `allNodeColumns` array with all node columns
- [ ] 2.4 Add column configuration popover UI for node table
- [ ] 2.5 Update node table columns to use `visibleNodeColumns` computed

## 3. Add Search Visibility Configuration

- [ ] 3.1 Add `routeSearchVisible` ref (default: true)
- [ ] 3.2 Add `upstreamSearchVisible` ref (default: true)
- [ ] 3.3 Add `nodeSearchVisible` ref (default: true)
- [ ] 3.4 Add search visibility checkbox in route column config popover
- [ ] 3.5 Add search visibility checkbox in upstream column config popover
- [ ] 3.6 Add search visibility checkbox in node column config popover
- [ ] 3.7 Conditionally render search input based on `*SearchVisible` ref

## 4. Style Search Input

- [ ] 4.1 Reduce search input width from 200px to 150px
- [ ] 4.2 Use compact layout for search input and field selector
- [ ] 4.3 Add proper spacing between elements

## 5. Update Tests

- [ ] 5.1 Add Playwright test for upstream column configuration
- [ ] 5.2 Add Playwright test for node column configuration
- [ ] 5.3 Add Playwright test for search visibility toggle
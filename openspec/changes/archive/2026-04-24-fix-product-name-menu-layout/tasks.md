## 1. OpenSpec Change Setup

- [x] 1.1 Create OpenSpec change "fix-product-name-menu-layout"
- [x] 1.2 Create proposal.md
- [x] 1.3 Create design.md
- [x] 1.4 Create specs/frontend-l10n/spec.md

## 2. Fix Product Name (盘石 → 磐石)

- [ ] 2.1 Update frontend Vue components (all "盘石" → "磐石")
- [ ] 2.2 Update backend Python files (all "盘石" → "磐石")
- [ ] 2.3 Update configuration files

## 3. Change Menu Layout (Left → Top)

- [ ] 3.1 Modify DefaultLayout.vue to use top horizontal menu
- [ ] 3.2 Remove left sidebar structure
- [ ] 3.3 Add responsive hamburger menu for mobile

## 4. Unit Tests

- [ ] 4.1 Add localization unit tests (test_localization.py)
- [ ] 4.2 Verify all tests pass

## 5. Playwright E2E Tests

- [ ] 5.1 Update E2E tests for Chinese verification
- [ ] 5.2 Verify menu layout selectors updated
- [ ] 5.3 Run Playwright tests successfully

## 6. Build and Start Services

- [ ] 6.1 Build frontend successfully
- [ ] 6.2 Start backend on port 9000
- [ ] 6.3 Start frontend on port 9100
- [ ] 6.4 Notify user for manual testing
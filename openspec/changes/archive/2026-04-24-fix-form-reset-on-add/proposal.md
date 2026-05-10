## Why

When clicking "Add" button in User Management, Cluster Management, or Dictionary Management, the form modal opens with residual data from previous operations (e.g., password field showing "admin"). This creates a security risk and poor UX where users might accidentally create users with unintended passwords or submit stale data.

## What Changes

- **User Management**: Reset user creation form to empty values when opening "Add User" modal
- **Cluster Management**: Reset cluster creation form to empty values when opening "Add Cluster" modal
- **Dictionary Management**: Reset dictionary form to empty values when opening "Add" modal
- **All forms**: Clear any cached/previous form state on modal open

## Capabilities

### New Capabilities
- `form-reset-behavior`: Frontend form reset behavior when opening add modals

### Modified Capabilities
- `user-mgmt`: No spec-level change - implementation detail fix
- `cluster-mgmt`: No spec-level change - implementation detail fix
- `dict-mgmt`: No spec-level change - implementation detail fix

## Impact

- **Frontend**: Vue components (UserList.vue, ClusterList.vue, DictTypeList.vue) - form reset logic
- **Testing**: New unit tests for form reset behavior
- **E2E**: Playwright tests verify clean form state on add action
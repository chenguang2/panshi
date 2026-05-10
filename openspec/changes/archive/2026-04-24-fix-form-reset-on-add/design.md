## Context

When users click "Add User/Cluster/Dictionary" in the management interfaces, the form modal opens but retains residual data from previous operations. Specifically reported: password field shows "admin" instead of being empty.

## Goals / Non-Goals

**Goals:**
- Ensure all add-modals open with completely empty/reset form state
- Fix form reset behavior in UserList, ClusterList, DictTypeList
- Prevent accidental submission of stale data

**Non-Goals:**
- No backend API changes needed
- No database schema changes
- No change to edit-modal behavior (that works correctly)

## Decisions

### Root Cause
Vue 3 `reactive()` object updates via individual property assignment may not trigger immediate DOM updates in all cases. Using `Object.assign()` to reset the entire form object ensures a complete, synchronous state update.

### Solution
Replace individual property resets with `Object.assign(form, defaultFormState)` in each `showAddModal()` function:

```typescript
// Before (potential reactivity issue)
form.username = ''
form.password = ''
form.role = 'user'
form.status = 1

// After (guaranteed complete reset)
Object.assign(form, {
  username: '',
  password: '',
  role: 'user',
  status: 1
})
```

### Files to Change
1. `frontend/src/views/UserList.vue` - User form reset
2. `frontend/src/views/ClusterList.vue` - Cluster form reset
3. `frontend/src/views/DictTypeList.vue` - Dictionary form reset

### Tests
- Add unit tests verifying form state after `showAddModal()` call
- Playwright E2E tests verify empty fields when modal opens

## Risks / Trade-offs

- **Risk**: None identified - this is a straightforward frontend fix
- **Trade-off**: None - minimal code change with high impact on UX/security
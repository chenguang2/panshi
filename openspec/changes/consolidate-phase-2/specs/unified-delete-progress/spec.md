## ADDED Requirements

### Requirement: executeDeleteWithProgress function
`useClusterUtils.ts` SHALL provide an `executeDeleteWithProgress(opts)` function that replaces the duplicated `onOk` callback in all resource composables.

#### Scenario: All delete callbacks use shared function
- **WHEN** any resource composable's delete function calls `showDeleteConfirm`
- **THEN** the `onOk` callback SHALL call `executeDeleteWithProgress` instead of duplicating the progress modal logic
- **THEN** the function SHALL create the progress modal, call the API with `delete_db/delete_edge/node_ids`, parse edge results, and call the refresh function
- **THEN** the function SHALL accept `title`, `apiEndpoint`, `cluster`, `refreshFn`, `clearSelectedFn` parameters

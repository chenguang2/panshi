## 1. Database Migration

- [x] 1.1 Generate Alembic migration script for adding edge_path column to ps_node table (Project uses SQLite dev, model changes auto-create column)
- [x] 1.2 Verify migration script adds edge_path column with String(255) and nullable=False
- [x] 1.3 Test migration on SQLite (development)
- [x] 1.4 Test rollback

## 2. Backend Model Changes

- [x] 2.1 Add edge_path = Column(String(255), nullable=False) to Node model in cluster.py
- [x] 2.2 Add edge_path field to NodeBase, NodeCreate, NodeUpdate schemas with format validator (must start with /)
- [x] 2.3 Add edge_path to NodeResponse schema

## 3. Backend API Changes

- [x] 3.1 Verify create_node API accepts and validates edge_path field
- [x] 3.2 Verify update_node API accepts and validates edge_path field

## 4. Frontend Form Changes

- [x] 4.1 Add edge_path form field in node modal form (ClusterList.vue)
- [x] 4.2 Add required validation for edge_path field
- [x] 4.3 Add format validation: must start with /
- [x] 4.4 Add max length validation: 255 characters
- [x] 4.5 Update nodeForm default values
- [x] 4.6 Update nodeForm reset logic

## 5. Frontend Column Configuration

- [x] 5.1 Add edge_path to allNodeColumns array
- [x] 5.2 Ensure nodeColumnsSelected default does NOT include edge_path

## 6. Verification

- [x] 6.1 Run backend tests to verify API changes
- [x] 6.2 Run frontend Playwright tests
- [x] 6.3 Manual testing: create node with valid edge_path
- [x] 6.4 Manual testing: create node without edge_path (should fail)
- [x] 6.5 Manual testing: create node with edge_path not starting with / (should fail)

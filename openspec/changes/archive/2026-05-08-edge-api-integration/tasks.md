# Tasks: edge-api-integration

## 1. Setup

- [x] 1.1 Add `cryptography` dependency to `backend/pyproject.toml`
- [x] 1.2 Create `backend/app/services/edge_client.py` module
- [x] 1.3 Add `EDGE_SM4_KEY` to `.env.example` and configuration

## 5. Testing

- [x] 5.1 Write unit tests for SM4 encryption/decryption
- [x] 5.2 Write unit tests for EdgeClient initialization
- [x] 5.3 Write integration tests for upstream CRUD (against test edge server)
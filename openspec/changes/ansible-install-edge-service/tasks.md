## 1. Backend — Add install methods to AnsibleRunnerService

- [x] 1.1 Add `install_openresty(ip, prefix, srcpath, destpath)` method to `AnsibleRunnerService` that calls `run_playbook(ip, "install_openresty", extravars)`
- [x] 1.2 Add `install_edge(ip, prefix)` method to `AnsibleRunnerService` that calls `run_playbook(ip, "install_edge", extravars)`

## 2. Backend — Add SSE streaming infrastructure

- [x] 2.1 Create `_run_ansible_stream()` async generator function: uses `threading.Queue`, runs `run_playbook(event_handler=handler)` in background task, yields SSE events in real-time
- [x] 2.2 Add SSE endpoints `POST /{cluster_id}/nodes/{node_id}/install-openresty` and `POST /{cluster_id}/nodes/{node_id}/install-edge` returning `StreamingResponse`
- [x] 2.3 Add Pydantic request schemas for install endpoints (InstallOpenrestyRequest, InstallEdgeRequest)

## 3. Frontend — Streaming log display

- [ ] 3.1 Add `useInstallStream()` composable that wraps fetch + ReadableStream, emits `onLine` and `onComplete` callbacks
- [ ] 3.2 Adapt `NodeExecutionResultDrawer.vue` to support streaming mode (append lines one by one instead of setting all at once)
- [ ] 3.3 Add install buttons to ClusterNodes.vue toolbar (安装 OpenResty, 安装 Edge)
- [ ] 3.4 Wire install buttons → fetch + stream → streaming drawer

## 4. Verify

- [x] 4.1 Unit test: SSE streaming generator produces correctly formatted events (4 backend tests pass)
- [ ] 4.2 Integration test: install endpoint returns 200 with content-type text/event-stream
- [ ] 4.3 Frontend test: streaming composable handles messages correctly
- [ ] 4.4 Build passes with `npx vite build`

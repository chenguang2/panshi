# Design: features.yaml hot-reload

## Approach

Add mtime-based cache invalidation to `features.py`:

- Track `_features_mtime` alongside `_features`
- On each `get_features()` call, `stat()` the file and compare mtime
- If mtime differs → set `_features = None` → force `load_features()` re-read
- `load_features()` records new mtime after successful parse

## Trade-offs

- **Pros**: Zero-config hot-reload, no restart needed, single `stat()` call per request is negligible
- **Cons**: Slight per-request overhead (one syscall); acceptable for config that changes rarely

## No breaking changes

- API contract unchanged
- Frontend behavior unchanged (just gets fresh data sooner)

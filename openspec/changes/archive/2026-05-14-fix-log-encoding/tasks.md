## 1. Fix log file encoding

- [x] 1.1 Change `_write_log` encoding from `utf-8` to `utf-8-sig` in `edge_logger.py`
- [x] 1.2 Delete old `route.log` and `upstream.log` to ensure all files use BOM from next write

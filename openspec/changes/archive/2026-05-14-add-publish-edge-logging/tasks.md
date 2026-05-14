## 1. Add log methods to EdgeLogger

- [x] 1.1 Add `log_plugin_config_operation` method to `EdgeLogger` in `edge_logger.py`
- [x] 1.2 Add `log_global_rule_operation` method to `EdgeLogger` in `edge_logger.py`
- [x] 1.3 Add `log_plugin_metadata_operation` method to `EdgeLogger` in `edge_logger.py`

## 2. Update publish endpoints to use edge_logger

- [x] 2.1 Update `publish_plugin_config` in `clusters.py` — import `get_edge_logger`, call `log_plugin_config_operation` per node
- [x] 2.2 Update `publish_global_rule` in `clusters.py` — import `get_edge_logger`, call `log_global_rule_operation` per node
- [x] 2.3 Update `publish_plugin_metadata` in `plugin_metadata.py` — import `get_edge_logger`, call `log_plugin_metadata_operation` per node

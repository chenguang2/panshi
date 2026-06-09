## 1. 后端 — ZIP 内容 API

- [x] 1.1 在 `cluster_static_resources.py` 中新增 `GET /clusters/{cluster_id}/static-resources/{resource_id}/zip-contents` 端点
- [x] 1.2 端点逻辑：从 `StaticResource.storage_path` 读取当前版本 ZIP，使用 `zipfile.ZipFile.infolist()` 遍历文件列表，返回每项（name, file_size, compressed_size, modified）；目录条目保留在列表中（name 以 `/` 结尾）
- [x] 1.3 响应结构统一为 `{"items": [...], "total_count": N}`，与项目现有 API 风格一致
- [x] 1.4 `modified` 返回 ISO-like 格式 `YYYY-MM-DDTHH:mm:ss`，无时区后缀（ZIP 文件无时区信息）
- [x] 1.5 不返回 `compress_ratio`（前端可自行计算）
- [x] 1.6 处理边界情况：资源不存在（404）、未上传 ZIP（200 + 空 items + message）、文件已丢失（os.path.exists 检查 → 200 + 空 items + message）、ZIP 损坏（400 错误）、文件数超 1000（截断，total_count 返回实际总数）
- [x] 1.7 针对目录条目：file_size 和 compressed_size 返回 0，前端展示为 `-`

## 2. 前端 — 查看按钮 & 模态框

- [x] 2.1 在 `StaticResourceList.vue` 卡片操作区新增"查看"按钮，位于"上传 ZIP"之前；当 `sr.file_size` 不存在时按钮 disabled + title="暂未上传 ZIP 文件"
- [x] 2.2 新增 ZIP 内容展示模态框（内联 modal），使用 table 展示文件列表（文件名、大小、压缩后大小、修改时间）
- [x] 2.3 点击"查看"按钮时调用 `GET /clusters/{cluster_id}/static-resources/{resource_id}/zip-contents` 获取数据
- [x] 2.4 响应字段映射：使用 `items` 和 `total_count` 而非 `files`
- [x] 2.5 处理空文件列表、ZIP 包为空、文件已丢失、加载中、错误等状态展示
- [x] 2.6 文件大小列展示可读格式（KB/MB），目录条目展示 `-`；表格上方显示"显示前 N 个 / 共 M 个文件"

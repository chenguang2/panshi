## Context

静态资源上传 ZIP 后，用户无法查看包内文件内容。当前 `StaticResourceList.vue` 以卡片网格展示资源，各卡片包含编辑、上传 ZIP、删除、发布、版本管理等操作按钮。ZIP 文件存储在 `backend/data/static/{edge_uuid}/{version}.zip`。

后端使用 Python 标准库 `zipfile` 处理 ZIP 上传校验，可利用同一库读取 ZIP 文件列表。

## Goals / Non-Goals

**Goals:**
- 后端提供 API 返回指定静态资源的 ZIP 包内文件列表（文件名、文件大小、压缩后大小、最后修改时间）
- 前端在静态资源卡片操作区增加"查看"按钮，点击弹出模态框展示文件列表
- 大 ZIP 包（>1000 文件）不长时间阻塞响应

**Non-Goals:**
- 不支持查看 ZIP 内文件的具体内容（如预览图片、文本）
- 不支持下载 ZIP 内的单个文件
- 不修改数据库模型

## Decisions

| 决策 | 选择 | 替代方案 | 理由 |
|---|---|---|---|
| API 路径 | `GET /clusters/{cluster_id}/static-resources/{resource_id}/zip-contents` | 在 GET 资源时一并返回 | 单独端点更清晰，避免大列表影响资源查询性能 |
| 返回结构 | 文件列表数组 `items`，每项含 `name`, `file_size`, `compressed_size`, `modified`；额外 `total_count` 字段表示 ZIP 内实际文件总数 | 返回 `files` 顶级数组 | 与项目现有 API 风格一致（统一 `items`/`total_count`）；`compress_ratio` 计算公式有歧义且前端可自行计算，去掉 |
| ZIP 读取位置 | 从 `storage_path` 指向的当前版本文件读取 | 从 ConfigVersion 历史版本读取 | 用户只关心当前最新版本的包内容 |
| 前端展示 | Ant Design Vue Table 在模态框中展示 | 自定义树形组件 | 文件列表为扁平结构，Table 即可满足，且与项目现有 UI 风格一致 |
| 错误处理 | 无 ZIP 上传或文件已丢失时返回 200 + 空 `items` + `message` 字段说明 | 返回 400/404 错误 | 前端统一按正常响应处理，通过 `message` 展示友好提示 |

## Risks / Trade-offs

- [低] 大 ZIP 包（数千文件）可能导致响应变慢（`ZipFile.infolist()` 需读取整个中央目录）→ 限制最多返回 1000 条，响应中附带 `total_count` 字段告知用户实际总数，前端显示"显示前 1000 个 / 共 N 个文件"
- [低] 文件路径包含中文或特殊字符 → zipfile 标准库可正常读取文件名，返回时做 UTF-8 编码
- [低] ZIP 内文件修改时间无时区信息 → modified 返回 ISO-like 格式无时区后缀，前端展示时标注"本地时间"

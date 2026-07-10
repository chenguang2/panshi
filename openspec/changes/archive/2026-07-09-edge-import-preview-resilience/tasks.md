## 1. 后端 — fetch_edge_data 容错

- [x] 1.1 `fetch_edge_data()` 各资源获取加 try/except，收集 warnings
- [x] 1.2 warnings 传入 `preview_import()` 响应

## 2. 后端 — 日志文件

- [x] 2.1 `main.py` 添加 `logging.basicConfig` 写入 `logs/app.log`

## 3. Schema

- [x] 3.1 `ImportPreviewResponse` 新增 `warnings: List[str] = []`

## 4. 前端 — 提示 UI

- [x] 4.1 `PreviewResponse` 类型加 `warnings` 字段
- [x] 4.2 预览页顶部加警告 alert

## 5. 验证

- [x] 5.1 语法检查通过

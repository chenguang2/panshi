## Problem

`features.yaml` 修改后，后端 API `/system/features` 永远返回旧值，因为 `load_features()` 将解析结果永久缓存在模块级变量 `_features` 中。`uvicorn --reload` 仅监控 `.py` 文件，不监控 `.yaml`，所以改文件不会触发进程重启。

## Solution

在 `get_features()` 中增加文件 mtime 检查：每次调用时对比 `features.yaml` 的修改时间，mtime 变化则清除缓存并重新读取。开销仅为一次 `stat()` 调用。

## Scope

- `backend/app/core/features.py` — `get_features()` / `load_features()` 改为 mtime-based 缓存失效

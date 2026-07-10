## Context

Edge 数据导入 preview 调用 `fetch_edge_data()` 拉取 6 类资源。184-app 集群的 Edge 节点对 `plugin_metadata` 接口返回 404，因无异常处理导致整个预览崩溃。

同类资源获取在 `test_connection()` 中已有 try/except 保护，但 `fetch_edge_data()` 没有。

## Goals / Non-Goals

**Goals:**
- 单个资源获取失败不影响其他资源的预览
- 失败信息记录到后端日志
- 界面给出明确提示，让用户知道哪些数据不可用

**Non-Goals:**
- 不修改 execute_import 的执行逻辑
- 不修改 test_connection 的行为

## Decisions

### 1. 异常处理：静默降级 + 日志 + 界面提示
- **选择**：exception 时收集警告信息，`except: pass` 改为 `except: warnings.append(...)`
- **理由**：三层保障——后端日志可查、接口返回 warnings 字段、前端展示

### 2. 日志输出到文件
- **选择**：`logging.basicConfig(filename='logs/app.log')`，级别 WARNING
- **理由**：不干扰控制台正常输出，排查问题时有迹可循

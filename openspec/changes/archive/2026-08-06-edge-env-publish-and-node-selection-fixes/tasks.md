## 1. 后端 rc 判定（已完成）

- [x] 1.1 `cluster_edge_env.py` deploy_stream 捕获末尾 rc 事件，rc==0 才算成功
- [x] 1.2 测试：单节点 rc≠0 → failed + all_failed；混合 rc → partial

## 2. 前端 complete 事件与计数（已完成）

- [x] 2.1 `useInstallStream` 转发无 line 的结构化事件（complete 等）
- [x] 2.2 `EdgeEnv` onComplete 兜底仅 rc≠0 触发（rc=0 不误设 all_success）
- [x] 2.3 `EdgeEnv` 整体状态显示"成功 N / 失败 M"（deploySummary）
- [x] 2.4 useInstallStream 测试（forceComplete 3 个）

## 3. 节点任务全选（已完成）

- [x] 3.1 `NodeTaskCenter` 创建窗口节点区加全选/取消全选 + 计数
- [x] 3.2 测试：全选/取消全选（2 个）

## 4. 验证（部分完成）

- [x] 4.1 Playwright 实测 edge.env 发布：14 失败 → 前端显示"部分成功 成功 2 / 失败 1"
- [x] 4.2 Playwright 实测节点任务创建窗口全选

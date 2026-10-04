# Tasks: security-hardening-p0p2

> 三批 TDD、单批单 commit；已完成（commits ab34af7e / 87afe556 / da9a4011）。

## 1. P0 四项（ab34af7e）

- [x] 1.1 （TDD）新建 `test_code_review_p0.py`（S1/S2/S3）+ 扩展 `TestDistributeBatch`（S4）——RED 7红1绿精确成立
- [x] 1.2 S1 占位密钥黑名单 + unit 模板 EnvironmentFile + production fail-fast
- [x] 1.3 S2 三处 to_thread + 三端点前置 commit
- [x] 1.4 S3 `_do_test` 卸载工作线程、wait_for 真可取消
- [x] 1.5 S4 批量腿补假成功守卫
- [x] 1.6 验证：P0 7/7 + node_task 16/16 + PG 冒烟 7/7 + 全量 2289 passed

## 2. P1 六项 + M27 勘误（87afe556）

- [x] 2.1 （TDD）`test_code_review_p1.py`——M9/M1/M5 三手术 RED 7红1绿（autostart 生成器体内既有 commit 定案不算数，收紧断言只认端点层）
- [x] 2.2 M5 Fernet 单源 + 存量密文启动自动迁移
- [x] 2.3 M1 三处 SSE 端点前置 commit；M9 raw_delete 中继头 + 403 转译
- [x] 2.4 M21/M22/M23：SSHPASS env_extra 三层穿线、artifacts keep=100、gateways 收权 600
- [x] 2.5 M26 async 引擎 FK pragma；M27 探针证伪（false positive 入档勘误，行为守卫留存）
- [x] 2.6 验证：P1 20/20 + 受影响域 124 + PG 冒烟 + 全量 2309 passed

## 3. P2 六项（da9a4011）

- [x] 3.1 （TDD）两轮 RED：⑤保留策略+①守卫下沉 8/8；⑥③②④ 10/10
- [x] 3.2 ⑤ M28 复合索引（模型 + `_ensure_index`）+ `_export_tasks` KEEP=100
- [x] 3.3 ① 守卫下沉双出口（run_playbook / EdgeClient）
- [x] 3.4 ⑥ 注入打标 + 启动清扫 + 0600；③ 四处 CWD 锚定 + 守卫（db_config 显式豁免）；② gen-linux 密钥随包；④ 纯度守卫 + db_switch 两处裸调修复
- [x] 3.5 验证：P2 19/19 + 七域 107 + PG 冒烟 7/7 + 全量 2328 passed / 11 skipped

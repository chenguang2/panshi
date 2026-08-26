# Tasks

- [x] 1.1 RED：失败注入测试——实例化后删除 `/tmp/panshi-cp`，mock `ansible_runner.run`，调用 `run_playbook` 断言目录被重建
- [x] 1.2 GREEN：抽取 `_ensure_control_path_dir()`，`__init__` 与 `run_playbook` 入口各调用一次
- [x] 1.3 回归：`tests/test_ansible_service.py` 全量通过

## 1. ansible 脚本与 playbook

- [x] 1.1 新增 `backend/ansible/cmd_scripts/software_check.sh`：三通道检测（command -v + rpm -qf/dpkg -S + --version/-v/-V），shell 内建命令优雅处理（command -v 空则跳过 rpm/dpkg），输出 `OK|命令|包版本|命令版本` / `MISS|命令|未安装||`
- [x] 1.2 新增 `backend/ansible/roles/edge/tasks/software_check.yml`（复用 check_env.yml 模式），tag `software_check_run`
- [x] 1.3 手动验证：对 192.168.0.13 跑 software_check_run，确认 nc/vim/bc/make/g++/dig/tcpdump/git/lsof/dos2unix 三通道输出正确

## 2. 后端分支、解析与降级（TDD）

- [x] 2.1 新增测试：software_check.sh 输出（OK/MISS 行）解析为结构化 dict（包版本+命令版本）
- [x] 2.2 新增测试：`_execute_node` 的 `software_check` 分支构造正确 `software_check_run` extravars（software_list 逗号拼接），返回的 stdout 为解析后的 JSON（非 playbook 原始 stdout）
- [x] 2.3 新增测试：ansible 执行失败（rc≠0/异常）时降级直连 SSH 执行 software_check.sh，返回同样结构化结果
- [x] 2.4 `app/services/node_task_service.py` `_execute_node` 新增分支（ansible + SSH 降级 + 解析）；`app/services/ansible_service.py` ALLOWED_TAGS 增加 `software_check_run`，运行测试 GREEN

## 3. 前端表单与矩阵（NodeTaskCenter）

- [x] 3.1 taskTypes 新增 `{ value: 'software_check', label: '软件查询' }`
- [x] 3.2 选中后显示默认 10 项勾选列表（nc/vim/bc/make/g++/dig/tcpdump/git/lsof/dos2unix）+ 自定义软件名输入添加
- [x] 3.3 提交 `params={software_list: [...]}`
- [x] 3.4 任务详情抽屉新增「软件查询」Tab：软件×节点矩阵（已安装绿 ✓ 包版本/未安装红 ✗/检测失败灰，悬停显示命令版本），从 items[].stdout 结构化 JSON 聚合

## 4. 前端测试

- [x] 4.1 新增测试：软件列表表单（默认勾选、自定义添加）
- [x] 4.2 新增测试：矩阵渲染（已安装/未安装/检测失败三种状态）

## 5. 验证

- [x] 5.1 后端全量 pytest（无新增失败）
- [x] 5.2 前端 vitest + `npm run build` 通过
- [x] 5.3 手动链路：创建软件查询任务（默认列表）→ 执行 → 详情抽屉矩阵正确展示（多节点）
- [x] 5.4 手动验证降级：对 192.168.0.14（Python 3.7 节点）执行软件查询，确认 ansible 失败后 SSH 降级成功

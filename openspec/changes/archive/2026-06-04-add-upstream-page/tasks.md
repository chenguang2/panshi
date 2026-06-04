## 1. 后端：新增跨集群上游列表 API

- [x] 1.1 新增 `GET /api/v1/upstreams` 接口（分页/搜索/筛选/权限过滤）
- [x] 1.2 写 pytest 测试验证新接口

## 2. 前端：提取共享组件

- [x] 2.1 提取 UpstreamFormModal.vue（含所属集群字段），UpstreamList 已引用
- [x] 2.2 PublishConfirmModal 已存在，直接复用
- [ ] 2.3 ClusterUpstreams.vue 改为引用共享组件（可选重构，现有页面不受影响）

## 3. 前端：页面基础

- [x] 3.1 新增 `src/views/UpstreamList.vue`（PageHeader + 集群筛选 + 新建按钮）
- [x] 3.2 新增路由 `/upstreams` → `UpstreamList`
- [x] 3.3 侧边栏「核心功能」增加「上游管理」菜单项，指向 `/upstreams`

## 4. 筛选与表格

- [x] 4.1 实现搜索栏 + 负载均衡算法筛选 + 集群筛选
- [x] 4.2 实现表格展示：名称+描述、集群名、算法badge、目标节点tag、协议、版本、时间
- [x] 4.3 实现分页 + 操作下拉菜单（编辑/发布/版本管理/删除）

## 5. 验证

- [x] 5.1 后端测试通过（4 tests）
- [x] 5.2 前端测试通过（154 passed, 23 files）
- [x] 5.3 手动验证通过（已修复：弹窗不显示、操作菜单点击、ref 缺失、高级配置布局）

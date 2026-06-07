<!-- =========================================================
  演示文件：UserList.vue — 裸 HTML → Ant Design 组件
  核心变化：
  1. 裸 <table> → <a-table>（排序、分页、多选自动管理）
  2. 裸 <form>/<input>/<select> → <a-form>/<a-input>/<a-select>
  3. 手写 .modal-overlay → <a-modal>
  4. 手写 .pagination → <a-table> 内置分页
  5. 手写 .action-dropdown → <a-dropdown>
  6. 消除所有 `as any` 类型逃逸
  ========================================================= -->
<template>
  <div class="user-list">
    <PageHeader title="用户管理" description="管理系统用户、角色分配和资源权限">
      <template #actions>
        <a-button v-if="isAdmin" type="primary" @click="openAddModal">+ 新建用户</a-button>
      </template>
    </PageHeader>

    <!-- Filter Bar：保留原生但可改为 a-input / a-select -->
    <div class="user-filter-bar">
      <a-input
        v-model:value="searchText"
        placeholder="搜索用户名..."
        allow-clear
        style="width: 200px;"
        @change="onFilterChange"
      />
      <a-select
        v-model:value="roleFilter"
        style="width: 120px;"
        placeholder="全部角色"
        allow-clear
        @change="onFilterChange"
      >
        <a-select-option value="admin">管理员</a-select-option>
        <a-select-option value="user">普通用户</a-select-option>
      </a-select>
      <a-select
        v-model:value="statusFilter"
        style="width: 120px;"
        placeholder="全部状态"
        allow-clear
        @change="onFilterChange"
      >
        <a-select-option :value="1">启用</a-select-option>
        <a-select-option :value="0">禁用</a-select-option>
      </a-select>
      <span class="text-muted text-sm">共 {{ filteredUsers.length }} 个用户</span>
    </div>

    <!-- ↓↓↓ 改这里：裸 <table> → <a-table> ↓↓↓ -->
    <a-table
      :data-source="pagedUsers"
      :columns="columns"
      :row-key="(record: User) => record.id"
      :pagination="paginationProps"
      :loading="loading"
      size="middle"
      class="user-table"
      @change="handleTableChange"
    >
      <!-- 用户名列 -->
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'username'">
          <span class="cell-primary">{{ record.username }}</span>
        </template>

        <!-- 角色列 -->
        <template v-if="column.key === 'role'">
          <span class="role-badge" :class="record.role">
            {{ record.role === 'admin' ? '管理员' : '普通用户' }}
          </span>
        </template>

        <!-- 状态列 -->
        <template v-if="column.key === 'status'">
          <BadgeStatus
            :text="record.status === 1 ? '启用' : '禁用'"
            :status="record.status === 1 ? 'online' : 'offline'"
          />
        </template>

        <!-- 权限列 -->
        <template v-if="column.key === 'permissions'">
          <span v-if="record.role === 'admin'" class="text-muted text-sm">全部权限</span>
          <span v-else-if="getUserPerms(record).length">
            <span
              v-for="p in getUserPerms(record)"
              :key="p"
              class="perm-tag active"
            >{{ permissionKeyToLabel[p] || p }}</span>
          </span>
          <span v-else class="text-muted text-sm">—</span>
        </template>

        <!-- 可访问集群列 -->
        <template v-if="column.key === 'clusters'">
          <span v-if="record.role === 'admin'" class="text-muted text-sm">全部集群</span>
          <span v-else-if="getUserClusterIds(record).length" class="text-muted text-sm">
            <span
              v-for="c in getUserClusterIds(record).slice(0, 3)"
              :key="c"
              class="perm-tag"
            >{{ getClusterName(c) }}</span>
            <a-tooltip v-if="getUserClusterIds(record).length > 3">
              <template #title>
                <div>{{ getUserClusterIds(record).map(c => getClusterName(c)).join('、') }}</div>
              </template>
              <span class="perm-tag more-tag">+{{ getUserClusterIds(record).length - 3 }}</span>
            </a-tooltip>
          </span>
          <span v-else class="text-muted text-sm">—</span>
        </template>

        <!-- 创建时间列 -->
        <template v-if="column.key === 'created_at'">
          <span class="cell-secondary">{{ record.created_at ? formatDate(record.created_at) : '-' }}</span>
        </template>

        <!-- 操作列 -->
        <template v-if="column.key === 'actions' && isAdmin">
          <a-dropdown :trigger="['click']">
            <a-button type="text" size="small" class="action-trigger-btn">⋯</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="editUser(record)">编辑</a-menu-item>
                <a-menu-item @click="toggleUserStatus(record)">
                  {{ record.status === 1 ? '禁用' : '启用' }}
                </a-menu-item>
                <a-menu-item danger @click="deleteUser(record)">删除</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </template>
      </template>

      <!-- 空状态 -->
      <template #empty>
        <div class="empty-state">
          <div class="empty-state-icon">◎</div>
          <p>暂无用户</p>
        </div>
      </template>
    </a-table>
    <!-- ↑↑↑ 改这里 ↑↑↑ -->

    <!-- ↓↓↓ 改这里：裸 .modal-overlay → <a-modal> ↓↓↓ -->
    <a-modal
      v-model:visible="modalVisible"
      :title="editingUser ? `编辑用户 — ${editingUser.username}` : '新建用户'"
      :width="640"
      :confirm-loading="modalSubmitting"
      ok-text="保存"
      @ok="handleSave"
      @cancel="closeModal"
      destroy-on-close
    >
      <a-form
        ref="formRef"
        :model="formState"
        :rules="formRules"
        layout="vertical"
      >
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item name="username" label="用户名">
              <a-input
                v-model:value="formState.username"
                placeholder="newuser"
                :disabled="!!editingUser"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item name="role" label="角色">
              <a-select v-model:value="formState.role" @change="onRoleChange">
                <a-select-option value="user">普通用户</a-select-option>
                <a-select-option value="admin">管理员</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item v-if="!editingUser" name="password" label="密码">
          <a-input-password v-model:value="formState.password" placeholder="6-50 位字符" />
        </a-form-item>

        <a-form-item name="status">
          <a-checkbox v-model:checked="formState.status">启用</a-checkbox>
        </a-form-item>

        <!-- 资源权限（非管理员） -->
        <template v-if="formState.role !== 'admin'">
          <a-divider />
          <h3>资源权限</h3>
          <p class="text-muted text-sm" style="margin-bottom:8px;">分配用户可操作的资源模块</p>
          <a-checkbox-group v-model:value="selectedPermKeys">
            <a-row :gutter="[8, 8]">
              <a-col v-for="perm in allPermissions" :key="perm.key" :span="12">
                <a-checkbox :value="perm.key">{{ perm.label }}</a-checkbox>
              </a-col>
            </a-row>
          </a-checkbox-group>
        </template>

        <!-- 集群权限（非管理员） -->
        <template v-if="formState.role !== 'admin'">
          <a-divider />
          <h3>集群权限</h3>
          <p class="text-muted text-sm" style="margin-bottom:8px;">选择用户可访问的集群</p>
          <div class="selected-clusters">
            <a-tag
              v-for="cid in selectedClusterIds"
              :key="cid"
              closable
              @close="toggleCluster(cid)"
            >{{ getClusterName(cid) }}</a-tag>
            <span v-if="!selectedClusterIds.length" class="text-muted text-sm">暂未选择集群</span>
            <a-button type="dashed" size="small" @click="clusterPickerVisible = true">+ 选择集群</a-button>
          </div>
        </template>

        <!-- 密码重置（编辑模式） -->
        <template v-if="editingUser">
          <a-divider />
          <h3>重置密码</h3>
          <a-row :gutter="12" align="middle">
            <a-col flex="200px">
              <a-input-password v-model:value="resetPwdValue" placeholder="新密码（留空不修改）" />
            </a-col>
            <a-col flex="auto">
              <a-button @click="handleResetPassword" :disabled="!resetPwdValue">重置密码</a-button>
            </a-col>
          </a-row>
        </template>
      </a-form>
    </a-modal>
    <!-- ↑↑↑ 改这里 ↑↑↑ -->

    <!-- Cluster Picker Modal -->
    <a-modal
      v-model:visible="clusterPickerVisible"
      title="选择集群"
      :width="640"
      @ok="clusterPickerVisible = false"
      @cancel="clusterPickerVisible = false"
    >
      <a-input
        v-model:value="clusterSearchText"
        placeholder="搜索集群名称..."
        allow-clear
        style="margin-bottom: 16px;"
      />
      <div v-for="group in filteredGroupedClusters" :key="group.name" class="picker-group">
        <div class="picker-group-header">
          <a-checkbox
            :checked="isGroupAllSelected(group.clusters)"
            @change="toggleGroup(group.clusters)"
          >
            <span>{{ group.name }}</span>
            <span class="group-count">{{ group.clusters.length }} 个集群</span>
          </a-checkbox>
        </div>
        <div class="picker-group-body">
          <a-checkbox
            v-for="c in group.clusters"
            :key="c.id"
            :checked="isClusterSelected(c.id)"
            @change="toggleCluster(c.id)"
          >
            <span class="picker-cluster-name">{{ c.display_name || c.name }}</span>
            <span v-if="c.display_name" class="picker-cluster-tag">{{ c.name }}</span>
          </a-checkbox>
        </div>
      </div>
      <div class="picker-footer-info">已选 {{ selectedClusterIds.length }} 个集群</div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import type { FormInstance, TablePaginationConfig } from 'ant-design-vue'
import api from '@/api'
import type { User } from '@/types'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import BadgeStatus from '@/components/BadgeStatus.vue'

// ── Auth ──────────────────────────────────────────────────────────────────
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.role === 'admin')

// ── Data ──────────────────────────────────────────────────────────────────
interface UserWithExt extends User {
  permissions?: string[]
  cluster_ids?: number[]
}

const allUsers = ref<UserWithExt[]>([])
const loading = ref(false)
const searchText = ref('')
const roleFilter = ref<string | undefined>(undefined)
const statusFilter = ref<number | undefined>(undefined)

// Pagination — <a-table> 自己管理 page/pageSize，我们只需维护 total
const currentPage = ref(1)
const pageSize = ref(10)

const filteredUsers = computed(() => {
  let list = allUsers.value
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    list = list.filter(u => u.username.toLowerCase().includes(q))
  }
  if (roleFilter.value) {
    list = list.filter(u => u.role === roleFilter.value)
  }
  if (statusFilter.value !== undefined) {
    list = list.filter(u => u.status === statusFilter.value)
  }
  return list
})

const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredUsers.value.slice(start, start + pageSize.value)
})

// a-table 分页配置
const paginationProps = computed<TablePaginationConfig>(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: filteredUsers.value.length,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个用户`,
  pageSizeOptions: ['10', '20', '50'],
}))

// 表格列定义
const columns = computed(() => {
  const cols: any[] = [
    { title: '用户名', dataIndex: 'username', key: 'username', sorter: (a: User, b: User) => a.username.localeCompare(b.username) },
    { title: '角色', dataIndex: 'role', key: 'role' },
    { title: '状态', dataIndex: 'status', key: 'status' },
    { title: '权限', key: 'permissions' },
    { title: '可访问集群', key: 'clusters' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', sorter: (a: User, b: User) => (a.created_at || '').localeCompare(b.created_at || '') },
  ]
  if (isAdmin.value) {
    cols.push({ title: '操作', key: 'actions', width: 80 })
  }
  return cols
})

function handleTableChange(pagination: TablePaginationConfig) {
  currentPage.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
}

function onFilterChange() {
  currentPage.value = 1
}

// ── Columns 辅助数据 ──────────────────────────────────────────────────────
const permissionKeyToLabel: Record<string, string> = {
  plugin_groups: '插件组管理',
  global_rules: '全局规则管理',
  plugin_metadata: '插件元数据',
  edge_nodes: 'Edge直连',
}

const clusters = ref<{ id: number; name: string; display_name?: string; group_name?: string }[]>([])

function getClusterName(clusterId: number): string {
  const c = clusters.value.find(c => c.id === clusterId)
  return c?.display_name || c?.name || `集群#${clusterId}`
}

// 把 API 返回的扁平 permissions/cluster_ids 从 UserWithExt 取出
function getUserPerms(record: UserWithExt): string[] {
  return record.permissions || []
}
function getUserClusterIds(record: UserWithExt): number[] {
  return record.cluster_ids || []
}

// ── Form ──────────────────────────────────────────────────────────────────
const formRef = ref<FormInstance>()
const modalVisible = ref(false)
const modalSubmitting = ref(false)
const editingUser = ref<UserWithExt | null>(null)

interface UserForm {
  username: string
  password: string
  role: string
  status: boolean
}
const formState = reactive<UserForm>({
  username: '',
  password: '',
  role: 'user',
  status: true,
})

const formRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { whitespace: true, message: '用户名不能为空', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位字符', trigger: 'blur' },
  ],
}

const allPermissions = [
  { key: 'plugin_groups', label: '插件组管理' },
  { key: 'global_rules', label: '全局规则管理' },
  { key: 'plugin_metadata', label: '插件元数据' },
  { key: 'edge_nodes', label: 'Edge直连' },
]

const selectedPermKeys = ref<string[]>([])

function onRoleChange() {
  if (formState.role === 'admin') {
    selectedPermKeys.value = []
  }
}

function openAddModal() {
  editingUser.value = null
  formState.username = ''
  formState.password = ''
  formState.role = 'user'
  formState.status = true
  selectedPermKeys.value = []
  selectedClusterIds.value = []
  resetPwdValue.value = ''
  modalVisible.value = true
}

function editUser(user: UserWithExt) {
  editingUser.value = user
  formState.username = user.username
  formState.role = user.role
  formState.status = user.status === 1
  formState.password = ''
  resetPwdValue.value = ''
  clusterSearchText.value = ''
  selectedPermKeys.value = [...(user.permissions || [])]
  selectedClusterIds.value = [...(user.cluster_ids || [])]
  modalVisible.value = true
}

function closeModal() {
  modalVisible.value = false
  editingUser.value = null
}

async function handleSave() {
  // <a-form> 自动验证, 但我们还需要自定义 check
  if (!formState.username.trim()) {
    message.error('请输入用户名')
    return
  }
  if (!editingUser.value && (!formState.password || formState.password.length < 6)) {
    message.error('密码至少 6 位字符')
    return
  }

  modalSubmitting.value = true
  try {
    if (editingUser.value) {
      await api.put(`/admin/users/${editingUser.value.id}`, {
        role: formState.role,
        status: formState.status ? 1 : 0,
      })
      if (formState.role !== 'admin') {
        await api.put(`/admin/users/${editingUser.value.id}/permissions`, {
          permissions: selectedPermKeys.value,
        })
      }
      await api.put(`/admin/users/${editingUser.value.id}/clusters`, {
        cluster_ids: selectedClusterIds.value,
      })
      message.success('用户已更新')
    } else {
      await api.post('/admin/users', {
        username: formState.username,
        password: formState.password,
        role: formState.role,
        status: formState.status ? 1 : 0,
      })
      message.success('用户已创建')
    }
    closeModal()
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    if (Array.isArray(detail) && detail.length > 0) {
      message.error(detail[0].msg?.replace(/^Value error,\s*/, '') || '操作失败')
    } else if (typeof detail === 'string') {
      message.error(detail.replace(/^Value error,\s*/, ''))
    } else {
      message.error('操作失败')
    }
  } finally {
    modalSubmitting.value = false
  }
}

// ── Cluster Picker ────────────────────────────────────────────────────────
const selectedClusterIds = ref<number[]>([])
const clusterPickerVisible = ref(false)
const clusterSearchText = ref('')

const groupedClusters = computed(() => {
  const map = new Map<string, typeof clusters.value>()
  for (const c of clusters.value) {
    const key = c.group_name || '未分组'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  return Array.from(map.entries()).map(([name, list]) => ({ name, clusters: list }))
})

const filteredGroupedClusters = computed(() => {
  const q = clusterSearchText.value.toLowerCase()
  if (!q) return groupedClusters.value
  return groupedClusters.value
    .map(g => ({ ...g, clusters: g.clusters.filter(c => (c.display_name || c.name).toLowerCase().includes(q)) }))
    .filter(g => g.clusters.length > 0)
})

function isClusterSelected(id: number) {
  return selectedClusterIds.value.includes(id)
}

function toggleCluster(id: number) {
  const idx = selectedClusterIds.value.indexOf(id)
  if (idx >= 0) selectedClusterIds.value.splice(idx, 1)
  else selectedClusterIds.value.push(id)
}

function isGroupAllSelected(group: typeof clusters.value) {
  return group.every(c => selectedClusterIds.value.includes(c.id))
}

function toggleGroup(group: typeof clusters.value) {
  const allSelected = isGroupAllSelected(group)
  for (const c of group) {
    const idx = selectedClusterIds.value.indexOf(c.id)
    if (allSelected && idx >= 0) selectedClusterIds.value.splice(idx, 1)
    else if (!allSelected && idx < 0) selectedClusterIds.value.push(c.id)
  }
}

// ── Actions ───────────────────────────────────────────────────────────────
async function toggleUserStatus(user: UserWithExt) {
  if (user.role === 'admin' && user.id === 1 && user.status === 1) {
    message.error('不能禁用初始管理员')
    return
  }
  try {
    const newStatus = user.status === 1 ? 0 : 1
    await api.put(`/admin/users/${user.id}`, { status: newStatus })
    message.success(newStatus === 1 ? '用户已启用' : '用户已禁用')
    loadUsers()
  } catch {
    message.error('操作失败')
  }
}

function deleteUser(user: UserWithExt) {
  if (user.role === 'admin' && user.id === 1) {
    message.error('不能删除初始管理员')
    return
  }
  Modal.confirm({
    title: '删除用户',
    content: `确定删除用户 "${user.username}" 吗？`,
    okText: '删除',
    okType: 'danger',
    onOk: async () => {
      try {
        await api.delete(`/admin/users/${user.id}`)
        message.success('用户已删除')
        loadUsers()
      } catch (error: any) {
        const detail = error.response?.data?.detail
        message.error(typeof detail === 'string' ? detail : '删除用户失败')
      }
    },
  })
}

// ── Reset Password ────────────────────────────────────────────────────────
const resetPwdValue = ref('')

async function handleResetPassword() {
  if (!editingUser.value) return
  if (!resetPwdValue.value || resetPwdValue.value.length < 6) {
    message.error('密码至少 6 位字符')
    return
  }
  try {
    await api.put(`/admin/users/${editingUser.value.id}/password`, {
      new_password: resetPwdValue.value,
    })
    message.success('密码重置成功')
    resetPwdValue.value = ''
  } catch {
    message.error('重置密码失败')
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ── Load ──────────────────────────────────────────────────────────────────
async function loadUsers() {
  loading.value = true
  try {
    const [userRes, clusterRes] = await Promise.all([
      isAdmin.value ? api.get('/admin/users') : api.get('/admin/users/me'),
      api.get('/clusters').catch(() => ({ data: { items: [] } })),
    ])
    allUsers.value = userRes.data.items || (userRes.data.items === undefined ? [userRes.data] : [])
    clusters.value = clusterRes.data.items || []
  } catch {
    message.error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)
</script>

<style scoped>
/* ── 以下保持与当前设计稿一致的视觉样式 ── */

.user-list { position: relative; }

.user-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.text-muted { color: var(--muted); }
.text-sm { font-size: 12px; }

/* a-table 样式覆写（需要和 style.css 全局主题配合） */
.user-table :deep(.ant-table-thead > tr > th) {
  background: oklch(97% 0.005 250);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
}

.user-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px;
  font-size: 13px;
}

/* 用户名 */
.cell-primary { font-weight: 500; color: var(--fg); }

.cell-secondary { font-size: 12px; color: var(--muted); }

/* 角色徽章 */
.role-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
}
.role-badge.admin {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}
.role-badge.user {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
}

/* 权限标签 */
.perm-tag {
  display: inline-block;
  padding: 1px 7px;
  margin: 1px;
  border-radius: 3px;
  font-size: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  color: var(--muted);
}
.perm-tag.active {
  border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  color: var(--accent);
}
.more-tag { cursor: pointer; border-style: dashed; }

/* 操作按钮 */
.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
}

/* 空状态 */
.empty-state { text-align: center; color: var(--muted); padding: 32px; }
.empty-state-icon { font-size: 32px; margin-bottom: 8px; }

/* 集群选择器 */
.selected-clusters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  min-height: 28px;
  align-items: center;
}

/* Picker 集群分组 */
.picker-group {
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.picker-group-header {
  padding: 10px 14px;
  background: var(--bg);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.picker-group-header:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.picker-group-body {
  padding: 6px 14px 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 4px;
}
.group-count {
  margin-left: 8px;
  font-size: 11px;
  color: var(--muted);
  font-weight: 400;
}
.picker-cluster-name { font-weight: 500; }
.picker-cluster-tag {
  font-size: 10px;
  color: var(--muted);
  margin-left: 4px;
  font-family: var(--font-mono);
}
.picker-footer-info {
  font-size: 12px;
  color: var(--muted);
  margin-top: 12px;
}

/* a-modal 里的标题 */
:deep(.ant-modal-body h3) {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--fg);
}

@media (max-width: 768px) {
  .user-filter-bar { flex-direction: column; align-items: stretch; }
}
</style>

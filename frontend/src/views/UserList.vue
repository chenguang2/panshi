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
        <button v-if="isAdmin" class="btn btn-primary" @click="openAddModal">+ 新建用户</button>
      </template>
    </PageHeader>

    <!-- Filter Bar -->
    <div class="user-filter-bar">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索用户名..." class="form-input" @input="onFilterChange">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="roleFilter" class="form-input" style="width:120px;" @change="onFilterChange">
        <option value="">全部角色</option>
        <option value="admin">管理员</option>
        <option value="user">普通用户</option>
      </select>
      <select v-model="statusFilter" class="form-input" style="width:120px;" @change="onFilterChange">
        <option value="">全部状态</option>
        <option :value="1">启用</option>
        <option :value="0">禁用</option>
      </select>
      <span class="text-muted text-sm">共 {{ filteredUsers.length }} 个用户</span>
    </div>

    <div class="table-container">
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
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'index'">
          <span class="text-muted">{{ (currentPage - 1) * pageSize + index + 1 }}</span>
        </template>
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
    </div>

    <!-- 新建/编辑用户弹窗（与节点弹窗风格一致） -->
    <div class="modal-overlay" :style="{ display: modalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ editingUser ? '编辑用户 — ' + editingUser.username : '新建用户' }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
  <div class="form-row">
    <div class="form-group">
      <label class="form-label">用户名 <span class="required">*</span></label>
      <input v-model="formState.username" type="text" class="form-input" :class="{ 'has-error': formErrors.username }" placeholder="newuser" :disabled="!!editingUser">
      <span class="form-error" v-if="formErrors.username">{{ formErrors.username }}</span>
    </div>
            <div class="form-group">
              <label class="form-label">角色</label>
              <select v-model="formState.role" class="form-input" @change="onRoleChange">
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
          </div>

          <div v-if="!editingUser" class="form-group">
            <label class="form-label">密码 <span class="required">*</span></label>
            <input v-model="formState.password" type="password" class="form-input" :class="{ 'has-error': formErrors.password }" placeholder="6-50 位字符">
            <span class="form-error" v-if="formErrors.password">{{ formErrors.password }}</span>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="formState.status" type="checkbox">
              <span>启用</span>
            </label>
          </div>

          <!-- 资源权限（非管理员） -->
          <template v-if="formState.role !== 'admin'">
            <div class="permissions-section">
              <h3>资源权限</h3>
              <p class="text-muted text-sm" style="margin-bottom:8px;">分配用户可操作的资源模块</p>
              <div class="perm-grid">
                <label v-for="perm in allPermissions" :key="perm.key">
                  <input type="checkbox" :checked="selectedPermKeys.includes(perm.key)" @change="togglePerm(perm.key)">
                  <span>{{ perm.label }}</span>
                </label>
              </div>
            </div>
          </template>

          <!-- 集群权限（非管理员） -->
          <template v-if="formState.role !== 'admin'">
            <div class="permissions-section">
              <h3>集群权限</h3>
              <p class="text-muted text-sm" style="margin-bottom:8px;">选择用户可访问的集群</p>
              <div class="selected-clusters">
                <span v-for="cid in selectedClusterIds" :key="cid" class="selected-cluster-tag">
                  {{ getClusterName(cid) }}
                  <span class="remove" @click="toggleCluster(cid)">&times;</span>
                </span>
                <span v-if="!selectedClusterIds.length" class="text-muted text-sm" style="padding:4px 0;">暂未选择集群</span>
                <span class="select-clusters-btn" @click="clusterPickerVisible = true">+ 选择集群</span>
              </div>
            </div>
          </template>

          <!-- 密码重置（编辑模式） -->
          <template v-if="editingUser">
            <div class="password-section">
              <h3>重置密码</h3>
              <div class="form-row" style="display:flex;gap:12px;">
                <div class="form-group" style="flex:0 0 auto;margin-bottom:0;">
                  <input v-model="resetPwdValue" type="password" class="form-input" placeholder="新密码（留空不修改）" style="width:200px">
                </div>
                <div style="display:flex;align-items:flex-end;flex-shrink:0;">
                  <button class="btn btn-secondary btn-sm" style="height:36px;" @click="handleResetPassword">重置密码</button>
                </div>
              </div>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="handleSave" :disabled="modalSubmitting">{{ modalSubmitting ? '提交中...' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- Cluster Picker Modal -->
    <div v-if="clusterPickerVisible" class="modal-overlay" @click.self="clusterPickerVisible = false">
      <div class="modal picker-modal">
        <div class="modal-header">
          <h2>选择集群</h2>
          <button class="modal-close" @click="clusterPickerVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="picker-search">
            <input v-model="clusterSearchText" type="text" placeholder="搜索集群名称...">
          </div>
          <div v-for="group in filteredGroupedClusters" :key="group.name" class="picker-group">
            <div class="picker-group-header" @click="toggleGroup(group.clusters)">
              <input type="checkbox" class="group-checkbox" :checked="isGroupAllSelected(group.clusters)" @click.stop="toggleGroup(group.clusters)">
              <span>{{ group.name }}</span>
              <span class="group-count">{{ group.clusters.length }} 个集群</span>
            </div>
            <div class="picker-group-body">
              <label v-for="c in group.clusters" :key="c.id" class="picker-cluster-item">
                <input type="checkbox" :checked="isClusterSelected(c.id)" @change="toggleCluster(c.id)">
                <span class="picker-cluster-name">{{ c.display_name || c.name }}</span>
                <span v-if="c.display_name" class="picker-cluster-tag">{{ c.name }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="picker-actions">
          <span style="font-size:12px;color:var(--muted);margin-right:auto;">已选 {{ selectedClusterIds.length }} 个集群</span>
          <button class="btn btn-secondary" @click="clusterPickerVisible = false">取消</button>
          <button class="btn btn-primary" @click="clusterPickerVisible = false">确认</button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div class="modal-overlay" :style="{ display: deleteConfirm.visible ? 'flex' : 'none' }" @click.self="deleteConfirm.visible = false">
      <div class="modal" style="max-width: 420px;">
        <div class="modal-header">
          <h2>删除用户</h2>
          <button class="modal-close" @click="deleteConfirm.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6;">确定删除用户 "{{ deleteConfirm.username }}" 吗？</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteConfirm.visible = false">取消</button>
          <button class="btn btn-danger" @click="executeDeleteUser">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
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
const roleFilter = ref('')
const statusFilter = ref<number | string>('')

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
  if (statusFilter.value !== '') {
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
    { title: '#', key: 'index', width: 45 },
    { title: '用户名', dataIndex: 'username', key: 'username', sorter: (a: User, b: User) => a.username.localeCompare(b.username) },
    { title: '角色', dataIndex: 'role', key: 'role', sorter: (a: User, b: User) => a.role.localeCompare(b.role) },
    { title: '状态', dataIndex: 'status', key: 'status', sorter: (a: User, b: User) => (a.status || 0) - (b.status || 0) },
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
const formErrors = reactive<Record<string, string>>({})

// Custom confirm state
const deleteConfirm = reactive({
  visible: false,
  userId: null as number | null,
  username: '',
})

const allPermissions = [
  { key: 'plugin_groups', label: '插件组管理' },
  { key: 'global_rules', label: '全局规则管理' },
  { key: 'plugin_metadata', label: '插件元数据' },
  { key: 'edge_nodes', label: 'Edge直连' },
]

const selectedPermKeys = ref<string[]>([])

function togglePerm(key: string) {
  const idx = selectedPermKeys.value.indexOf(key)
  if (idx >= 0) selectedPermKeys.value.splice(idx, 1)
  else selectedPermKeys.value.push(key)
}

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
  formErrors.username = ''
  formErrors.password = ''
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
  formErrors.username = ''
  formErrors.password = ''
  modalVisible.value = true
}

function closeModal() {
  modalVisible.value = false
  editingUser.value = null
}

async function handleSave() {
  formErrors.username = ''
  formErrors.password = ''
  let valid = true
  if (!formState.username.trim()) {
    formErrors.username = '请输入用户名'
    valid = false
  }
  if (!editingUser.value && (!formState.password || formState.password.length < 6)) {
    formErrors.password = '密码至少 6 位字符'
    valid = false
  }
  if (!valid) return

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
      const res = await api.post('/admin/users', {
        username: formState.username,
        password: formState.password,
        role: formState.role,
        status: formState.status ? 1 : 0,
      })
      const newUserId = res.data?.id
      if (newUserId && formState.role !== 'admin') {
        if (selectedPermKeys.value.length > 0) {
          await api.put(`/admin/users/${newUserId}/permissions`, {
            permissions: selectedPermKeys.value,
          })
        }
        if (selectedClusterIds.value.length > 0) {
          await api.put(`/admin/users/${newUserId}/clusters`, {
            cluster_ids: selectedClusterIds.value,
          })
        }
      }
      message.success('用户已创建')
    }
    closeModal()
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    const errMsg = Array.isArray(detail) ? detail[0]?.msg?.replace(/^Value error,\s*/, '') : typeof detail === 'string' ? detail.replace(/^Value error,\s*/, '') : ''
    if (errMsg && (errMsg.includes('password') || errMsg.includes('密码'))) {
      formErrors.password = errMsg
    } else if (errMsg && (errMsg.includes('username') || errMsg.includes('用户名') || errMsg.includes('already exists') || errMsg.includes('重复'))) {
      formErrors.username = errMsg
    } else if (errMsg) {
      message.error(errMsg)
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
  deleteConfirm.userId = user.id
  deleteConfirm.username = user.username
  deleteConfirm.visible = true
}

async function executeDeleteUser() {
  if (!deleteConfirm.userId) return
  try {
    await api.delete(`/admin/users/${deleteConfirm.userId}`)
    message.success('用户已删除')
    deleteConfirm.visible = false
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '删除用户失败')
  }
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
  flex-wrap: nowrap;
}

.text-muted { color: var(--muted); }
.text-sm { font-size: 12px; }

/* ── Modal（与节点弹窗风格一致） ── */
.modal-overlay {
  position: fixed; inset: 0; background: oklch(0% 0 0 / 40%);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  width: 100%; max-width: 600px; max-height: 80vh;
  display: flex; flex-direction: column;
}
.modal-wide { max-width: 700px; }
.picker-modal { max-width: 640px; }

.form-row { display: flex; gap: 16px; margin-bottom: 0; }

.form-group { flex: 1; margin-bottom: 16px; }

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.required { color: var(--danger); }

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.permissions-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.permissions-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--fg);
}

.perm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.perm-grid label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  color: var(--muted);
}
.perm-grid label:hover { color: var(--fg); }

.password-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.password-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--fg);
}

/* ── 选中集群标签 ── */
.selected-clusters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  min-height: 28px;
  align-items: center;
}
.selected-cluster-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
}
.selected-cluster-tag .remove {
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0.5;
}
.selected-cluster-tag .remove:hover { opacity: 1; }
.select-clusters-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  background: transparent;
  transition: all 0.15s;
  height: 28px;
}
.select-clusters-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Picker 模式（与节点弹窗一致） ── */
.picker-modal { max-width: 640px; }
.picker-search { margin-bottom: 16px; }
.picker-search input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
  outline: none;
  background: var(--bg);
  color: var(--fg);
}
.picker-search input:focus { border-color: var(--accent); }
.picker-group {
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.picker-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  user-select: none;
  border-bottom: 1px solid var(--border);
}
.picker-group-header:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.picker-group-header .group-checkbox {
  width: 16px; height: 16px;
  accent-color: var(--accent);
}
.picker-group-header .group-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  font-weight: 400;
}
.picker-group-body {
  padding: 6px 14px 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 4px;
}
.picker-cluster-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--fg);
  transition: background 0.1s;
}
.picker-cluster-item:hover { background: var(--bg); }
.picker-cluster-item input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--accent); }
.picker-cluster-name { font-weight: 500; }
.picker-cluster-tag { font-size: 10px; color: var(--muted); margin-left: auto; font-family: var(--font-mono); }
.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

/* ── 表格外框 ── */
.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table-container :deep(.ant-table) {
  background: transparent !important;
  border: none !important;
}

/* ── 表头 ── */
.user-table :deep(.ant-table-thead > tr > th) {
  background: oklch(97% 0.005 250);
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  white-space: nowrap;
  user-select: none;
  border-bottom: 1px solid var(--border) !important;
}
.user-table :deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}

/* ── 行分割线 ── */
.user-table :deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px;
  font-size: 13px;
  white-space: nowrap;
  background: transparent !important;
  border-bottom: 1px solid var(--border);
}
.user-table :deep(.ant-table-tbody > tr:hover > td) {
  background: oklch(97% 0.005 250 / 60%) !important;
}

/* ── 分页脚注 ── */
.user-table :deep(.ant-table-pagination) {
  background: var(--bg) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
  border-top: 1px solid var(--border) !important;
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

@media (max-width: 768px) {
  .user-filter-bar { flex-wrap: wrap; }
}
</style>

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
      <select v-model="roleFilter" class="form-input" style="width:120px;height:32px;font-size:12px;" @change="onFilterChange">
        <option value="all">全部角色</option>
        <option value="admin">管理员</option>
        <option value="user">普通用户</option>
      </select>
      <select v-model="statusFilter" class="form-input" style="width:120px;height:32px;font-size:12px;" @change="onFilterChange">
        <option value="all">全部状态</option>
        <option value="1">启用</option>
        <option value="0">禁用</option>
      </select>
      <span class="text-muted text-sm">共 {{ filteredUsers.length }} 个用户</span>
    </div>

    <!-- Table -->
    <TableCard :columns="tableColumns" :data-source="pagedUsers" :loading="loading" :pagination="false" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'checkbox'">
          <input type="checkbox">
        </template>
        <template v-if="column.key === 'username'">
          <span class="cell-primary">{{ record.username }}</span>
        </template>
        <template v-if="column.key === 'role'">
          <span class="role-badge" :class="record.role">{{ record.role === 'admin' ? '管理员' : '普通用户' }}</span>
        </template>
        <template v-if="column.key === 'status'">
          <BadgeStatus
            :text="record.status === 1 ? '启用' : '禁用'"
            :status="record.status === 1 ? 'online' : 'offline'"
          />
        </template>
        <template v-if="column.key === 'permissions'">
          <span v-if="record.role === 'admin'" class="text-muted text-sm">全部权限</span>
          <template v-else-if="record.permissions?.length">
            <span v-for="p in record.permissions" :key="p" class="perm-tag active">{{ permissionKeyToLabel[p] || p }}</span>
          </template>
          <span v-else class="text-muted text-sm">—</span>
        </template>
        <template v-if="column.key === 'clusters'">
          <span v-if="record.role === 'admin'" class="text-muted text-sm">全部集群</span>
          <span v-else-if="(record as any).cluster_ids?.length" class="text-muted text-sm">
            <span v-for="c in (record as any).cluster_ids.slice(0, 3)" :key="c" class="perm-tag">{{ getClusterName(c) }}</span>
            <a-tooltip v-if="(record as any).cluster_ids.length > 3">
              <template #title>
                <div>{{ ((record as any).cluster_ids as number[]).map(c => getClusterName(c)).join('、') }}</div>
              </template>
              <span class="perm-tag more-tag">+{{ (record as any).cluster_ids.length - 3 }}</span>
            </a-tooltip>
          </span>
          <span v-else class="text-muted text-sm">—</span>
        </template>
        <template v-if="column.key === 'created_at'">
          <span class="cell-secondary">{{ record.created_at ? formatDate(record.created_at) : '-' }}</span>
        </template>
        <template v-if="column.key === 'action' && isAdmin">
          <div class="action-menu-wrap" @click.stop>
            <button class="action-btn" @click="toggleActionMenu(record.id)">⋯</button>
            <div v-if="openMenuId === record.id" class="action-dropdown" @click.stop>
              <button class="action-dropdown-item" @click="editUser(record)">编辑</button>
              <button class="action-dropdown-item" @click="toggleUserStatus(record)">
                {{ record.status === 1 ? '禁用' : '启用' }}
              </button>
              <button class="action-dropdown-item danger" @click="deleteUser(record)">删除</button>
            </div>
          </div>
        </template>
      </template>
    </TableCard>

    <!-- Pagination -->
    <div class="table-footer" v-if="totalPages > 1">
      <span class="text-muted text-sm">第 {{ currentPage }} 页，共 {{ totalPages }} 页</span>
      <div class="pagination">
        <button class="page-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">‹</button>
        <button v-for="p in pageNumbers" :key="p" class="page-btn" :class="{ active: p === currentPage }" @click="goPage(p)">{{ p }}</button>
        <button class="page-btn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">›</button>
      </div>
    </div>

    <!-- User Modal -->
    <div v-if="modalVisible" class="modal-overlay" @click.self="closeModal">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>{{ editingUser ? '编辑用户 — ' + editingUser.username : '新建用户' }}</h2>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">用户名 <span class="required">*</span></label>
              <input v-model="form.username" type="text" class="form-input" placeholder="newuser" :disabled="!!editingUser">
            </div>
            <div class="form-group">
              <label class="form-label">角色</label>
              <select v-model="form.role" class="form-input" @change="onRoleChange">
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
          </div>
          <div v-if="!editingUser" class="form-group">
            <label class="form-label">密码 <span class="required">*</span></label>
            <input v-model="form.password" type="password" class="form-input" placeholder="6-50 位字符">
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.status" type="checkbox" :true-value="1" :false-value="0" checked>
              <span>启用</span>
            </label>
          </div>

          <!-- Permissions (only for non-admin) -->
          <div v-if="form.role !== 'admin'" class="permissions-section">
            <h3>资源权限</h3>
            <p class="text-muted text-sm" style="margin-bottom:8px;">分配用户可操作的资源模块</p>
            <div class="perm-grid">
              <label v-for="perm in allPermissions" :key="perm.key">
                <input v-model="perm.checked" type="checkbox">
                <span>{{ perm.label }}</span>
              </label>
            </div>
          </div>

          <!-- Cluster permissions (only for non-admin) -->
          <div v-if="form.role !== 'admin'" class="permissions-section">
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

          <!-- Password reset (edit mode) -->
          <div v-if="editingUser" class="password-section">
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
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="handleSave">保存</button>
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
          <span style="font-size:12px;color:var(--p-text-tertiary);margin-right:auto;">已选 {{ selectedClusterIds.length }} 个集群</span>
          <button class="btn btn-secondary" @click="clusterPickerVisible = false">取消</button>
          <button class="btn btn-primary" @click="clusterPickerVisible = false">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { User } from '@/types'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import TableCard from '@/components/TableCard.vue'
import BadgeStatus from '@/components/BadgeStatus.vue'

const authStore = useAuthStore()

const allUsers = ref<User[]>([])
const loading = ref(false)
const searchText = ref('')
const roleFilter = ref('all')
const statusFilter = ref('all')
const currentPage = ref(1)
const pageSize = 10
const openMenuId = ref<number | null>(null)
const modalVisible = ref(false)
const editingUser = ref<User | null>(null)
const resetPwdValue = ref('')

const isAdmin = computed(() => authStore.user?.role === 'admin')
const clusters = ref<{id: number; name: string; display_name?: string; group_name?: string}[]>([])

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
  const groups: { name: string; clusters: typeof clusters.value }[] = []
  for (const [name, list] of map) groups.push({ name, clusters: list })
  return groups
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

function getClusterName(clusterId: number): string {
  const c = clusters.value.find(c => c.id === clusterId)
  return c?.display_name || c?.name || `集群#${clusterId}`
}

const allPermissions = ref([
  { key: 'plugin_groups', label: '插件组管理', checked: false },
  { key: 'global_rules', label: '全局规则管理', checked: false },
  { key: 'edge_nodes', label: 'Edge直连', checked: false },
  { key: 'plugin_management', label: '插件管理', checked: false },
  { key: 'plugin_metadata', label: '插件元数据', checked: false },
])

const form = reactive({
  username: '',
  password: '',
  role: 'user',
  status: 1,
})

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch { return dateStr }
}

const permissionKeyToLabel: Record<string, string> = {
  plugin_groups: '插件组管理',
  global_rules: '全局规则管理',
  edge_nodes: 'Edge直连',
  plugin_management: '插件管理',
  plugin_metadata: '插件元数据',
}

const tableColumns = computed(() => {
  const cols: any[] = [
    { title: '', key: 'checkbox', width: 30 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '角色', key: 'role' },
    { title: '状态', key: 'status' },
    { title: '权限', key: 'permissions' },
    { title: '可访问集群', key: 'clusters' },
    { title: '创建时间', key: 'created_at' },
  ]
  if (isAdmin.value) {
    cols.push({ title: '操作', key: 'action', width: 80 })
  }
  return cols
})

const filteredUsers = computed(() => {
  let list = allUsers.value
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    list = list.filter(u => u.username.toLowerCase().includes(q))
  }
  if (roleFilter.value !== 'all') {
    list = list.filter(u => u.role === roleFilter.value)
  }
  if (statusFilter.value !== 'all') {
    const s = parseInt(statusFilter.value)
    list = list.filter(u => u.status === s)
  }
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / pageSize)))

const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredUsers.value.slice(start, start + pageSize)
})

const pageNumbers = computed(() => {
  const pages: number[] = []
  for (let i = 1; i <= totalPages.value; i++) pages.push(i)
  return pages
})

function onFilterChange() {
  currentPage.value = 1
}

function goPage(p: number) {
  if (p >= 1 && p <= totalPages.value) currentPage.value = p
}

function toggleActionMenu(id: number) {
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeDropdown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.action-menu-wrap')) {
    openMenuId.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdown)
  loadUsers()
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})

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

async function loadUserPermissions(userId: number) {
  try {
    const res = await api.get(`/admin/users/${userId}/permissions`)
    const perms: string[] = res.data.permissions || []
    allPermissions.value.forEach(p => { p.checked = perms.includes(p.key) })
  } catch {
    allPermissions.value.forEach(p => { p.checked = false })
  }
}

async function loadUserClusters(userId: number) {
  try {
    const res = await api.get(`/admin/users/${userId}/clusters`)
    selectedClusterIds.value = res.data.cluster_ids || []
  } catch {
    selectedClusterIds.value = []
  }
}

function openAddModal() {
  editingUser.value = null
  form.username = ''
  form.password = ''
  form.role = 'user'
  form.status = 1
  allPermissions.value.forEach(p => { p.checked = false })
  resetPwdValue.value = ''
  modalVisible.value = true
}

function editUser(user: User) {
  editingUser.value = user
  form.username = user.username
  form.role = user.role
  form.status = user.status
  form.password = ''
  resetPwdValue.value = ''
  clusterSearchText.value = ''
  loadUserPermissions(user.id)
  loadUserClusters(user.id)
  modalVisible.value = true
  openMenuId.value = null
}

function onRoleChange() {
  if (form.role === 'admin') {
    allPermissions.value.forEach(p => { p.checked = false })
  }
}

function closeModal() {
  modalVisible.value = false
  clusterPickerVisible.value = false
  editingUser.value = null
}

async function handleSave() {
  if (!form.username.trim()) {
    message.error('请输入用户名')
    return
  }
  if (!editingUser.value && (!form.password || form.password.length < 6)) {
    message.error('密码至少 6 位字符')
    return
  }
  try {
      if (editingUser.value) {
        await api.put(`/admin/users/${editingUser.value.id}`, { role: form.role, status: form.status })
        if (form.role !== 'admin') {
          const perms = allPermissions.value.filter(p => p.checked).map(p => p.key)
          await api.put(`/admin/users/${editingUser.value.id}/permissions`, { permissions: perms })
        }
        await api.put(`/admin/users/${editingUser.value.id}/clusters`, { cluster_ids: selectedClusterIds.value })
        message.success('用户已更新')
    } else {
      await api.post('/admin/users', { username: form.username, password: form.password, role: form.role, status: form.status })
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
  }
}

async function toggleUserStatus(user: User) {
  if (user.role === 'admin' && user.id === 1 && user.status === 1) {
    message.error('不能禁用初始管理员')
    return
  }
  try {
    const newStatus = user.status === 1 ? 0 : 1
    await api.put(`/admin/users/${user.id}`, { status: newStatus })
    message.success(newStatus === 1 ? '用户已启用' : '用户已禁用')
    openMenuId.value = null
    loadUsers()
  } catch {
    message.error('操作失败')
  }
}

async function deleteUser(user: User) {
  if (user.role === 'admin' && user.id === 1) {
    message.error('不能删除初始管理员')
    return
  }
  if (!confirm(`确定删除用户 ${user.username}？`)) return
  try {
    await api.delete(`/admin/users/${user.id}`)
    message.success('用户已删除')
    openMenuId.value = null
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '删除用户失败')
  }
}

async function handleResetPassword() {
  if (!editingUser.value) return
  if (!resetPwdValue.value || resetPwdValue.value.length < 6) {
    message.error('密码至少 6 位字符')
    return
  }
  try {
    await api.put(`/admin/users/${editingUser.value.id}/password`, { new_password: resetPwdValue.value })
    message.success('密码重置成功')
    resetPwdValue.value = ''
  } catch {
    message.error('重置密码失败')
  }
}
</script>

<style scoped>
.user-list {
  position: relative;
}

.user-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}

.search-input-wrap {
  position: relative;
}

.search-input-wrap input {
  width: 240px;
  padding-left: 32px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  opacity: 0.4;
  pointer-events: none;
}

.filter-select {
  width: 100px;
  height: 32px;
  font-size: 12px;
}

.text-muted { color: var(--p-text-tertiary); }
.text-sm { font-size: 12px; }

.cell-primary {
  font-weight: 500;
  color: var(--p-text-primary);
}

.cell-secondary {
  font-size: 12px;
  color: var(--p-text-tertiary);
}

.role-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono, var(--p-mono));
}
.role-badge.admin {
  background: color-mix(in srgb, var(--p-color-primary) 10%, transparent);
  color: var(--p-color-primary);
}
.role-badge.user {
  background: color-mix(in srgb, var(--p-color-success) 10%, transparent);
  color: var(--p-color-success);
}

.perm-tag {
  display: inline-block;
  padding: 1px 7px;
  margin: 1px;
  border-radius: 3px;
  font-size: 10px;
  background: var(--p-bg-page);
  border: 1px solid var(--p-border-default);
  font-family: var(--font-mono, var(--p-mono));
  color: var(--p-text-secondary);
}
.perm-tag.active {
  border-color: color-mix(in srgb, var(--p-color-primary) 30%, transparent);
  background: color-mix(in srgb, var(--p-color-primary) 6%, transparent);
  color: var(--p-color-primary);
}
.more-tag {
  cursor: pointer;
  border-style: dashed;
}

.action-menu-wrap {
  position: relative;
  display: inline-block;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--p-radius-sm);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: var(--p-text-tertiary);
  transition: all 0.15s;
}
.action-btn:hover {
  background: var(--p-bg-hover);
  color: var(--p-color-primary);
}

.action-dropdown {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 100;
  background: var(--p-bg-elevated);
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-md);
  box-shadow: var(--p-shadow-md);
  min-width: 100px;
  padding: 4px 0;
}

.action-dropdown-item {
  display: block;
  width: 100%;
  padding: 8px 16px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  color: var(--p-text-primary);
  white-space: nowrap;
  transition: background 0.1s;
}
.action-dropdown-item:hover {
  background: var(--p-bg-hover);
}
.action-dropdown-item.danger {
  color: var(--p-color-danger);
}
.action-dropdown-item.danger:hover {
  background: color-mix(in srgb, var(--p-color-danger) 8%, transparent);
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  margin-top: 8px;
}

.pagination {
  display: flex;
  gap: 4px;
}

.page-btn {
  min-width: 28px;
  height: 28px;
  border: 1px solid var(--p-border-default);
  background: var(--p-bg-container);
  border-radius: var(--p-radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--p-text-secondary);
  transition: all 0.15s;
}
.page-btn:hover:not(:disabled):not(.active) {
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}
.page-btn.active {
  background: var(--p-color-primary);
  border-color: var(--p-color-primary);
  color: #fff;
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--p-bg-mask);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: var(--p-bg-page);
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-lg);
  box-shadow: var(--p-shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-wide {
  max-width: 700px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--p-border-divider);
  background: var(--p-color-primary-bg);
}
.modal-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--p-text-primary);
}

.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--p-text-tertiary);
  border-radius: var(--p-radius-sm);
}
.modal-close:hover {
  background: var(--p-bg-hover);
  color: var(--p-text-primary);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--p-border-divider);
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 0;
}

.form-group {
  flex: 1;
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--p-text-secondary);
  font-weight: 500;
}

.required { color: var(--p-color-danger); }

.form-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font-size: 13px;
  background: var(--p-bg-input);
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-md);
  color: var(--p-text-primary);
  outline: none;
  transition: border-color 0.2s;
}
.form-input:focus {
  border-color: var(--p-color-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-color-primary) 20%, transparent);
}
.form-input::placeholder {
  color: var(--p-text-disabled);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--p-text-secondary);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--p-color-primary);
}

.permissions-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--p-border-divider);
}
.permissions-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--p-text-primary);
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
  color: var(--p-text-secondary);
}
.perm-grid label:hover {
  color: var(--p-text-primary);
}

.password-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--p-border-divider);
}
.password-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--p-text-primary);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 16px;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--p-radius-md);
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid var(--p-border-default);
  background: var(--p-bg-hover);
  color: var(--p-text-secondary);
  white-space: nowrap;
}
.btn:hover {
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}

.btn-primary {
  background: linear-gradient(135deg, var(--p-color-primary), var(--p-color-info));
  border: none;
  color: #fff;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--p-color-primary) 30%, transparent);
}
.btn-primary:hover {
  opacity: 0.92;
  box-shadow: 0 6px 24px color-mix(in srgb, var(--p-color-primary) 40%, transparent);
  color: #fff;
}

.btn-secondary {
  background: var(--p-bg-page);
  border: 1px solid var(--p-border-default);
  color: var(--p-text-primary);
}

.btn-sm {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
}

.picker-modal {
  max-width: 640px;
}
.picker-search {
  margin-bottom: 16px;
}
.picker-search input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-md);
  font-size: 13px;
  outline: none;
  background: var(--p-bg-input);
  color: var(--p-text-primary);
}
.picker-search input:focus {
  border-color: var(--p-color-primary);
}
.picker-group {
  margin-bottom: 12px;
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-lg);
  overflow: hidden;
}
.picker-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--p-bg-hover);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--p-text-primary);
  user-select: none;
  border-bottom: 1px solid var(--p-border-default);
}
.picker-group-header:hover {
  background: color-mix(in srgb, var(--p-color-primary) 8%, transparent);
}
.picker-group-header .group-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--p-color-primary);
}
.picker-group-header .group-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--p-text-tertiary);
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
  border-radius: var(--p-radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--p-text-primary);
  transition: background 0.1s;
}
.picker-cluster-item:hover {
  background: var(--p-bg-hover);
}
.picker-cluster-item input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: var(--p-color-primary);
}
.picker-cluster-name {
  font-weight: 500;
}
.picker-cluster-tag {
  font-size: 10px;
  color: var(--p-text-tertiary);
  margin-left: auto;
  font-family: var(--font-mono, var(--p-mono));
}

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
  border: 1px solid var(--p-color-primary);
  background: color-mix(in srgb, var(--p-color-primary) 8%, transparent);
  color: var(--p-color-primary);
}
.selected-cluster-tag .remove {
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0.5;
}
.selected-cluster-tag .remove:hover {
  opacity: 1;
}
.select-clusters-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 12px;
  border: 1px dashed var(--p-border-default);
  border-radius: var(--p-radius-md);
  font-size: 12px;
  color: var(--p-text-tertiary);
  cursor: pointer;
  background: transparent;
  transition: all 0.15s;
  height: 28px;
}
.select-clusters-btn:hover {
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}
.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--p-border-divider);
}

@media (max-width: 768px) {
  .user-filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .search-input-wrap input {
    width: 100%;
  }
  .filter-select {
    width: 100%;
  }
  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>

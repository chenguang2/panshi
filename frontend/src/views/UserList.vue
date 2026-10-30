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
      <a-input-search
        v-model:value="searchText"
        class="search-input-wrap"
        style="width: 240px"
        placeholder="搜索用户名"
        @input="onSearchInput"
        @search="onSearchNow"
      />
      <a-select v-model:value="roleFilter" style="width: 130px" :options="roleOptions" @change="onFilterChange" />
      <a-select v-model:value="statusFilter" style="width: 130px" :options="statusOptions" @change="onFilterChange" />
      <span class="text-muted text-sm">共 {{ totalCount }} 个用户</span>
    </div>

    <div class="table-container">
      <a-table
        :data-source="users"
        :columns="columns"
        :row-key="(record: User) => record.id"
        :pagination="paginationProps({ page, pageSize, total: totalCount }, '个用户')"
        :loading="loading"
        size="middle"
        class="user-table"
        @change="handleTableChange"
      >
        <!-- 用户名列 -->
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span class="text-muted">{{ (page - 1) * pageSize + index + 1 }}</span>
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

          <!-- 状态列：显式开关（user-management-ux-review-fixes 批 2：状态与操作合一，点击弹确认） -->
          <template v-if="column.key === 'status'">
            <a-switch
              :checked="record.status === 1"
              checked-children="启"
              un-checked-children="禁"
              @change="onStatusToggle(record, $event)"
            />
          </template>

          <!-- 权限列 -->
          <template v-if="column.key === 'permissions'">
            <span v-if="record.role === 'admin'" class="text-muted text-sm">全部权限</span>
            <span v-else-if="getUserPerms(record).length" class="text-muted text-sm">
              <span v-for="p in getUserPerms(record).slice(0, 3)" :key="p" class="perm-tag active">{{
                permissionKeyToLabel[p] || p
              }}</span>
              <a-tooltip v-if="getUserPerms(record).length > 3">
                <template #title>
                  <div>
                    {{
                      getUserPerms(record)
                        .map((p) => permissionKeyToLabel[p] || p)
                        .join('、')
                    }}
                  </div>
                </template>
                <span class="perm-tag active more-tag">+{{ getUserPerms(record).length - 3 }}</span>
              </a-tooltip>
            </span>
            <span v-else class="text-muted text-sm">—</span>
          </template>

          <!-- 可访问集群列 -->
          <template v-if="column.key === 'clusters'">
            <span v-if="record.role === 'admin'" class="text-muted text-sm">全部集群</span>
            <span v-else-if="getUserClusterIds(record).length" class="text-muted text-sm">
              <span v-for="c in getUserClusterIds(record).slice(0, 3)" :key="c" class="perm-tag">{{
                getClusterName(c)
              }}</span>
              <a-tooltip v-if="getUserClusterIds(record).length > 3">
                <template #title>
                  <div>
                    {{
                      getUserClusterIds(record)
                        .map((c) => getClusterName(c))
                        .join('、')
                    }}
                  </div>
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

          <!-- 操作列（⋯ 只留删除——禁用/启用已迁至状态开关） -->
          <template v-if="column.key === 'actions' && isAdmin">
            <a-button type="link" size="small" @click="editUser(record)">编辑</a-button>
            <a-dropdown :trigger="['click']">
              <a-button type="text" size="small" class="action-trigger-btn">⋯</a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item danger @click="deleteUser(record)">删除</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </template>
        </template>

        <!-- 空状态双形态（批 1）：有筛选 → 无匹配用户 + 清除筛选；真空库 → 暂无用户 -->
        <template #emptyText>
          <div class="empty-state">
            <div class="empty-state-icon">◎</div>
            <template v-if="hasActiveFilters">
              <p>无匹配用户</p>
              <button class="btn btn-secondary btn-sm" style="margin-top: 8px" @click="clearFilters">清除筛选</button>
            </template>
            <p v-else>暂无用户</p>
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
            <div class="form-group field-inline">
              <label class="form-label">用户名 <span class="required">*</span></label>
              <input
                v-model="formState.username"
                type="text"
                class="form-input"
                :class="{ 'has-error': formErrors.username }"
                placeholder="newuser"
                :disabled="!!editingUser"
              />
              <span class="form-error" v-if="formErrors.username">{{ formErrors.username }}</span>
            </div>
            <div v-if="!editingUser" class="form-group field-inline">
              <label class="form-label">密码 <span class="required">*</span></label>
              <input
                v-model="formState.password"
                type="password"
                class="form-input"
                :class="{ 'has-error': formErrors.password }"
                placeholder="6-50 位字符"
              />
              <span class="form-error" v-if="formErrors.password">{{ formErrors.password }}</span>
            </div>
            <div v-else class="form-group field-inline">
              <label class="form-label">重置密码</label>
              <input v-model="resetPwdValue" type="password" class="form-input" placeholder="新密码（留空不修改）" />
              <button class="btn btn-secondary btn-sm reset-pwd-btn" @click="handleResetPassword">重置</button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group field-inline">
              <label class="checkbox-label">
                <input v-model="formState.status" type="checkbox" />
                <span>启用</span>
              </label>
            </div>
            <div class="form-group field-inline">
              <label class="form-label">角色 <span class="required">*</span></label>
              <select v-model="formState.role" class="form-input" @change="onRoleChange">
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
          </div>

          <!-- 资源权限（非管理员） -->
          <template v-if="formState.role !== 'admin'">
            <div class="permissions-section">
              <h3>资源权限</h3>
              <p class="text-muted text-sm" style="margin-bottom: 8px">
                分配用户可操作的资源模块（勾选分类可全选/取消该分类下所有项目）
              </p>
              <div class="perm-groups">
                <div v-for="group in permissionGroups" :key="group.title" class="perm-group">
                  <div class="perm-group-header" @click="togglePermGroup(group.items)">
                    <a-checkbox
                      :checked="isPermGroupAllSelected(group.items)"
                      :indeterminate="isPermGroupPartial(group.items)"
                      @click.stop="togglePermGroup(group.items)"
                    />
                    <span class="perm-group-title">{{ group.title }}</span>
                    <span class="perm-group-count">{{ group.items.length }} 项</span>
                  </div>
                  <div class="perm-group-body">
                    <a-checkbox
                      v-for="perm in group.items"
                      :key="perm.key"
                      class="perm-group-item"
                      :checked="selectedPermKeys.includes(perm.key)"
                      @change="togglePerm(perm.key)"
                      >{{ perm.label }}</a-checkbox
                    >
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 集群权限（非管理员） -->
          <template v-if="formState.role !== 'admin'">
            <div class="permissions-section">
              <h3>集群权限</h3>
              <p class="text-muted text-sm" style="margin-bottom: 8px">选择用户可访问的集群</p>
              <div class="selected-clusters">
                <span v-for="cid in selectedClusterIds" :key="cid" class="selected-cluster-tag">
                  {{ getClusterName(cid) }}
                  <span class="remove" @click="toggleCluster(cid)">&times;</span>
                </span>
                <span v-if="!selectedClusterIds.length" class="text-muted text-sm" style="padding: 4px 0"
                  >暂未选择集群</span
                >
                <span class="select-clusters-btn" @click="openClusterPicker">+ 选择集群</span>
              </div>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="handleSave" :disabled="modalSubmitting">
            {{ modalSubmitting ? '提交中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Cluster Picker Modal -->
    <div v-if="clusterPickerVisible" class="modal-overlay">
      <div class="modal picker-modal">
        <div class="modal-header">
          <h2>选择集群</h2>
          <button class="modal-close" @click="clusterPickerVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="picker-search">
            <input v-model="clusterSearchText" type="text" placeholder="搜索集群名称..." />
          </div>
          <div v-for="group in filteredGroupedClusters" :key="group.name" class="picker-group">
            <div class="picker-group-header" @click="toggleGroup(group.clusters)">
              <input
                type="checkbox"
                class="group-checkbox"
                :checked="isGroupAllSelected(group.clusters)"
                @click.stop="toggleGroup(group.clusters)"
              />
              <span>{{ group.name }}</span>
              <span class="group-count">{{ group.clusters.length }} 个集群</span>
            </div>
            <div class="picker-group-body">
              <label v-for="c in group.clusters" :key="c.id" class="picker-cluster-item">
                <input type="checkbox" :checked="isClusterSelected(c.id)" @change="toggleCluster(c.id)" />
                <span class="picker-cluster-name">{{ c.display_name || c.name }}</span>
                <span v-if="c.display_name" class="picker-cluster-tag">{{ c.name }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="picker-actions">
          <span style="font-size: 12px; color: var(--muted); margin-right: auto"
            >已选 {{ pickerDraft.length }} 个集群</span
          >
          <button class="btn btn-secondary" @click="cancelPicker">取消</button>
          <button class="btn btn-primary" @click="confirmPicker">确认</button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div class="modal-overlay" :style="{ display: deleteConfirm.visible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 420px">
        <div class="modal-header">
          <h2>删除用户</h2>
          <button class="modal-close" @click="deleteConfirm.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6">
            确定删除用户 "{{ deleteConfirm.username }}" 吗？<br />
            将一并清除其资源权限与集群授权，且<b style="color: var(--danger)">不可恢复</b>。
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deleteConfirm.visible = false">取消</button>
          <button class="btn btn-danger" @click="executeDeleteUser">删除</button>
        </div>
      </div>
    </div>

    <!-- 通用危险操作确认（批 2/3：禁用/启用、重置密码——单一状态机避免三份弹窗重复） -->
    <div class="modal-overlay" :style="{ display: confirmState.visible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 420px">
        <div class="modal-header">
          <h2>{{ confirmState.title }}</h2>
          <button class="modal-close" @click="cancelConfirm">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6">{{ confirmState.body }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="cancelConfirm">取消</button>
          <button class="btn" :class="confirmState.danger ? 'btn-danger' : 'btn-primary'" @click="runConfirm">
            {{ confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import type { TablePaginationConfig } from 'ant-design-vue'
import { paginationProps } from '@/composables/usePagination'
import { formatDateOnly as formatDate } from '@/utils/format'
import {
  listUsers,
  getMyProfile,
  createUser,
  updateUser,
  updateUserPermissions,
  updateUserClusters,
  updateUserPassword,
  deleteUser as deleteUserApi,
  type ListUsersParams,
} from '@/api/users'
import { listClusters } from '@/api/clusters'
import type { User } from '@/types'
import { PAGE_SIZE_TABLE } from '@/constants'
import { useAuthStore } from '@/stores/auth'
import { useFeaturesStore } from '@/stores/features'
import { PERMISSION_GROUPS, permissionKeyToLabel as permissionKeyToLabelMap } from '@/config/permissionGroups'
import PageHeader from '@/components/PageHeader.vue'

// ── Auth ──────────────────────────────────────────────────────────────────
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.user?.role === 'admin')

// ── Data ──────────────────────────────────────────────────────────────────
interface UserWithExt extends User {
  permissions?: string[]
  cluster_ids?: number[]
}

const users = ref<UserWithExt[]>([])
const loading = ref(false)
const searchText = ref('')
const roleFilter = ref('')
const statusFilter = ref<number | string>('')

// 分页 — 真后端分页（对齐 UpstreamList 范式）：page/pageSize 回写 + total 来自后端
const page = ref(1)
const pageSize = ref(PAGE_SIZE_TABLE)
const totalCount = ref(0)

// 表格列定义（排序语义唯一 = 后端返回顺序；user-management-ux-review-fixes 批 2 移除前端 sorter——
// 后端 list_users 无排序参数，本页排序只重排当前页、跨页语义错误）
const columns = computed(() => {
  const cols: any[] = [
    { title: '#', key: 'index', width: 45 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '角色', dataIndex: 'role', key: 'role' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
    { title: '权限', key: 'permissions' },
    { title: '可访问集群', key: 'clusters' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
  ]
  if (isAdmin.value) {
    cols.push({ title: '操作', key: 'actions', width: 80 })
  }
  return cols
})

function handleTableChange(pagination: TablePaginationConfig) {
  page.value = pagination.current || 1
  if (pagination.pageSize) pageSize.value = pagination.pageSize
  loadUsers()
}

function onFilterChange() {
  page.value = 1
  loadUsers()
}

// 搜索：300ms 防抖（@input），回车立即执行（a-input-search @search）——消灭每键一请求（批 1）
let searchTimer: ReturnType<typeof setTimeout> | undefined
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => onFilterChange(), 300)
}
function onSearchNow() {
  clearTimeout(searchTimer)
  onFilterChange()
}

// 空态双形态 + 清除筛选（批 1）
const hasActiveFilters = computed(() => !!(searchText.value.trim() || roleFilter.value || statusFilter.value !== ''))
function clearFilters() {
  searchText.value = ''
  roleFilter.value = ''
  statusFilter.value = ''
  page.value = 1
  loadUsers()
}

const roleOptions = [
  { label: '全部角色', value: '' },
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'user' },
]
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
]

// ── Columns 辅助数据 ──────────────────────────────────────────────────────
// 权限分组与键标签 = 单一事实源 @/config/permissionGroups（照 AppSidebar 菜单结构，
// 源码守卫 permissionGroups.source.test.ts 强制同步——菜单改版测试立即红）
const permissionKeyToLabel: Record<string, string> = permissionKeyToLabelMap

const clusters = ref<{ id: number; name: string; display_name?: string; group_name?: string }[]>([])

function getClusterName(clusterId: number): string {
  const c = clusters.value.find((c) => c.id === clusterId)
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

interface PermItem {
  key: string
  label: string
}

// 资源权限分组 = 单一事实源 @/config/permissionGroups（照 AppSidebar navSections，
// 守卫测试强制同步），按特性开关过滤后渲染
const permissionGroups = computed(() => {
  const featuresStore = useFeaturesStore()
  return PERMISSION_GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((p) => !p.feature || featuresStore.has(p.feature)) as PermItem[],
  })).filter((g) => g.items.length > 0)
})

const selectedPermKeys = ref<string[]>([])

function togglePerm(key: string) {
  const idx = selectedPermKeys.value.indexOf(key)
  if (idx >= 0) selectedPermKeys.value.splice(idx, 1)
  else selectedPermKeys.value.push(key)
}

function isPermGroupAllSelected(items: PermItem[]): boolean {
  return items.length > 0 && items.every((p) => selectedPermKeys.value.includes(p.key))
}

function isPermGroupPartial(items: PermItem[]): boolean {
  const selected = items.filter((p) => selectedPermKeys.value.includes(p.key)).length
  return selected > 0 && selected < items.length
}

function togglePermGroup(items: PermItem[]) {
  const allSelected = isPermGroupAllSelected(items)
  for (const p of items) {
    const idx = selectedPermKeys.value.indexOf(p.key)
    if (allSelected && idx >= 0) selectedPermKeys.value.splice(idx, 1)
    else if (!allSelected && idx < 0) selectedPermKeys.value.push(p.key)
  }
}

// 角色切换不清空权限勾选（批 3）：admin 时权限区不渲染但内存保留，切回恢复——
// 原实现切 admin 清空 selectedPermKeys，普通用户误切 admin 再切回、保存即丢全部权限
function onRoleChange() {
  // no-op：权限勾选由 selectedPermKeys 持有，保存时按角色决定是否提交
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
      await updateUser(editingUser.value.id, {
        role: formState.role,
        status: formState.status ? 1 : 0,
      })
      // 分步失败定位（批 3）：update → permissions → clusters 串行，中途失败明示哪步没成、弹窗保留可重试
      let permFail = false
      let clusterFail = false
      if (formState.role !== 'admin') {
        try {
          await updateUserPermissions(editingUser.value.id, selectedPermKeys.value)
        } catch {
          permFail = true
        }
      }
      try {
        await updateUserClusters(editingUser.value.id, selectedClusterIds.value)
      } catch {
        clusterFail = true
      }
      if (permFail && clusterFail) {
        message.warning('用户基础信息已保存，但权限与集群授权更新失败，请重试')
        return
      }
      if (permFail) {
        message.warning('用户基础信息已保存，但权限更新失败，请重试')
        return
      }
      if (clusterFail) {
        message.warning('用户基础信息已保存，但集群授权更新失败，请重试')
        return
      }
      message.success('用户已更新')
    } else {
      const res = await createUser({
        username: formState.username,
        password: formState.password,
        role: formState.role,
        status: formState.status ? 1 : 0,
      })
      const newUserId = res.data?.id
      let followUpFail = false
      if (newUserId && formState.role !== 'admin') {
        if (selectedPermKeys.value.length > 0) {
          try {
            await updateUserPermissions(newUserId, selectedPermKeys.value)
          } catch {
            followUpFail = true
          }
        }
        if (selectedClusterIds.value.length > 0) {
          try {
            await updateUserClusters(newUserId, selectedClusterIds.value)
          } catch {
            followUpFail = true
          }
        }
      }
      if (followUpFail) {
        message.warning(`用户 "${formState.username}" 已创建，但部分授权更新失败，可在列表中编辑该用户重新保存`)
      } else {
        message.success('用户已创建')
      }
    }
    closeModal()
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    const errMsg = Array.isArray(detail)
      ? detail[0]?.msg?.replace(/^Value error,\s*/, '')
      : typeof detail === 'string'
        ? detail.replace(/^Value error,\s*/, '')
        : ''
    if (errMsg && (errMsg.includes('password') || errMsg.includes('密码'))) {
      formErrors.password = errMsg
    } else if (
      errMsg &&
      (errMsg.includes('username') ||
        errMsg.includes('用户名') ||
        errMsg.includes('already exists') ||
        errMsg.includes('重复'))
    ) {
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

// 暂存态（批 3）：打开时快照，勾选作用于副本，「确认」应用 / 「取消」还原——
// 原实现勾选即时生效，「取消」按钮不还原、与语义相悖
const pickerDraft = ref<number[]>([])

function openClusterPicker(): void {
  pickerDraft.value = [...selectedClusterIds.value]
  clusterPickerVisible.value = true
}

function confirmPicker(): void {
  selectedClusterIds.value = [...pickerDraft.value]
  clusterPickerVisible.value = false
}

function cancelPicker(): void {
  clusterPickerVisible.value = false
  pickerDraft.value = []
}

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
    .map((g) => ({ ...g, clusters: g.clusters.filter((c) => (c.display_name || c.name).toLowerCase().includes(q)) }))
    .filter((g) => g.clusters.length > 0)
})

function isClusterSelected(id: number) {
  return pickerDraft.value.includes(id)
}

function toggleCluster(id: number) {
  const idx = pickerDraft.value.indexOf(id)
  if (idx >= 0) pickerDraft.value.splice(idx, 1)
  else pickerDraft.value.push(id)
}

function isGroupAllSelected(group: typeof clusters.value) {
  return group.every((c) => pickerDraft.value.includes(c.id))
}

function toggleGroup(group: typeof clusters.value) {
  const allSelected = isGroupAllSelected(group)
  for (const c of group) {
    const idx = pickerDraft.value.indexOf(c.id)
    if (allSelected && idx >= 0) pickerDraft.value.splice(idx, 1)
    else if (!allSelected && idx < 0) pickerDraft.value.push(c.id)
  }
}

// ── Actions ───────────────────────────────────────────────────────────────
// 通用危险操作确认状态机（批 2/3：禁用/启用、重置密码共用——单一弹窗避免重复）
const confirmState = reactive({
  visible: false,
  title: '',
  body: '',
  confirmText: '',
  danger: true,
  run: () => {},
})

function cancelConfirm(): void {
  confirmState.visible = false
  confirmState.run = () => {}
}

async function runConfirm(): Promise<void> {
  const run = confirmState.run
  confirmState.visible = false
  confirmState.run = () => {}
  await run()
}

// 状态开关（批 2）：禁用即时生效（后端 get_current_user 对 status≠1 立即 401，已登录会话即刻失效）
// ——高危操作必须确认并说明语义
function onStatusToggle(user: UserWithExt, checked: boolean): void {
  const target = checked ? 1 : 0
  if (target === user.status) return
  if (user.role === 'admin' && user.id === 1 && target === 0) {
    message.error('不能禁用初始管理员')
    return
  }
  if (target === 0) {
    confirmState.title = '禁用用户'
    confirmState.body = `确定禁用用户 "${user.username}" 吗？该用户将立即下线且无法登录，直到重新启用。`
    confirmState.confirmText = '确认禁用'
    confirmState.danger = true
  } else {
    confirmState.title = '启用用户'
    confirmState.body = `确定启用用户 "${user.username}" 吗？启用后可正常登录。`
    confirmState.confirmText = '确认启用'
    confirmState.danger = false
  }
  confirmState.run = async () => {
    try {
      await updateUser(user.id, { status: target })
      user.status = target
      message.success(target === 1 ? '用户已启用' : '用户已禁用')
      loadUsers()
    } catch {
      message.error(target === 1 ? '启用用户失败，请重试' : '禁用用户失败，请重试')
    }
  }
  confirmState.visible = true
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
    await deleteUserApi(deleteConfirm.userId)
    message.success('用户已删除')
    deleteConfirm.visible = false
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '删除用户失败，请重试')
  }
}

// ── Reset Password ────────────────────────────────────────────────────────
const resetPwdValue = ref('')

// 重置密码二次确认（批 3）：账号接管高危，且按钮紧邻「保存」易误触
async function handleResetPassword(): Promise<void> {
  if (!editingUser.value) return
  if (!resetPwdValue.value || resetPwdValue.value.length < 6) {
    message.error('密码至少 6 位字符')
    return
  }
  const target = editingUser.value
  confirmState.title = '重置密码'
  confirmState.body = `确定重置用户 "${target.username}" 的密码吗？该用户当前密码将立即失效，请将新密码告知用户。`
  confirmState.confirmText = '确认重置'
  confirmState.danger = true
  confirmState.run = async () => {
    try {
      await updateUserPassword(target.id, resetPwdValue.value)
      message.success('密码重置成功')
      resetPwdValue.value = ''
    } catch {
      message.error('密码重置失败，请重试')
    }
  }
  confirmState.visible = true
}

// ── Utils ─────────────────────────────────────────────────────────────────

// ── Load ──────────────────────────────────────────────────────────────────
// 组装后端查询参数：空值不传（后端按缺省处理）；keyword 去首尾空格（批 1）
function buildListParams(): ListUsersParams {
  const params: ListUsersParams = { page: page.value, page_size: pageSize.value }
  const kw = searchText.value.trim()
  if (kw) params.keyword = kw
  if (roleFilter.value) params.role = roleFilter.value
  if (statusFilter.value !== '') params.status = Number(statusFilter.value)
  return params
}

async function loadUsers() {
  loading.value = true
  try {
    const [userRes, clusterRes] = await Promise.all([
      isAdmin.value ? listUsers(buildListParams()) : getMyProfile(),
      listClusters().catch(() => ({ data: { items: [] } })),
    ])
    const userData = userRes.data
    if ('items' in userData) {
      users.value = userData.items || []
      totalCount.value = userData.total || 0
    } else {
      users.value = [userData]
      totalCount.value = 1
    }
    clusters.value = clusterRes.data.items || []
  } catch {
    message.error('加载用户列表失败，请刷新重试；持续失败请检查后端服务')
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)
</script>

<style scoped>
/* ── 以下保持与当前设计稿一致的视觉样式 ── */

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

.text-muted {
  color: var(--muted);
}
.text-sm {
  font-size: 12px;
}

/* ── Modal（与节点弹窗风格一致） ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 40%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.modal-wide {
  max-width: 700px;
}
.picker-modal {
  max-width: 640px;
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

/* 标签与输入框同行布局（用户名+密码 / 启用+角色 各占一行） */
.field-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.field-inline .form-label {
  margin-bottom: 0;
  white-space: nowrap;
}
.field-inline .form-input {
  flex: 1 1 140px;
  min-width: 0;
}
.field-inline .form-error {
  flex-basis: 100%;
  margin-left: 0;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.required {
  color: var(--danger);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.checkbox-label input[type='checkbox'] {
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

.perm-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.perm-group {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.perm-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: oklch(97% 0.005 250);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  user-select: none;
  border-bottom: 1px solid var(--border);
}
.perm-group-header:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
.perm-group-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  font-weight: 400;
}
.perm-group-body {
  padding: 8px 14px 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 4px 8px;
}
.perm-group-item {
  font-size: 13px;
}

/* 编辑模式第一行"重置密码"按钮与输入框同行 */
.reset-pwd-btn {
  flex: 0 0 auto;
  height: 36px;
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
.selected-cluster-tag .remove:hover {
  opacity: 1;
}
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
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 13px;
  outline: none;
  background: var(--bg);
  color: var(--fg);
}
.picker-search input:focus {
  border-color: var(--accent);
}
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
  width: 16px;
  height: 16px;
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
.picker-cluster-item:hover {
  background: var(--bg);
}
.picker-cluster-item input[type='checkbox'] {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
}
.picker-cluster-name {
  font-weight: 500;
}
.picker-cluster-tag {
  font-size: 11px;
  color: var(--muted);
  margin-left: auto;
  font-family: var(--font-mono);
}
.picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}

/* 用户名 */
.cell-primary {
  font-weight: 500;
  color: var(--fg);
}

.cell-secondary {
  font-size: 12px;
  color: var(--muted);
}

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
  font-size: 11px;
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
.more-tag {
  cursor: pointer;
  border-style: dashed;
}

/* 操作按钮 */
.action-trigger-btn {
  border: none !important;
  background: transparent !important;
  font-size: 16px !important;
  color: var(--muted) !important;
}

/* 空状态 */
.empty-state {
  text-align: center;
  color: var(--muted);
  padding: 32px;
}
.empty-state-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

@media (max-width: 768px) {
  .user-filter-bar {
    flex-wrap: wrap;
  }
}
</style>

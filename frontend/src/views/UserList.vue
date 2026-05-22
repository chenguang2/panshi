<template>
  <div class="user-list">
    <div class="header-actions">
      <h2>用户管理</h2>
      <a-button v-if="isAdmin" type="primary" @click="showAddModal">添加用户</a-button>
    </div>

    <a-table :dataSource="users" :columns="columns" :loading="loading" :pagination="pagination">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === 1 ? 'green' : 'red'">
            {{ record.status === 1 ? '正常' : '禁用' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button v-if="isAdmin" size="small" :disabled="!canEdit(record)" @click="editUser(record)">编辑</a-button>
            <a-button size="small" type="primary" @click="resetPassword(record)">重置密码</a-button>
            <a-button v-if="isAdmin" size="small" type="danger" :disabled="!canDelete(record)" @click="deleteUser(record)">删除</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingUser ? '编辑用户' : '添加用户'" @ok="handleSubmit" width="700px">
      <a-tabs v-if="editingUser && form.role !== 'admin'" v-model:activeKey="userModalActiveTab">
        <a-tab-pane key="basic" tab="基本信息">
          <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item label="用户名" name="username">
              <a-input v-model:value="form.username" disabled />
            </a-form-item>
            <a-form-item v-if="isAdmin" label="角色" name="role">
              <a-select v-model:value="form.role">
                <a-select-option value="admin">管理员</a-select-option>
                <a-select-option value="user">普通用户</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="状态" name="status">
              <a-select v-model:value="form.status">
                <a-select-option :value="1">正常</a-select-option>
                <a-select-option :value="0">禁用</a-select-option>
              </a-select>
            </a-form-item>
          </a-form>
        </a-tab-pane>
        <a-tab-pane key="permissions" tab="权限设置">
          <div style="padding: 16px 0;">
            <div v-for="perm in allPermissions" :key="perm.key" style="margin-bottom: 16px;">
              <a-checkbox v-model:checked="perm.checked" @change="onPermissionChange(perm.key, perm.checked)">
                <strong>{{ perm.label }}</strong>
              </a-checkbox>
              <div style="font-size: 12px; color: #999; margin-left: 24px;">{{ perm.desc }}</div>
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>
      <div v-else>
        <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
          <a-form-item v-if="!editingUser" label="用户名" name="username">
            <a-input v-model:value="form.username" />
          </a-form-item>
          <a-form-item v-if="editingUser && isAdmin" label="用户名" name="username">
            <a-input v-model:value="form.username" disabled />
          </a-form-item>
          <a-form-item v-if="!editingUser" label="密码" name="password">
            <a-input-password v-model:value="form.password" />
          </a-form-item>
          <a-form-item v-if="isAdmin" label="角色" name="role">
            <a-select v-model:value="form.role">
              <a-select-option value="admin">管理员</a-select-option>
              <a-select-option value="user">普通用户</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="状态" name="status">
            <a-select v-model:value="form.status">
              <a-select-option :value="1">正常</a-select-option>
              <a-select-option :value="0">禁用</a-select-option>
            </a-select>
          </a-form-item>
        </a-form>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { User } from '@/types'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const users = ref<User[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const editingUser = ref<User | null>(null)
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const isAdmin = computed(() => authStore.user?.role === 'admin')

const canEdit = (user: User) => {
  if (isAdmin.value) return true
  return user.role !== 'admin'
}

const canDelete = (user: User) => {
  if (isAdmin.value) return true
  return user.role !== 'admin'
}

const form = reactive({
  username: '',
  password: '',
  role: 'user',
  status: 1
})

const userModalActiveTab = ref('basic')
const allPermissions = ref([
  { key: 'plugin_groups', label: '插件组管理', desc: '允许创建和管理插件组，在路由中可关联插件组', checked: false },
  { key: 'global_rules', label: '全局规则管理', desc: '允许创建和管理全局规则', checked: false },
  { key: 'edge_nodes', label: '边缘节点管理', desc: '允许访问边缘节点调试页面', checked: false },
])

const loadUserPermissions = async (userId: number) => {
  try {
    const res = await api.get(`/admin/users/${userId}/permissions`)
    const perms = res.data.permissions || []
    allPermissions.value.forEach(p => { p.checked = perms.includes(p.key) })
  } catch {
    allPermissions.value.forEach(p => { p.checked = false })
  }
}

const onPermissionChange = (_key: string, _checked: boolean) => {
  // Will be saved on modal submit
}

const columns = computed(() => {
  if (isAdmin.value) {
    return [
      { title: 'ID', dataIndex: 'id', key: 'id' },
      { title: '用户名', dataIndex: 'username', key: 'username' },
      { title: '角色', dataIndex: 'role', key: 'role' },
      { title: '状态', key: 'status' },
      { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
      { title: '操作', key: 'action' }
    ]
  } else {
    return [
      { title: 'ID', dataIndex: 'id', key: 'id' },
      { title: '用户名', dataIndex: 'username', key: 'username' },
      { title: '状态', key: 'status' },
      { title: '操作', key: 'action' }
    ]
  }
})

const loadUsers = async () => {
  loading.value = true
  try {
    if (isAdmin.value) {
      const res = await api.get('/admin/users', { params: { page: pagination.current, page_size: pagination.pageSize } })
      users.value = res.data.items
      pagination.total = res.data.total
    } else {
      const res = await api.get('/admin/users/me')
      users.value = [res.data]
      pagination.total = 1
    }
  } catch (error) {
    message.error('加载用户列表失败')
  } finally {
    loading.value = false
  }
}

const showAddModal = () => {
  editingUser.value = null
  Object.assign(form, {
    username: '',
    password: '',
    role: 'user',
    status: 1
  })
  modalVisible.value = true
}

const editUser = (user: User) => {
  editingUser.value = user
  form.username = user.username
  form.role = user.role
  form.status = user.status
  userModalActiveTab.value = 'basic'
  loadUserPermissions(user.id)
  modalVisible.value = true
}

const handleSubmit = async () => {
  try {
    if (editingUser.value) {
      await api.put(`/admin/users/${editingUser.value.id}`, { role: form.role, status: form.status })
      if (form.role !== 'admin') {
        const perms = allPermissions.value.filter(p => p.checked).map(p => p.key)
        await api.put(`/admin/users/${editingUser.value.id}/permissions`, { permissions: perms })
      }
      message.success('用户已更新')
    } else {
      await api.post('/admin/users', form)
      message.success('用户已创建')
    }
    modalVisible.value = false
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    if (Array.isArray(detail) && detail.length > 0) {
      const msg = detail[0].msg || '操作失败'
      message.error(msg.replace(/^Value error,\s*/, ''))
    } else if (typeof detail === 'string') {
      message.error(detail.replace(/^Value error,\s*/, ''))
    } else {
      message.error('操作失败')
    }
  }
}

const resetPassword = async (user: User) => {
  if (!isAdmin.value && user.id !== authStore.user?.id) {
    message.error('您只能修改自己的密码')
    return
  }
  const password = prompt('请输入新密码：')
  if (password) {
    try {
      await api.put(`/admin/users/${user.id}/password`, { new_password: password })
      message.success('密码已重置')
    } catch (error: any) {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail) && detail.length > 0) {
        const msg = detail[0].msg || '重置密码失败'
        message.error(msg.replace(/^Value error,\s*/, ''))
      } else if (typeof detail === 'string') {
        message.error(detail.replace(/^Value error,\s*/, ''))
      } else {
        message.error('重置密码失败')
      }
    }
  }
}

const deleteUser = async (user: User) => {
  try {
    await api.delete(`/admin/users/${user.id}`)
    message.success('用户已删除')
    loadUsers()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      message.error(detail)
    } else {
      message.error('删除用户失败')
    }
  }
}

onMounted(() => {
  const storedUser = localStorage.getItem('user')
  if (storedUser) {
    authStore.user = JSON.parse(storedUser)
  }
  loadUsers()
})
</script>

<style scoped>
.user-list {
  padding: 0;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions h2 {
  margin: 0;
}
</style>
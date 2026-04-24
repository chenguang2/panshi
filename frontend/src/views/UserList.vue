<template>
  <div class="user-list">
    <div class="header-actions">
      <h2>User Management</h2>
      <a-button type="primary" @click="showAddModal">Add User</a-button>
    </div>

    <a-table :dataSource="users" :columns="columns" :loading="loading" :pagination="pagination">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === 1 ? 'green' : 'red'">
            {{ record.status === 1 ? 'Active' : 'Inactive' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="editUser(record)">Edit</a-button>
            <a-button size="small" type="primary" @click="resetPassword(record)">Reset Password</a-button>
            <a-button size="small" type="danger" @click="deleteUser(record)">Delete</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingUser ? 'Edit User' : 'Add User'" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="Username" name="username">
          <a-input v-model:value="form.username" :disabled="!!editingUser" />
        </a-form-item>
        <a-form-item v-if="!editingUser" label="Password" name="password">
          <a-input-password v-model:value="form.password" />
        </a-form-item>
        <a-form-item label="Role" name="role">
          <a-select v-model:value="form.role">
            <a-select-option value="admin">Admin</a-select-option>
            <a-select-option value="user">User</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Status" name="status">
          <a-select v-model:value="form.status">
            <a-select-option :value="1">Active</a-select-option>
            <a-select-option :value="0">Inactive</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { User } from '@/types'

const users = ref<User[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const editingUser = ref<User | null>(null)
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const form = reactive({
  username: '',
  password: '',
  role: 'user',
  status: 1
})

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: 'Username', dataIndex: 'username', key: 'username' },
  { title: 'Role', dataIndex: 'role', key: 'role' },
  { title: 'Status', key: 'status' },
  { title: 'Created', dataIndex: 'created_at', key: 'created_at' },
  { title: 'Action', key: 'action' }
]

const loadUsers = async () => {
  loading.value = true
  try {
    const res = await api.get('/admin/users', { params: { page: pagination.current, page_size: pagination.pageSize } })
    users.value = res.data.items
    pagination.total = res.data.total
  } catch (error) {
    message.error('Failed to load users')
  } finally {
    loading.value = false
  }
}

const showAddModal = () => {
  editingUser.value = null
  form.username = ''
  form.password = ''
  form.role = 'user'
  form.status = 1
  modalVisible.value = true
}

const editUser = (user: User) => {
  editingUser.value = user
  form.username = user.username
  form.role = user.role
  form.status = user.status
  modalVisible.value = true
}

const handleSubmit = async () => {
  try {
    if (editingUser.value) {
      await api.put(`/admin/users/${editingUser.value.id}`, { role: form.role, status: form.status })
      message.success('User updated')
    } else {
      await api.post('/admin/users', form)
      message.success('User created')
    }
    modalVisible.value = false
    loadUsers()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Operation failed')
  }
}

const resetPassword = async (user: User) => {
  const password = prompt('Enter new password:')
  if (password) {
    try {
      await api.put(`/admin/users/${user.id}/password`, { new_password: password })
      message.success('Password reset')
    } catch (error) {
      message.error('Failed to reset password')
    }
  }
}

const deleteUser = async (user: User) => {
  try {
    await api.delete(`/admin/users/${user.id}`)
    message.success('User deleted')
    loadUsers()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Failed to delete user')
  }
}

onMounted(loadUsers)
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
<template>
  <div class="user-list">
    <div class="header-actions">
      <h2>用户管理</h2>
      <a-button type="primary" @click="showAddModal">添加用户</a-button>
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
            <a-button size="small" @click="editUser(record)">编辑</a-button>
            <a-button size="small" type="primary" @click="resetPassword(record)">重置密码</a-button>
            <a-button size="small" type="danger" @click="deleteUser(record)">删除</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingUser ? '编辑用户' : '添加用户'" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="用户名" name="username">
          <a-input v-model:value="form.username" :disabled="!!editingUser" />
        </a-form-item>
        <a-form-item v-if="!editingUser" label="密码" name="password">
          <a-input-password v-model:value="form.password" />
        </a-form-item>
        <a-form-item label="角色" name="role">
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
  { title: '用户名', dataIndex: 'username', key: 'username' },
  { title: '角色', dataIndex: 'role', key: 'role' },
  { title: '状态', key: 'status' },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
  { title: '操作', key: 'action' }
]

const loadUsers = async () => {
  loading.value = true
  try {
    const res = await api.get('/admin/users', { params: { page: pagination.current, page_size: pagination.pageSize } })
    users.value = res.data.items
    pagination.total = res.data.total
  } catch (error) {
    message.error('加载用户列表失败')
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
      message.success('用户已更新')
    } else {
      await api.post('/admin/users', form)
      message.success('用户已创建')
    }
    modalVisible.value = false
    loadUsers()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  }
}

const resetPassword = async (user: User) => {
  const password = prompt('请输入新密码：')
  if (password) {
    try {
      await api.put(`/admin/users/${user.id}/password`, { new_password: password })
      message.success('密码已重置')
    } catch (error) {
      message.error('重置密码失败')
    }
  }
}

const deleteUser = async (user: User) => {
  try {
    await api.delete(`/admin/users/${user.id}`)
    message.success('用户已删除')
    loadUsers()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '删除用户失败')
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
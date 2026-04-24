<template>
  <a-layout class="default-layout">
    <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible class="layout-sider">
      <div class="logo">Panshi</div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline">
        <a-menu-item key="dashboard" @click="router.push('/')">
          <DashboardOutlined />
          <span>Dashboard</span>
        </a-menu-item>
        <a-menu-item key="users" @click="router.push('/users')">
          <UserOutlined />
          <span>Users</span>
        </a-menu-item>
        <a-menu-item key="clusters" @click="router.push('/clusters')">
          <CloudOutlined />
          <span>Clusters</span>
        </a-menu-item>
        <a-menu-item key="dictionaries" @click="router.push('/dictionaries')">
          <BookOutlined />
          <span>Dictionaries</span>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="layout-header">
        <MenuFoldOutlined v-if="!collapsed" @click="collapsed = !collapsed" class="trigger" />
        <MenuUnfoldOutlined v-else @click="collapsed = !collapsed" class="trigger" />
        <div class="header-right">
          <a-dropdown>
            <a-space>
              <UserOutlined />
              <span>{{ authStore.user?.username }}</span>
            </a-space>
            <template #overlay>
              <a-menu>
                <a-menu-item @click="handleLogout">Logout</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>

      <a-layout-content class="layout-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  UserOutlined,
  CloudOutlined,
  BookOutlined
} from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const collapsed = ref(false)
const selectedKeys = ref(['dashboard'])

onMounted(() => {
  const storedUser = localStorage.getItem('user')
  if (storedUser && !authStore.user) {
    authStore.user = JSON.parse(storedUser)
  }
})

const handleLogout = async () => {
  await authStore.logout()
  message.success('Logged out')
  router.push('/login')
}
</script>

<style scoped>
.default-layout {
  min-height: 100vh;
}

.layout-sider {
  background: #001529;
}

.logo {
  height: 32px;
  margin: 16px;
  color: white;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
}

.layout-header {
  background: #fff;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.trigger {
  font-size: 18px;
  cursor: pointer;
}

.header-right {
  display: flex;
  align-items: center;
}

.layout-content {
  margin: 16px;
  padding: 24px;
  background: #fff;
  min-height: 280px;
}
</style>
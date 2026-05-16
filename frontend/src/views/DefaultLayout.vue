<template>
  <a-layout class="default-layout">
    <a-layout-header class="layout-header">
      <div class="logo">磐石</div>
      <a-menu
        v-model:selectedKeys="selectedKeys"
        theme="light"
        mode="horizontal"
        class="top-menu"
      >
        <a-menu-item key="dashboard" @click="router.push('/')">
          <DashboardOutlined />
          <span>仪表盘</span>
        </a-menu-item>
        <a-sub-menu v-if="isAdmin" key="system" title="系统管理">
          <a-menu-item key="users" @click="router.push('/users')">
            <UserOutlined />
            <span>用户管理</span>
          </a-menu-item>
        </a-sub-menu>
        <a-menu-item key="clusters" @click="router.push('/clusters')">
          <CloudOutlined />
          <span>集群管理</span>
        </a-menu-item>
        <a-menu-item v-if="authStore.hasPermission('edge_nodes')" key="edge-client" @click="router.push('/edge-client')">
          <SettingOutlined />
          <span>边缘节点</span>
        </a-menu-item>
        <a-menu-item key="edge-import" @click="router.push('/edge-import')">
          <ImportOutlined />
          <span>Edge 数据导入</span>
        </a-menu-item>
        <a-menu-item key="tools" @click="router.push('/tools')">
          <ToolOutlined />
          <span>工具箱</span>
        </a-menu-item>
      </a-menu>
      <div class="header-right">
        <a-dropdown>
          <a-space>
            <UserOutlined />
            <span>{{ authStore.user?.username }}</span>
          </a-space>
          <template #overlay>
            <a-menu>
              <a-menu-item @click="handleLogout">退出登录</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </a-layout-header>

    <a-layout-content class="layout-content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  DashboardOutlined,
  UserOutlined,
  CloudOutlined,
  SettingOutlined,
  ToolOutlined,
  ImportOutlined,
} from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const selectedKeys = ref(['dashboard'])

const isAdmin = computed(() => authStore.user?.role === 'admin')



const handleLogout = async () => {
  await authStore.logout()
  message.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped>
.default-layout {
  min-height: 100vh;
}

.layout-header {
  background: #fff;
  padding: 0 24px;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.logo {
  height: 32px;
  margin-right: 32px;
  color: #1890ff;
  font-size: 18px;
  font-weight: bold;
  line-height: 32px;
}

.top-menu {
  flex: 1;
  line-height: 56px;
  border-bottom: none;
}

.header-right {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.layout-content {
  margin: 16px;
  padding: 24px;
  background: #fff;
  min-height: 280px;
}
</style>
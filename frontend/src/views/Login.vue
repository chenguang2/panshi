<template>
  <div class="login-container">
    <a-card class="login-card">
      <h2>Panshi Admin</h2>
      <a-form :model="form" @finish="handleLogin">
        <a-form-item name="username" :rules="[{ required: true, message: 'Please input username' }]">
          <a-input id="username" v-model:value="form.username" placeholder="Username" size="large" />
        </a-form-item>
        <a-form-item name="password" :rules="[{ required: true, message: 'Please input password' }]">
          <a-input-password id="password" v-model:value="form.password" placeholder="Password" size="large" />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit" size="large" block :loading="loading">
            Login
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const handleLogin = async () => {
  loading.value = true
  try {
    await authStore.login(form.username, form.password)
    message.success('Login successful')
    router.push('/')
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Login failed')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
}

.login-card {
  width: 400px;
}

h2 {
  text-align: center;
  margin-bottom: 24px;
  color: #1890ff;
}
</style>
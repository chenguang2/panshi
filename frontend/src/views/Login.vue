<template>
  <div class="login-container">
    <!-- Tech background -->
    <div class="bg-grid"></div>
    <div class="bg-orb bg-orb-1"></div>
    <div class="bg-orb bg-orb-2"></div>
    <div class="bg-orb bg-orb-3"></div>

    <!-- Centering wrapper (flex-free so LiquidGlass transform doesn't conflict) -->
    <div class="login-wrapper">
      <LiquidGlass
        :displacement-scale="35"
        :blur-amount="0.1"
        :saturation="125"
        :aberration-intensity="1.2"
        :elasticity="0.2"
        :corner-radius="16"
        padding="0"
        class="login-glass-card"
      >
        <div class="login-card-inner">
          <div class="logo-area">
            <div class="logo-icon">磐</div>
            <h2>磐石管理后台</h2>
            <p class="subtitle">多集群网关统一管理平台</p>
          </div>

          <a-form :model="form" @finish="handleLogin">
            <a-form-item name="username" :rules="[{ required: true, message: '请输入用户名' }]">
              <a-input
                id="username"
                v-model:value="form.username"
                placeholder="用户名"
                size="large"
                class="glass-input"
              />
            </a-form-item>
            <a-form-item name="password" :rules="[{ required: true, message: '请输入密码' }]">
              <a-input-password
                id="password"
                v-model:value="form.password"
                placeholder="密码"
                size="large"
                class="glass-input"
              />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" html-type="submit" size="large" block :loading="loading" class="glass-btn">
                登录
              </a-button>
            </a-form-item>
          </a-form>
        </div>
      </LiquidGlass>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { LiquidGlass } from '@wxperia/liquid-glass-vue'
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
    message.success('登录成功')
    router.push('/')
  } catch (error: any) {
    message.error(error.response?.data?.detail || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background: linear-gradient(135deg, var(--p-bg-page) 0%, color-mix(in srgb, var(--p-color-info) 15%, var(--p-bg-page)) 30%, var(--p-bg-page) 60%, var(--p-bg-page));
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(color-mix(in srgb, var(--p-color-primary) 15%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--p-color-primary) 15%, transparent) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 15%, transparent 65%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 15%, transparent 65%);
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  animation: orbFloat 12s ease-in-out infinite;
}

.bg-orb-1 {
  width: 500px;
  height: 500px;
  left: -150px;
  top: -150px;
  background: radial-gradient(circle, color-mix(in srgb, var(--p-color-primary) 20%, transparent) 0%, color-mix(in srgb, var(--p-color-primary) 5%, transparent) 60%, transparent 100%);
  animation-delay: 0s;
}

.bg-orb-2 {
  width: 420px;
  height: 420px;
  right: -120px;
  bottom: -100px;
  background: radial-gradient(circle, color-mix(in srgb, var(--p-color-info) 18%, transparent) 0%, color-mix(in srgb, var(--p-color-info) 5%, transparent) 60%, transparent 100%);
  animation-delay: -4s;
}

.bg-orb-3 {
  width: 300px;
  height: 300px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, color-mix(in srgb, var(--p-color-primary) 10%, transparent) 0%, transparent 60%);
  animation-delay: -8s;
}

@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(40px, -30px) scale(1.08); }
  66% { transform: translate(-30px, 25px) scale(0.92); }
}

.login-wrapper {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 420px;
  z-index: 1;
}

.login-glass-card {
  width: 100%;
}

.login-card-inner {
  padding: 40px 36px 32px;
}

.logo-area {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--p-radius-xl);
  background: linear-gradient(135deg, var(--p-color-primary), var(--p-color-info));
  color: #fff;
  font-size: 26px;
  font-weight: bold;
  margin-bottom: 16px;
  box-shadow: 0 8px 32px color-mix(in srgb, var(--p-color-primary) 40%, transparent);
}

h2 {
  text-align: center;
  margin-bottom: 6px;
  color: var(--p-text-primary);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 2px;
}

.subtitle {
  text-align: center;
  color: var(--p-text-tertiary);
  font-size: 13px;
  margin: 0;
}

:deep(.glass-input) {
  background: var(--p-bg-input) !important;
  border: 1px solid var(--p-border-default) !important;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: var(--p-text-primary) !important;
  transition: border-color 0.25s, box-shadow 0.25s;
}

:deep(.glass-input):hover {
  border-color: var(--p-border-hover) !important;
}

:deep(.glass-input):focus,
:deep(.glass-input-focused) {
  border-color: var(--p-color-primary) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-color-primary) 20%, transparent) !important;
}

:deep(.glass-input)::placeholder {
  color: var(--p-text-disabled) !important;
}

:deep(.glass-input) .ant-input-password-icon {
  color: var(--p-text-tertiary);
}

:deep(.glass-input) .ant-input-password-icon:hover {
  color: var(--p-text-secondary);
}

:deep(.glass-input) .ant-input {
  background: transparent !important;
  color: var(--p-text-primary) !important;
}

:deep(.glass-btn) {
  height: 44px;
  font-size: 16px;
  border: none;
  background: linear-gradient(135deg, var(--p-color-primary), var(--p-color-info)) !important;
  box-shadow: 0 4px 20px color-mix(in srgb, var(--p-color-primary) 35%, transparent) !important;
  transition: opacity 0.25s, box-shadow 0.25s;
}

:deep(.glass-btn):hover {
  opacity: 0.92;
  box-shadow: 0 6px 28px color-mix(in srgb, var(--p-color-primary) 45%, transparent) !important;
}

:deep(.glass-btn):active {
  opacity: 0.85;
}
</style>

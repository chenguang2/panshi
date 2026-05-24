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
  background: linear-gradient(135deg, #0a0e27 0%, #1a1040 30%, #0d1b3e 60%, #0a0e27 100%);
}

/* ---- Background elements ---- */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(24, 144, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(24, 144, 255, 0.08) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  animation: orbFloat 10s ease-in-out infinite;
}

.bg-orb-1 {
  width: 450px;
  height: 450px;
  left: -120px;
  top: -120px;
  background: radial-gradient(circle, rgba(24, 144, 255, 0.3) 0%, rgba(24, 144, 255, 0.05) 60%, transparent 100%);
  animation-delay: 0s;
}

.bg-orb-2 {
  width: 380px;
  height: 380px;
  right: -80px;
  bottom: -80px;
  background: radial-gradient(circle, rgba(124, 58, 237, 0.25) 0%, rgba(124, 58, 237, 0.05) 60%, transparent 100%);
  animation-delay: -3s;
}

.bg-orb-3 {
  width: 250px;
  height: 250px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(24, 144, 255, 0.12) 0%, transparent 60%);
  animation-delay: -6s;
}

@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(40px, -30px) scale(1.08); }
  66% { transform: translate(-30px, 25px) scale(0.92); }
}

/* ---- Card centering wrapper ---- */
.login-wrapper {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 420px;
  z-index: 1;
  /* Note: LiquidGlass internally applies translate(-50%, -50%)
     to center itself, so we place the wrapper origin at (50%, 50%)
     and let LiquidGlass handle the centering from there. */
}

.login-glass-card {
  width: 100%;
}

.login-card-inner {
  padding: 40px 36px 32px;
}

/* ---- Logo area ---- */
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
  border-radius: 14px;
  background: linear-gradient(135deg, #1890ff, #7c3aed);
  color: #fff;
  font-size: 26px;
  font-weight: bold;
  margin-bottom: 16px;
  box-shadow: 0 8px 32px rgba(24, 144, 255, 0.3);
}

h2 {
  text-align: center;
  margin-bottom: 6px;
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 2px;
}

.subtitle {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin: 0;
}

/* ---- Glass inputs (override Ant Design) ---- */
:deep(.glass-input) {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: #fff !important;
  transition: border-color 0.25s, box-shadow 0.25s;
}

:deep(.glass-input):hover {
  border-color: rgba(24, 144, 255, 0.5) !important;
}

:deep(.glass-input):focus,
:deep(.glass-input-focused) {
  border-color: #1890ff !important;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2) !important;
}

:deep(.glass-input)::placeholder {
  color: rgba(255, 255, 255, 0.35) !important;
}

/* Password visibility toggle */
:deep(.glass-input) .ant-input-password-icon {
  color: rgba(255, 255, 255, 0.5);
}

:deep(.glass-input) .ant-input-password-icon:hover {
  color: rgba(255, 255, 255, 0.85);
}

/* Ant Design input wrapper inside password */
:deep(.glass-input) .ant-input {
  background: transparent !important;
  color: #fff !important;
}

/* ---- Glass button ---- */
:deep(.glass-btn) {
  height: 44px;
  font-size: 16px;
  border: none;
  background: linear-gradient(135deg, #1890ff 0%, #7c3aed 100%) !important;
  box-shadow: 0 4px 20px rgba(24, 144, 255, 0.35) !important;
  transition: opacity 0.25s, box-shadow 0.25s;
}

:deep(.glass-btn):hover {
  opacity: 0.92;
  box-shadow: 0 6px 28px rgba(24, 144, 255, 0.5) !important;
}

:deep(.glass-btn):active {
  opacity: 0.85;
}
</style>

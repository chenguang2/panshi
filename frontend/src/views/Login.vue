<template>
  <div class="login-body">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-brand-icon">磐</div>
        <span class="login-brand-name">磐石 Gateway</span>
        <span class="login-brand-sub">API 网关管理平台</span>
        <div class="login-divider"></div>
      </div>

      <div v-if="errorMsg" class="login-error">
        <span class="login-error-icon">&#x26A0;</span>
        <span>{{ errorMsg }}</span>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="login-field">
          <label class="form-label" for="username">用户名 <span class="required">*</span></label>
          <div class="login-input-wrap">
            <span class="login-input-icon">&#x1F464;</span>
            <input
              id="username"
              v-model="username"
              type="text"
              class="form-input"
              placeholder="请输入管理员账号"
              autocomplete="username"
              required
            >
          </div>
        </div>

        <div class="login-field">
          <label class="form-label" for="password">密码 <span class="required">*</span></label>
          <div class="login-input-wrap">
            <span class="login-input-icon">&#x1F512;</span>
            <input
              id="password"
              v-model="password"
              type="password"
              class="form-input"
              placeholder="请输入密码"
              autocomplete="current-password"
              required
            >
          </div>
        </div>

        <div class="login-options">
          <label class="checkbox-label">
            <input v-model="remember" type="checkbox" checked>
            <span>记住我</span>
          </label>
          <a href="#" class="forgot-link" tabindex="-1">忘记密码?</a>
        </div>

        <button type="submit" class="login-btn btn btn-primary" :class="{ loading }" :disabled="loading">
          <span class="btn-spinner"></span>
          <span class="btn-text">登 录</span>
        </button>
      </form>

      <div class="login-token-hint">
        <span>&#x1F511;</span>
        <span>Bearer</span>
        <span class="token-dot"></span>
        <span class="token-dot"></span>
        <span class="token-dot"></span>
        <span class="token-dot"></span>
        <span class="token-dot"></span>
      </div>

      <div class="login-footer">
        <div class="login-footer-version">磐石 Gateway Admin v1.0</div>
        <div class="login-footer-copy">&copy; 2024 Panshi Gateway</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const remember = ref(true)
const loading = ref(false)
const errorMsg = ref('')

const handleLogin = async () => {
  if (!username.value.trim() && !password.value.trim()) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  if (!username.value.trim()) {
    errorMsg.value = '请输入用户名'
    return
  }
  if (!password.value.trim()) {
    errorMsg.value = '请输入密码'
    return
  }

  loading.value = true
  errorMsg.value = ''
  try {
    await authStore.login(username.value.trim(), password.value.trim())
    router.push('/')
  } catch (error: any) {
    errorMsg.value = error.response?.data?.detail || '用户名或密码错误，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-body {
  background: var(--sidebar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  position: relative;
}

.login-body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse 600px 400px at 50% 40%, color-mix(in srgb, var(--accent) 6%, transparent), transparent);
  pointer-events: none;
}

.login-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 400px;
  padding: 44px 36px 32px;
  animation: cardFadeIn 0.4s ease;
}

@keyframes cardFadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.login-brand {
  text-align: center;
  margin-bottom: 36px;
}

.login-brand-icon {
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, var(--accent), var(--info));
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 14px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 25%, transparent);
}

.login-brand-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--fg);
  display: block;
  line-height: 1.3;
}

.login-brand-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  font-weight: 400;
  letter-spacing: 0.03em;
}

.login-divider {
  width: 32px;
  height: 2px;
  background: var(--accent);
  border-radius: 2px;
  margin: 16px auto 20px;
  opacity: 0.5;
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 18%, transparent);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--danger);
  line-height: 1.4;
}

.login-error-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.login-field {
  margin-bottom: 18px;
}

.login-field .form-input {
  height: 42px;
  padding: 0 14px;
  font-size: 14px;
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

.form-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--fg);
  outline: none;
  transition: border-color 0.25s, box-shadow 0.25s;
}

.form-input::placeholder {
  color: var(--muted);
}

.form-input:hover {
  border-color: var(--accent);
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
}

.login-input-wrap {
  position: relative;
}

.login-input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 15px;
  pointer-events: none;
  opacity: 0.5;
}

.login-input-wrap .form-input {
  padding-left: 36px;
}

.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
  border-radius: 3px;
}

.forgot-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}

.forgot-link:hover {
  text-decoration: underline;
}

.login-btn {
  width: 100%;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  border-radius: var(--radius-md);
  transition: all 0.15s;
  cursor: pointer;
  letter-spacing: 0.02em;
  border: none;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--info));
  box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent);
}

.login-btn:hover {
  opacity: 0.92;
  box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 40%, transparent);
}

.login-btn:active {
  opacity: 0.85;
}

.login-btn.loading {
  pointer-events: none;
  opacity: 0.85;
}

.login-btn .btn-spinner {
  display: none;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-btn.loading .btn-spinner {
  display: inline-block;
}

.login-btn.loading .btn-text {
  display: none;
}

.login-token-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 18px;
  font-size: 11px;
  color: color-mix(in srgb, var(--muted) 50%, transparent);
  font-family: var(--font-mono, var(--font-mono));
}

.token-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
}

.login-footer {
  text-align: center;
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.login-footer-version {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono, var(--font-mono));
  font-weight: 500;
  letter-spacing: 0.02em;
}

.login-footer-copy {
  font-size: 10px;
  color: color-mix(in srgb, var(--muted) 50%, transparent);
  margin-top: 4px;
}
</style>

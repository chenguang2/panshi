<!-- =========================================================
  演示文件：Login.vue 从裸 HTML 改回 Ant Design 组件 + CSS 覆写
  这个文件仅用于展示改法，不是直接替换源文件。
  核心思路：用 Ant Design 组件接管行为（验证、加载状态、无障碍），
  用自定义 CSS 控制视觉效果保持设计稿。
  ========================================================= -->
<template>
  <div class="login-body">
    <div class="login-card">
      <!-- 品牌区域：保留原生 HTML，不是表单行为，不需要 Ant Design -->
      <div class="login-brand">
        <div class="login-brand-icon">磐</div>
        <span class="login-brand-name">磐石 Gateway</span>
        <span class="login-brand-sub">API 网关管理平台</span>
        <div class="login-divider"></div>
      </div>

      <!-- 错误提示：保留原生 HTML，轻量展示与 Ant Design 无关 -->
      <div v-if="errorMsg" class="login-error">
        <span class="login-error-icon">&#x26A0;</span>
        <span>{{ errorMsg }}</span>
      </div>

      <!-- ↓↓↓ 改这里：裸 <form> + <input> → Ant Design ↓↓↓ -->
      <a-form
        ref="formRef"
        :model="formState"
        :rules="formRules"
        @finish="handleLogin"
        layout="vertical"
        class="login-form"
      >
        <a-form-item
          name="username"
          label="用户名"
          :colon="false"
        >
          <a-input
            id="username"
            v-model:value="formState.username"
            placeholder="请输入管理员账号"
            autocomplete="username"
            size="large"
          >
            <template #prefix>
              <span class="ant-input-icon">&#x1F464;</span>
            </template>
          </a-input>
        </a-form-item>

        <a-form-item
          name="password"
          label="密码"
          :colon="false"
        >
          <a-input-password
            id="password"
            v-model:value="formState.password"
            placeholder="请输入密码"
            autocomplete="current-password"
            size="large"
          >
            <template #prefix>
              <span class="ant-input-icon">&#x1F512;</span>
            </template>
          </a-input-password>
        </a-form-item>

        <div class="login-options">
          <a-checkbox v-model:checked="formState.remember">记住我</a-checkbox>
          <a href="#" class="forgot-link" tabindex="-1">忘记密码?</a>
        </div>

        <a-form-item style="margin-bottom: 0;">
          <a-button
            type="primary"
            html-type="submit"
            :loading="submitting"
            block
            size="large"
            class="login-btn"
          >
            登 录
          </a-button>
        </a-form-item>
      </a-form>
      <!-- ↑↑↑ 改这里 ↑↑↑ -->

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
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { message } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const errorMsg = ref('')

interface LoginForm {
  username: string
  password: string
  remember: boolean
}

const formState = reactive<LoginForm>({
  username: '',
  password: '',
  remember: true,
})

const formRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { whitespace: true, message: '用户名不能为空', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { whitespace: true, message: '密码不能为空', trigger: 'blur' },
  ],
}

async function handleLogin() {
  errorMsg.value = ''
  submitting.value = true
  try {
    await authStore.login(formState.username.trim(), formState.password.trim())
    router.push('/')
  } catch (error: any) {
    errorMsg.value = error.response?.data?.detail || '用户名或密码错误，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
/* ── 以下是视觉样式，与当前设计稿完全一致 ── */

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

.login-brand { text-align: center; margin-bottom: 36px; }

.login-brand-icon {
  width: 52px; height: 52px;
  background: linear-gradient(135deg, var(--accent), var(--info));
  border-radius: var(--radius-md);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 700; color: #fff;
  margin-bottom: 14px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 25%, transparent);
}

.login-brand-name {
  font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
  color: var(--fg); display: block; line-height: 1.3;
}

.login-brand-sub {
  font-size: 12px; color: var(--muted); margin-top: 4px; font-weight: 400;
}

.login-divider {
  width: 32px; height: 2px;
  background: var(--accent); border-radius: 2px;
  margin: 16px auto 20px; opacity: 0.5;
}

.login-error {
  display: flex; align-items: center; gap: 8px;
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 18%, transparent);
  border-radius: var(--radius-md);
  padding: 10px 12px; margin-bottom: 16px;
  font-size: 12px; color: var(--danger);
}

.login-error-icon { flex-shrink: 0; font-size: 14px; }

/* ── Ant Design 表单样式覆写（保持当前设计稿） ── */

/* 覆写 a-form-item label 样式匹配设计稿 */
.login-form :deep(.ant-form-item) {
  margin-bottom: 18px;
}

.login-form :deep(.ant-form-item-label) {
  padding-bottom: 6px;
}

.login-form :deep(.ant-form-item-label > label) {
  font-size: 13px;
  color: var(--muted) !important;
  font-weight: 500;
  height: auto;
}

/* a-input / a-input-password 高度和圆角 */
.login-form :deep(.ant-input-affix-wrapper),
.login-form :deep(.ant-input) {
  border-radius: var(--radius-md) !important;
}

.login-form :deep(.ant-input-affix-wrapper-lg),
.login-form :deep(.ant-input-lg) {
  padding: 6px 12px;
}

.login-form :deep(.ant-input-prefix) {
  margin-right: 8px;
}

/* 输入框前缀图标 */
.ant-input-icon {
  font-size: 15px;
  opacity: 0.5;
}

/* 选项行 */
.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.forgot-link {
  font-size: 12px;
  color: var(--accent) !important;
  font-weight: 500;
}
.forgot-link:hover {
  text-decoration: underline;
}

/* 登录按钮 —— a-button 的视觉完全匹配设计稿 */
.login-btn {
  height: 42px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  letter-spacing: 0.02em !important;
  border: none !important;
  border-radius: var(--radius-md) !important;
  background: linear-gradient(135deg, var(--accent), var(--info)) !important;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent) !important;
}
.login-btn:hover {
  opacity: 0.92 !important;
  box-shadow: 0 6px 24px color-mix(in srgb, var(--accent) 40%, transparent) !important;
  background: linear-gradient(135deg, var(--accent), var(--info)) !important;
}
.login-btn:active {
  opacity: 0.85 !important;
}

/* 底部装饰 */
.login-token-hint {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-top: 18px; font-size: 11px;
  color: color-mix(in srgb, var(--muted) 50%, transparent);
}

.token-dot {
  display: inline-block; width: 5px; height: 5px;
  border-radius: 50%; background: currentColor; opacity: 0.4;
}

.login-footer {
  text-align: center; margin-top: 28px;
  padding-top: 16px; border-top: 1px solid var(--border);
}

.login-footer-version {
  font-size: 11px; color: var(--muted); font-weight: 500;
  letter-spacing: 0.02em;
}

.login-footer-copy {
  font-size: 10px; color: color-mix(in srgb, var(--muted) 50%, transparent);
  margin-top: 4px;
}
</style>

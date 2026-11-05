<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import AppModal from './AppModal.vue'
import { changePassword } from '@/api/auth'
import type { ChangePasswordResponse } from '@/types'

// 修改密码弹窗（default-password-guard-switch D5）：同一组件服务两个场景——
// ① 守卫强制场景（默认）：不可关闭（无 X / ESC / 遮罩点击均不生效，父级不响应关闭），
//    改密成功换发 token 后由父级关闭并继续原流程；
// ② 顶栏「修改密码」一般入口：closable 模式，可取消。
const props = withDefaults(
  defineProps<{
    open: boolean
    /** 一般入口模式：允许关闭；守卫强制场景保持默认 false */
    closable?: boolean
    /** 提示文案（强制场景传默认口令提示；一般入口不传） */
    tip?: string
  }>(),
  { closable: false, tip: '' },
)

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'success', data: ChangePasswordResponse): void
}>()

const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const fieldErrors = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const submitting = ref(false)
const errorMsg = ref('')

watch(
  () => props.open,
  (v) => {
    if (v) resetForm()
  },
)

function resetForm() {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  fieldErrors.oldPassword = ''
  fieldErrors.newPassword = ''
  fieldErrors.confirmPassword = ''
  errorMsg.value = ''
}

function validate(): boolean {
  fieldErrors.oldPassword = form.oldPassword ? '' : '请输入当前密码'
  if (!form.newPassword) {
    fieldErrors.newPassword = '请输入新密码'
  } else if (form.newPassword.length < 6) {
    fieldErrors.newPassword = '新密码长度不能少于6个字符'
  } else if (!/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) {
    fieldErrors.newPassword = '新密码须包含字母和数字'
  } else {
    fieldErrors.newPassword = ''
  }
  fieldErrors.confirmPassword = form.confirmPassword === form.newPassword ? '' : '两次输入的新密码不一致'
  return !fieldErrors.oldPassword && !fieldErrors.newPassword && !fieldErrors.confirmPassword
}

/** 错误 detail 兼容 string（常规端点）与 {code,message}（默认口令守卫 403/校验）两形态 */
function extractDetail(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const m = (detail as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return '密码修改失败，请重试'
}

async function handleSubmit() {
  errorMsg.value = ''
  if (!validate()) return
  submitting.value = true
  try {
    const data = await changePassword(form.oldPassword, form.newPassword)
    message.success('密码修改成功')
    emit('success', data)
    resetForm()
    if (props.closable) emit('update:open', false)
  } catch (error) {
    errorMsg.value = extractDetail(error)
  } finally {
    submitting.value = false
  }
}

function handleCancel() {
  if (props.closable) emit('update:open', false)
}
</script>

<template>
  <AppModal
    :open="open"
    title="修改密码"
    :width="420"
    :footer="null"
    :closable="closable"
    @update:open="handleCancel"
    @cancel="handleCancel"
  >
    <div class="force-pwd-body">
      <div v-if="tip" class="force-pwd-tip">{{ tip }}</div>
      <div class="force-pwd-field">
        <label class="force-pwd-label">当前密码</label>
        <a-input-password
          v-model:value="form.oldPassword"
          placeholder="请输入当前密码"
          :status="fieldErrors.oldPassword ? 'error' : undefined"
        />
        <div v-if="fieldErrors.oldPassword" class="force-pwd-error">{{ fieldErrors.oldPassword }}</div>
      </div>
      <div class="force-pwd-field">
        <label class="force-pwd-label">新密码</label>
        <a-input-password
          v-model:value="form.newPassword"
          placeholder="6-50 位，须包含字母和数字"
          :status="fieldErrors.newPassword ? 'error' : undefined"
        />
        <div v-if="fieldErrors.newPassword" class="force-pwd-error">{{ fieldErrors.newPassword }}</div>
      </div>
      <div class="force-pwd-field">
        <label class="force-pwd-label">确认新密码</label>
        <a-input-password
          v-model:value="form.confirmPassword"
          placeholder="再次输入新密码"
          :status="fieldErrors.confirmPassword ? 'error' : undefined"
        />
        <div v-if="fieldErrors.confirmPassword" class="force-pwd-error">{{ fieldErrors.confirmPassword }}</div>
      </div>
      <div v-if="errorMsg" class="force-pwd-api-error">{{ errorMsg }}</div>
      <a-button type="primary" block :loading="submitting" class="force-pwd-submit" @click="handleSubmit">
        修改密码
      </a-button>
    </div>
  </AppModal>
</template>

<style scoped>
.force-pwd-tip {
  background: color-mix(in srgb, #faad14 10%, transparent);
  border: 1px solid color-mix(in srgb, #faad14 30%, transparent);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #ad6800;
  margin-bottom: 16px;
}

.force-pwd-field {
  margin-bottom: 14px;
}

.force-pwd-label {
  display: block;
  font-size: 13px;
  color: var(--muted, #666);
  margin-bottom: 6px;
  font-weight: 500;
}

.force-pwd-error {
  font-size: 12px;
  color: var(--danger, #ff4d4f);
  margin-top: 4px;
}

.force-pwd-api-error {
  font-size: 12px;
  color: var(--danger, #ff4d4f);
  background: color-mix(in srgb, var(--danger, #ff4d4f) 8%, transparent);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
}

.force-pwd-submit {
  margin-top: 6px;
}
</style>

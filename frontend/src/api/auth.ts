import api from './index'
import type { ChangePasswordResponse } from '@/types'

/**
 * 自助修改密码（default-password-guard-switch D4）。
 * 成功返回新 access_token 与 user/permissions——旧 token 已被 pwd_ver 机制吊销，
 * 调用方须用返回数据整体刷新会话（stores/auth.applySession），避免二次登录。
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<ChangePasswordResponse> {
  const response = await api.post<ChangePasswordResponse>('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
  return response.data
}

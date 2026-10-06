/**
 * 用户管理（管理员）API 模块 —— 对应后端 app/api/v1/users.py。
 * v3 8C-1：UserList.vue 的内联 axios 调用迁移至此，统一走 api 拦截器。
 */
import api from '@/api/index'
import type { User } from '@/types'

interface UserUpdatePayload {
  role?: string
  status?: number
}

interface UserCreatePayload {
  username: string
  password: string
  role: string
  status: number
}

/** 列表查询参数：全部可选；空值由调用方决定是否传（后端忽略缺省项） */
export interface ListUsersParams {
  page?: number
  page_size?: number
  keyword?: string
  role?: string
  status?: number
}

export function listUsers(params?: ListUsersParams) {
  return api.get<{ total: number; items: User[] }>('/admin/users', { params })
}

export function getMyProfile() {
  return api.get<User>('/admin/users/me')
}

export function createUser(payload: UserCreatePayload) {
  return api.post<User>('/admin/users', payload)
}

export function updateUser(userId: number, payload: UserUpdatePayload) {
  return api.put(`/admin/users/${userId}`, payload)
}

export function updateUserPermissions(userId: number, permissions: string[]) {
  return api.put(`/admin/users/${userId}/permissions`, { permissions })
}

export function updateUserClusters(userId: number, clusterIds: number[]) {
  return api.put(`/admin/users/${userId}/clusters`, { cluster_ids: clusterIds })
}

export function updateUserPassword(userId: number, newPassword: string) {
  return api.put(`/admin/users/${userId}/password`, { new_password: newPassword })
}

export function deleteUser(userId: number) {
  return api.delete(`/admin/users/${userId}`)
}

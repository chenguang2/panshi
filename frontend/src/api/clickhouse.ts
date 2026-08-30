/**
 * ClickHouse 连接配置管理 API（openspec: add-clickhouse-config-page）。
 *
 * 后端契约（登录 + clickhouse_config 权限）：
 * - GET    /clickhouse/connections              列表（永不回显密码，password_set/is_active 标记）
 * - POST   /clickhouse/connections              新建（首条自动激活）
 * - PUT    /clickhouse/connections/{id}         更新（password 留空 = 保留原密码）
 * - DELETE /clickhouse/connections/{id}         删除（激活连接 400）
 * - POST   /clickhouse/connections/test         未保存表单试连（可选 id：密码留空用已存）
 * - POST   /clickhouse/connections/{id}/test    已存连接试连
 * - POST   /clickhouse/activate                 切换激活（保存即生效，免重启）
 */
import api from '@/api'
import type { AxiosResponse } from 'axios'

export interface ClickhouseConnectionPublic {
  id: string
  name: string
  host: string
  port: number
  database: string
  user: string
  connect_timeout: number
  password_set: boolean
  is_active: boolean
}

export interface ClickhouseListResult {
  active: string | null
  items: ClickhouseConnectionPublic[]
}

export interface ClickhouseConnectionPayload {
  name: string
  host: string
  port: number
  database: string
  user: string
  password?: string | null
  connect_timeout: number
  id?: string
}

export interface ClickhouseTestResult {
  ok: boolean
  error: string | null
}

export function listConnections(): Promise<AxiosResponse<ClickhouseListResult>> {
  return api.get('/clickhouse/connections')
}

export function createConnection(
  payload: ClickhouseConnectionPayload,
): Promise<AxiosResponse<ClickhouseConnectionPublic>> {
  return api.post('/clickhouse/connections', payload)
}

export function updateConnection(
  id: string,
  payload: ClickhouseConnectionPayload,
): Promise<AxiosResponse<ClickhouseConnectionPublic>> {
  return api.put(`/clickhouse/connections/${id}`, payload)
}

export function deleteConnection(id: string): Promise<AxiosResponse<{ ok: boolean }>> {
  return api.delete(`/clickhouse/connections/${id}`)
}

export function activateConnection(id: string): Promise<AxiosResponse<{ ok: boolean; active: string }>> {
  return api.post('/clickhouse/activate', { id })
}

export function testConnectionForm(payload: ClickhouseConnectionPayload): Promise<AxiosResponse<ClickhouseTestResult>> {
  return api.post('/clickhouse/connections/test', payload)
}

export function testSavedConnection(id: string): Promise<AxiosResponse<ClickhouseTestResult>> {
  return api.post(`/clickhouse/connections/${id}/test`, {})
}

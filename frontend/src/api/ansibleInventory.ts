/**
 * Ansible 主机清单管理 API。
 *
 * 后端契约（管理员限定，feature: ansible_inventory）：
 * - GET  /ansible/inventory          清单查看（结构化 + 原文 + unknown_keys + unmanaged_ips）
 * - PUT  /ansible/inventory          保存（raw_text 或 hosts+vars 二选一载荷；400 带 detail，任务运行中 409）
 * - POST /ansible/inventory/render   表格草稿 → YAML 文本（表格 ⇄ 源码切换用）
 * - POST /ansible/inventory/parse    原文 → 结构化 + 错误列表（errors 非空表示解析失败）
 */
import api from '@/api'
import type { AxiosResponse } from 'axios'

/** 主机条目：除 ip 外可能携带 ansible_ssh_user/ansible_ssh_pass 与未知自定义键（必须全保真保留）。 */
export interface InventoryHostEntry {
  ip: string
  [key: string]: unknown
}

export interface InventoryData {
  raw_text: string
  hosts: InventoryHostEntry[]
  vars: Record<string, unknown>
  unknown_keys: string[]
  unmanaged_ips: string[]
  /** 文件存在但解析失败时的错误信息（空数组 = 正常）。 */
  errors: string[]
}

/** 保存载荷二选一：源码模式传 raw_text；表格模式传 hosts + vars。 */
export interface InventorySavePayload {
  raw_text?: string
  hosts?: InventoryHostEntry[]
  vars?: Record<string, unknown>
}

export interface InventoryParseResult {
  hosts: InventoryHostEntry[]
  vars: Record<string, unknown>
  unknown_keys: string[]
  errors: string[]
}

export function getInventory(): Promise<AxiosResponse<InventoryData>> {
  return api.get('/ansible/inventory')
}

export function saveInventory(payload: InventorySavePayload): Promise<AxiosResponse<{ ok: boolean }>> {
  return api.put('/ansible/inventory', payload)
}

export function renderInventory(
  hosts: InventoryHostEntry[],
  vars: Record<string, unknown>,
): Promise<AxiosResponse<{ text: string }>> {
  return api.post('/ansible/inventory/render', { hosts, vars })
}

export function parseInventory(rawText: string): Promise<AxiosResponse<InventoryParseResult>> {
  return api.post('/ansible/inventory/parse', { raw_text: rawText })
}

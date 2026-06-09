/**
 * Shared column definitions for EdgeClient.vue and EdgeImport.vue.
 * 
 * Both pages display the same Edge node data with identical table columns,
 * but this file was duplicated across both files.
 */

import type { TableColumnType } from 'ant-design-vue'

export const upstreamColumns: TableColumnType[] = [
  { title: '#', key: 'index', width: 45 },
  { title: 'ID', key: 'id', width: 200 },
  { title: '名称', key: 'name', width: 150 },
  { title: '类型', key: 'type', width: 100 },
  { title: '节点数', key: 'nodes', width: 100 },
  { title: '操作', key: 'actions', width: 150 },
]

export const routeColumns: TableColumnType[] = [
  { title: '#', key: 'index', width: 45 },
  { title: 'ID', key: 'id', width: 200 },
  { title: '名称', key: 'name', width: 120 },
  { title: 'URI', key: 'uri', width: 150 },
  { title: '方法', key: 'methods', width: 180 },
  { title: '上游', key: 'upstream', width: 150 },
  { title: '操作', key: 'actions', width: 150 },
]

export const pluginMetadataColumns: TableColumnType[] = [
  { title: '#', key: 'index', width: 45 },
  { title: '插件名称', key: 'name', width: 200 },
  { title: '配置', key: 'config' },
  { title: '操作', key: 'actions', width: 200 },
]

export const pluginListColumns: TableColumnType[] = [
  { title: '#', key: 'index', width: 45 },
  { title: '插件名称', key: 'name', width: 300 },
]

export const globalRuleColumns: TableColumnType[] = [
  { title: '#', key: 'index', width: 45 },
  { title: 'ID', key: 'id', width: 120 },
  { title: '描述', key: 'desc', width: 150 },
  { title: '插件数', key: 'plugins', width: 100 },
  { title: '操作', key: 'actions', width: 200 },
]

export const pluginConfigColumns: TableColumnType[] = [
  { title: '#', key: 'index', width: 45 },
  { title: 'ID', key: 'id', width: 120 },
  { title: '描述', key: 'desc', width: 150 },
  { title: '插件数', key: 'plugins', width: 80 },
  { title: 'Labels', key: 'labels', width: 80 },
  { title: 'Hosts', key: 'hosts', width: 80 },
  { title: '操作', key: 'actions', width: 200 },
]

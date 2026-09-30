<template>
  <div class="db-migration-page">
    <PageHeader
      title="数据迁移"
      description="在 SQLite 与 PostgreSQL 之间单向快照迁移，支持实时进度、进行中状态恢复与迁移历史管理；迁移期间全局写暂停，请避开业务高峰。"
    >
    </PageHeader>
    <DbMigrationCard :connections="connections" :active-db-name="activeDbName" @switch-connection="goSwitchTarget" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import DbMigrationCard from '@/components/DbMigrationCard.vue'
import { getDatabaseStatus, listConnections } from '@/api/database'
import type { DbConnection } from '@/types/database'

const router = useRouter()

const connections = ref<DbConnection[]>([])
const activeDbName = ref('未配置')

onMounted(async () => {
  const [s, cs] = await Promise.all([getDatabaseStatus(), listConnections()])
  activeDbName.value = s.data.active?.name || '未配置'
  connections.value = cs.data
})

/** 独立页不复制切换弹窗：迁移完成后「去切换数据库」导航回数据库管理页操作 */
function goSwitchTarget(): void {
  void router.push('/database-management')
}
</script>

<style scoped>
/* 页面容器只做纵向布局与间距（备份与容灾页同款派系；不设 padding，内容边界由布局层统一控制） */
.db-migration-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>

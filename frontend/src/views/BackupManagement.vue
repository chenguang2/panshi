<template>
  <div class="backup-management">
    <PageHeader
      title="备份与容灾"
      description="SQLite 定时备份推送到多个远端位置，支持容灾恢复；全局策略与备份位置在此集中管理。"
    >
    </PageHeader>
    <DbBackupCard :initial-wizard="openWizardOnMount" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import DbBackupCard from '@/components/DbBackupCard.vue'

const route = useRoute()

/** 灾难恢复入口深链：数据库管理页「灾难恢复」跳转 /backup-management?wizard=1，挂载即打开恢复向导 */
const openWizardOnMount = computed(() => route.query.wizard === '1' || route.query.wizard === 'true')
</script>

<style scoped>
/* 页面容器只做纵向布局与间距（数据库管理页同款派系；内容左右边界由布局层统一控制） */
.backup-management {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>

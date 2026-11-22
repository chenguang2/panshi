<template>
  <div v-if="bootstrapSettled" class="notfound-page">
    <EmptyState title="页面不存在或功能未启用" description="请检查地址，或该功能在当前部署中已关闭">
      <button type="button" class="btn btn-secondary" @click="goHome">返回概览</button>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'
import { bootstrapSettled } from '@/router/bootstrapState'

/**
 * catch-all 占位路由视图（`BootstrapPlaceholder`，批次 B3）。
 *
 * 两个职责：① 未知路径的 404 空态；② bootstrap 阶段 feature-gated 深链的
 * 暂定落点（此时动态路由还没注册，见 `router/bootstrapState.ts` 的说明）。
 * 后者只在 `bootstrapSettled` 之后渲染空态，避免首访页面时 404 闪现。
 * 解剖复用共享空态原语 `.empty5`（EmptyState），不新增布局壳与设计体系。
 */
const router = useRouter()

function goHome(): void {
  router.push('/')
}
</script>

<style scoped>
.notfound-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.notfound-page :deep(.empty5) {
  max-width: 420px;
}
</style>

<template>
  <div class="cluster-manage">
    <div class="header-section">
      <h2>集群管理</h2>
    </div>
    <div class="placeholder-content">
      <a-empty description="集群管理页面开发中..." />
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.cluster-manage {
  padding: 24px;
}
.header-section {
  margin-bottom: 24px;
}
.header-section h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--heading-color);
  margin: 0;
}
.placeholder-content {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}
</style>

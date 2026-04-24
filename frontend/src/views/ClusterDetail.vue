<template>
  <div class="cluster-detail">
    <a-page-header :title="cluster?.name || 'Cluster'" @back="() => router.push('/clusters')" />

    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="upstreams" tab="Upstreams">
        <UpstreamList :cluster-id="clusterId" />
      </a-tab-pane>
      <a-tab-pane key="routes" tab="Routes">
        <RouteList :cluster-id="clusterId" />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import api from '@/api'
import UpstreamList from '@/components/UpstreamList.vue'
import RouteList from '@/components/RouteList.vue'

const route = useRoute()
const router = useRouter()
const clusterId = Number(route.params.id)
const cluster = ref<any>(null)
const activeTab = ref('upstreams')

const loadCluster = async () => {
  try {
    const res = await api.get(`/clusters/${clusterId}`)
    cluster.value = res.data
  } catch (error) {
    message.error('Failed to load cluster')
  }
}

onMounted(loadCluster)
</script>
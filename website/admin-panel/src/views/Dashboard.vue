<template>
  <div class="dashboard">
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="今日请求数" :value="stats.todayRequests" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="今日 Token 消耗" :value="stats.todayTokens" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="今日营收 (CNY)" :value="stats.todayRevenue" :precision="2" />
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <el-statistic title="活跃用户数" :value="stats.activeUsers" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="health-row">
      <el-col :span="24">
        <el-card>
          <template #header>
            <span>提供商健康状态</span>
          </template>
          <el-table :data="providerHealth" stripe>
            <el-table-column prop="name" label="提供商" />
            <el-table-column prop="health_status" label="状态">
              <template #default="{ row }">
                <el-tag :type="healthTagType(row.health_status)">
                  {{ row.health_status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="avg_latency_ms" label="平均延迟 (ms)" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import apiClient from '@/api/client'

interface DashboardStats {
  todayRequests: number
  todayTokens: number
  todayRevenue: number
  activeUsers: number
}

interface ProviderHealth {
  id: number
  name: string
  health_status: string
  avg_latency_ms: number
}

const stats = ref<DashboardStats>({
  todayRequests: 0,
  todayTokens: 0,
  todayRevenue: 0,
  activeUsers: 0,
})

const providerHealth = ref<ProviderHealth[]>([])

function healthTagType(status: string) {
  switch (status) {
    case 'healthy':
      return 'success'
    case 'degraded':
      return 'warning'
    case 'down':
      return 'danger'
    default:
      return 'info'
  }
}

async function fetchProviders() {
  try {
    const res = await apiClient.get<ProviderHealth[]>('/providers')
    providerHealth.value = res.data
  } catch {
    // silently ignore - providers might not be configured yet
  }
}

onMounted(() => {
  // Stats are placeholder values since there's no dedicated stats API yet
  stats.value = {
    todayRequests: 0,
    todayTokens: 0,
    todayRevenue: 0,
    activeUsers: 0,
  }
  fetchProviders()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.stats-row {
  margin-bottom: 16px;
}

.health-row {
  margin-top: 16px;
}
</style>

<template>
  <div class="routing-page">
    <el-table :data="routingConfigs" stripe v-loading="loading">
      <el-table-column prop="model_id" label="模型 ID" width="90" />
      <el-table-column prop="strategy" label="策略">
        <template #default="{ row }">
          <el-tag>{{ row.strategy }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="fallback_chain" label="Fallback Chain">
        <template #default="{ row }">
          {{ row.fallback_chain ? JSON.stringify(row.fallback_chain) : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="rate_limit_rpm" label="速率限制 (RPM)" width="130" />
      <el-table-column prop="updated_at" label="更新时间" width="180" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-divider />

    <el-card>
      <template #header>
        <span>为模型配置路由策略</span>
      </template>
      <el-form :model="newForm" label-width="120px" inline>
        <el-form-item label="模型 ID">
          <el-input-number v-model="newForm.model_id" :min="1" />
        </el-form-item>
        <el-form-item label="策略">
          <el-select v-model="newForm.strategy">
            <el-option
              v-for="s in strategies"
              :key="s"
              :label="s"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="openEditDialog(newForm)">
            配置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Edit dialog -->
    <el-dialog v-model="dialogVisible" title="编辑路由策略" width="520px">
      <el-form :model="editForm" label-width="120px">
        <el-form-item label="模型 ID">
          <el-input-number v-model="editForm.model_id" disabled />
        </el-form-item>
        <el-form-item label="策略">
          <el-select v-model="editForm.strategy">
            <el-option
              v-for="s in strategies"
              :key="s"
              :label="s"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Fallback Chain">
          <el-input
            v-model="fallbackChainInput"
            placeholder="提供商 ID 逗号分隔，如: 1,2,3"
          />
          <div class="form-tip">仅 fallback_chain 策略需填写</div>
        </el-form-item>
        <el-form-item label="速率限制 (RPM)">
          <el-input-number v-model="editForm.rate_limit_rpm" :min="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'

interface RoutingConfig {
  id: number
  model_id: number
  strategy: string
  fallback_chain: number[] | null
  rate_limit_rpm: number
  updated_at: string | null
}

const strategies = [
  'cheapest_first',
  'round_robin',
  'priority',
  'fallback_chain',
  'latency_based',
]

const routingConfigs = ref<RoutingConfig[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const fallbackChainInput = ref('')

const newForm = ref({
  model_id: 1,
  strategy: 'priority',
})

const editForm = ref({
  model_id: 1,
  strategy: 'priority',
  fallback_chain: null as number[] | null,
  rate_limit_rpm: 60,
})

async function fetchRouting() {
  loading.value = true
  try {
    const res = await apiClient.get<RoutingConfig[]>('/routing')
    routingConfigs.value = res.data
  } finally {
    loading.value = false
  }
}

function openEditDialog(row: { model_id: number; strategy: string; fallback_chain?: number[] | null; rate_limit_rpm?: number }) {
  editForm.value = {
    model_id: row.model_id,
    strategy: row.strategy,
    fallback_chain: row.fallback_chain || null,
    rate_limit_rpm: row.rate_limit_rpm || 60,
  }
  fallbackChainInput.value = row.fallback_chain ? row.fallback_chain.join(',') : ''
  dialogVisible.value = true
}

async function handleSave() {
  saving.value = true
  try {
    const chain = fallbackChainInput.value.trim()
      ? fallbackChainInput.value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : null

    await apiClient.put(`/routing/${editForm.value.model_id}`, {
      strategy: editForm.value.strategy,
      fallback_chain: chain,
      rate_limit_rpm: editForm.value.rate_limit_rpm,
    })
    ElMessage.success('路由配置已更新')
    dialogVisible.value = false
    await fetchRouting()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(fetchRouting)
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>

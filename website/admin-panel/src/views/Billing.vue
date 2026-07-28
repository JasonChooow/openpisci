<template>
  <div class="billing-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>全局计费配置</span>
          <el-button type="primary" :loading="saving" @click="handleSave">
            保存配置
          </el-button>
        </div>
      </template>

      <el-form label-width="180px" v-loading="loading">
        <el-form-item
          v-for="(item, index) in configs"
          :key="index"
          :label="item.key"
        >
          <el-input v-model="item.value" style="max-width: 400px" />
          <el-button
            class="remove-btn"
            type="danger"
            text
            size="small"
            @click="removeConfig(index)"
          >
            移除
          </el-button>
        </el-form-item>
      </el-form>

      <el-divider />

      <div class="add-config">
        <el-form inline>
          <el-form-item label="Key">
            <el-input v-model="newKey" placeholder="如 daily_free_credits" />
          </el-form-item>
          <el-form-item label="Value">
            <el-input v-model="newValue" placeholder="值" />
          </el-form-item>
          <el-form-item>
            <el-button @click="addConfig">添加配置项</el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'

interface BillingConfigItem {
  id?: number
  key: string
  value: string
  updated_at?: string | null
}

const configs = ref<BillingConfigItem[]>([])
const loading = ref(false)
const saving = ref(false)
const newKey = ref('')
const newValue = ref('')

async function fetchConfig() {
  loading.value = true
  try {
    const res = await apiClient.get<BillingConfigItem[]>('/billing/config')
    configs.value = res.data
  } finally {
    loading.value = false
  }
}

function addConfig() {
  if (!newKey.value.trim()) {
    ElMessage.warning('请输入 Key')
    return
  }
  configs.value.push({ key: newKey.value.trim(), value: newValue.value })
  newKey.value = ''
  newValue.value = ''
}

function removeConfig(index: number) {
  configs.value.splice(index, 1)
}

async function handleSave() {
  saving.value = true
  try {
    const payload = configs.value.map((c) => ({ key: c.key, value: c.value }))
    await apiClient.put('/billing/config', payload)
    ElMessage.success('配置已保存')
    await fetchConfig()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(fetchConfig)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.remove-btn {
  margin-left: 8px;
}

.add-config {
  margin-top: 8px;
}
</style>

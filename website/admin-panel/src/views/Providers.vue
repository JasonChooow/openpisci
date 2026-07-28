<template>
  <div class="providers-page">
    <div class="page-actions">
      <el-button type="primary" @click="openDialog()">新增提供商</el-button>
    </div>

    <el-table :data="providers" stripe v-loading="loading">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="base_url" label="Base URL" />
      <el-table-column prop="is_active" label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="health_status" label="健康状态" width="100">
        <template #default="{ row }">
          <el-tag :type="healthTagType(row.health_status)">
            {{ row.health_status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="avg_latency_ms" label="延迟(ms)" width="90" />
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="success" @click="healthCheck(row.id)">
            健康检查
          </el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑提供商' : '新增提供商'"
      width="480px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如 openai" />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="form.base_url" placeholder="https://api.openai.com" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form.api_key_encrypted"
            type="password"
            placeholder="API Key (加密存储)"
            show-password
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_active" />
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
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'

interface Provider {
  id: number
  name: string
  base_url: string
  is_active: boolean
  health_status: string
  avg_latency_ms: number
  created_at: string | null
}

const providers = ref<Provider[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)

const form = ref({
  name: '',
  base_url: '',
  api_key_encrypted: '',
  is_active: true,
})

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
  loading.value = true
  try {
    const res = await apiClient.get<Provider[]>('/providers')
    providers.value = res.data
  } finally {
    loading.value = false
  }
}

function openDialog(provider?: Provider) {
  if (provider) {
    editingId.value = provider.id
    form.value = {
      name: provider.name,
      base_url: provider.base_url,
      api_key_encrypted: '',
      is_active: provider.is_active,
    }
  } else {
    editingId.value = null
    form.value = { name: '', base_url: '', api_key_encrypted: '', is_active: true }
  }
  dialogVisible.value = true
}

async function handleSave() {
  saving.value = true
  try {
    if (editingId.value) {
      await apiClient.put(`/providers/${editingId.value}`, form.value)
      ElMessage.success('更新成功')
    } else {
      await apiClient.post('/providers', form.value)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    await fetchProviders()
  } catch {
    ElMessage.error('操作失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: number) {
  await ElMessageBox.confirm('确定要删除该提供商吗？', '确认删除', {
    type: 'warning',
  })
  try {
    await apiClient.delete(`/providers/${id}`)
    ElMessage.success('已删除')
    await fetchProviders()
  } catch {
    ElMessage.error('删除失败')
  }
}

async function healthCheck(id: number) {
  try {
    await apiClient.post(`/providers/${id}/health-check`)
    ElMessage.success('健康检查完成')
    await fetchProviders()
  } catch {
    ElMessage.error('健康检查失败')
  }
}

onMounted(fetchProviders)
</script>

<style scoped>
.page-actions {
  margin-bottom: 16px;
}
</style>

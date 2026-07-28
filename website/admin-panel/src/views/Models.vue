<template>
  <div class="models-page">
    <div class="page-actions">
      <el-button type="primary" @click="openModelDialog()">新增模型</el-button>
    </div>

    <el-table :data="models" stripe v-loading="loading">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="模型名称" />
      <el-table-column prop="display_name" label="显示名称" />
      <el-table-column prop="category" label="类别" width="90" />
      <el-table-column prop="is_active" label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openModelDialog(row)">编辑</el-button>
          <el-button size="small" type="primary" @click="openMappingDialog(row)">
            映射管理
          </el-button>
          <el-button size="small" type="danger" @click="handleDelete(row.id)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Model CRUD dialog -->
    <el-dialog
      v-model="modelDialogVisible"
      :title="editingModelId ? '编辑模型' : '新增模型'"
      width="480px"
    >
      <el-form :model="modelForm" label-width="100px">
        <el-form-item label="模型名称">
          <el-input v-model="modelForm.name" placeholder="如 gpt-4o" />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="modelForm.display_name" placeholder="GPT-4o" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="modelForm.description" type="textarea" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="modelForm.category">
            <el-option label="Chat" value="chat" />
            <el-option label="Embedding" value="embedding" />
            <el-option label="Image" value="image" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="modelForm.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modelDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveModel">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- Provider mapping dialog -->
    <el-dialog
      v-model="mappingDialogVisible"
      title="提供商映射管理"
      width="640px"
    >
      <div class="mapping-header">
        <span>模型: {{ currentModelName }}</span>
        <el-button size="small" type="primary" @click="showAddMapping = true">
          添加映射
        </el-button>
      </div>

      <el-table :data="mappings" stripe size="small">
        <el-table-column prop="provider_id" label="提供商 ID" width="100" />
        <el-table-column prop="cost_input_per_1k" label="输入价格/1K" />
        <el-table-column prop="cost_output_per_1k" label="输出价格/1K" />
        <el-table-column prop="priority" label="优先级" width="80" />
        <el-table-column prop="is_active" label="启用" width="70">
          <template #default="{ row }">
            {{ row.is_active ? '是' : '否' }}
          </template>
        </el-table-column>
      </el-table>

      <el-divider v-if="showAddMapping" />

      <el-form v-if="showAddMapping" :model="mappingForm" label-width="120px" class="mapping-form">
        <el-form-item label="提供商 ID">
          <el-input-number v-model="mappingForm.provider_id" :min="1" />
        </el-form-item>
        <el-form-item label="输入价格/1K">
          <el-input-number v-model="mappingForm.cost_input_per_1k" :min="0" :step="0.001" :precision="4" />
        </el-form-item>
        <el-form-item label="输出价格/1K">
          <el-input-number v-model="mappingForm.cost_output_per_1k" :min="0" :step="0.001" :precision="4" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="mappingForm.priority" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="mappingForm.is_active" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleAddMapping">添加</el-button>
          <el-button @click="showAddMapping = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import apiClient from '@/api/client'

interface ModelItem {
  id: number
  name: string
  display_name: string
  description: string | null
  category: string
  is_active: boolean
}

interface ProviderMapping {
  id: number
  provider_id: number
  model_id: number
  cost_input_per_1k: number
  cost_output_per_1k: number
  priority: number
  is_active: boolean
}

const models = ref<ModelItem[]>([])
const loading = ref(false)
const saving = ref(false)

// Model CRUD
const modelDialogVisible = ref(false)
const editingModelId = ref<number | null>(null)
const modelForm = ref({
  name: '',
  display_name: '',
  description: '',
  category: 'chat',
  is_active: true,
})

// Provider mapping
const mappingDialogVisible = ref(false)
const currentModelName = ref('')
const currentModelId = ref<number>(0)
const mappings = ref<ProviderMapping[]>([])
const showAddMapping = ref(false)
const mappingForm = ref({
  provider_id: 1,
  cost_input_per_1k: 0,
  cost_output_per_1k: 0,
  priority: 0,
  is_active: true,
})

async function fetchModels() {
  loading.value = true
  try {
    const res = await apiClient.get<ModelItem[]>('/models')
    models.value = res.data
  } finally {
    loading.value = false
  }
}

function openModelDialog(model?: ModelItem) {
  if (model) {
    editingModelId.value = model.id
    modelForm.value = {
      name: model.name,
      display_name: model.display_name,
      description: model.description || '',
      category: model.category,
      is_active: model.is_active,
    }
  } else {
    editingModelId.value = null
    modelForm.value = { name: '', display_name: '', description: '', category: 'chat', is_active: true }
  }
  modelDialogVisible.value = true
}

async function handleSaveModel() {
  saving.value = true
  try {
    if (editingModelId.value) {
      await apiClient.put(`/models/${editingModelId.value}`, modelForm.value)
      ElMessage.success('更新成功')
    } else {
      await apiClient.post('/models', modelForm.value)
      ElMessage.success('创建成功')
    }
    modelDialogVisible.value = false
    await fetchModels()
  } catch {
    ElMessage.error('操作失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: number) {
  await ElMessageBox.confirm('确定要删除该模型吗？', '确认删除', { type: 'warning' })
  try {
    await apiClient.delete(`/models/${id}`)
    ElMessage.success('已删除')
    await fetchModels()
  } catch {
    ElMessage.error('删除失败')
  }
}

async function openMappingDialog(model: ModelItem) {
  currentModelId.value = model.id
  currentModelName.value = model.display_name
  showAddMapping.value = false
  mappingDialogVisible.value = true
  try {
    const res = await apiClient.get<ProviderMapping[]>(`/models/${model.id}/providers`)
    mappings.value = res.data
  } catch {
    mappings.value = []
  }
}

async function handleAddMapping() {
  try {
    await apiClient.post(`/models/${currentModelId.value}/providers`, mappingForm.value)
    ElMessage.success('映射添加成功')
    showAddMapping.value = false
    const res = await apiClient.get<ProviderMapping[]>(`/models/${currentModelId.value}/providers`)
    mappings.value = res.data
  } catch {
    ElMessage.error('添加失败')
  }
}

onMounted(fetchModels)
</script>

<style scoped>
.page-actions {
  margin-bottom: 16px;
}

.mapping-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.mapping-form {
  margin-top: 12px;
}
</style>

<template>
  <div class="users-page">
    <el-table :data="users" stripe v-loading="loading">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column prop="email" label="邮箱" />
      <el-table-column prop="phone" label="手机" />
      <el-table-column prop="balance" label="余额" width="100">
        <template #default="{ row }">
          {{ row.balance.toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="role" label="角色" width="90">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)">{{ row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="注册时间" width="180" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openBalanceDialog(row)">调整余额</el-button>
          <el-button size="small" @click="openRoleDialog(row)">角色</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next, total"
        @current-change="fetchUsers"
      />
    </div>

    <!-- Balance dialog -->
    <el-dialog v-model="balanceDialogVisible" title="调整余额" width="400px">
      <el-form :model="balanceForm" label-width="80px">
        <el-form-item label="用户">
          <el-input :model-value="balanceTarget" disabled />
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="balanceForm.amount" :step="1" />
          <div class="form-tip">正数增加、负数扣除</div>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="balanceForm.reason" placeholder="如: 手动充值" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="balanceDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleBalanceSave">
          确认
        </el-button>
      </template>
    </el-dialog>

    <!-- Role dialog -->
    <el-dialog v-model="roleDialogVisible" title="修改角色" width="400px">
      <el-form :model="roleForm" label-width="80px">
        <el-form-item label="用户">
          <el-input :model-value="roleTarget" disabled />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="roleForm.role">
            <el-option label="user" value="user" />
            <el-option label="vip" value="vip" />
            <el-option label="banned" value="banned" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleRoleSave">
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import apiClient from '@/api/client'

interface UserItem {
  id: number
  username: string
  email: string | null
  phone: string | null
  balance: number
  role: string
  created_at: string | null
}

interface UserListResponse {
  total: number
  page: number
  page_size: number
  items: UserItem[]
}

const users = ref<UserItem[]>([])
const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)

// Balance adjustment
const balanceDialogVisible = ref(false)
const balanceTarget = ref('')
const balanceUserId = ref<number>(0)
const balanceForm = ref({ amount: 0, reason: '' })

// Role change
const roleDialogVisible = ref(false)
const roleTarget = ref('')
const roleUserId = ref<number>(0)
const roleForm = ref({ role: 'user' })

function roleTagType(role: string) {
  switch (role) {
    case 'vip':
      return 'warning'
    case 'banned':
      return 'danger'
    default:
      return ''
  }
}

async function fetchUsers() {
  loading.value = true
  try {
    const res = await apiClient.get<UserListResponse>('/users', {
      params: { page: page.value, page_size: pageSize },
    })
    users.value = res.data.items
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function openBalanceDialog(user: UserItem) {
  balanceUserId.value = user.id
  balanceTarget.value = `${user.username} (当前余额: ${user.balance.toFixed(2)})`
  balanceForm.value = { amount: 0, reason: '' }
  balanceDialogVisible.value = true
}

async function handleBalanceSave() {
  saving.value = true
  try {
    await apiClient.put(`/users/${balanceUserId.value}/balance`, balanceForm.value)
    ElMessage.success('余额已调整')
    balanceDialogVisible.value = false
    await fetchUsers()
  } catch {
    ElMessage.error('调整失败')
  } finally {
    saving.value = false
  }
}

function openRoleDialog(user: UserItem) {
  roleUserId.value = user.id
  roleTarget.value = user.username
  roleForm.value = { role: user.role }
  roleDialogVisible.value = true
}

async function handleRoleSave() {
  saving.value = true
  try {
    await apiClient.put(`/users/${roleUserId.value}/role`, roleForm.value)
    ElMessage.success('角色已更新')
    roleDialogVisible.value = false
    await fetchUsers()
  } catch {
    ElMessage.error('更新失败')
  } finally {
    saving.value = false
  }
}

onMounted(fetchUsers)
</script>

<style scoped>
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>

<script setup>
import { ref } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { openProject } from '../store/project'

// 后端服务地址（与前端保持同一台机器、同一 IP 127.0.0.1）
const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8765'

// 是否正在创建，避免重复点击
const creating = ref(false)

// 打开项目对话框状态
const openDialog = ref(false)
const loadingProjects = ref(false)
const projectList = ref([])

// 点击“新建项目”，调用后端创建新项目结构
const handleNewProject = async () => {
  if (creating.value) return
  creating.value = true
  try {
    const { data } = await axios.post(`${API_BASE}/api/project/new`)
    if (data.success) {
      ElMessage.success(`新建项目成功：${data.name}`)
      // 自动打开最新创建的项目
      await autoOpenNewest()
    } else {
      ElMessage.error('新建项目失败')
    }
  } catch (error) {
    console.error('新建项目失败', error)
    ElMessage.error('新建项目失败，请检查后端服务是否已启动')
  } finally {
    creating.value = false
  }
}

// 创建成功后自动打开最新的项目（原项目仍保存在磁盘上，可随时重新打开）
const autoOpenNewest = async () => {
  try {
    const { data } = await axios.get(`${API_BASE}/api/project/list`)
    const list = data.projects || []
    if (list.length) {
      try {
        const ok = openProject(list[0])
        if (!ok) ElMessage.error('解析失败')
      } catch (error) {
        console.error('打开项目失败', error)
        ElMessage.error('解析失败')
      }
    }
  } catch (error) {
    console.error('自动打开最新项目失败', error)
  }
}

// 打开“打开项目”对话框，同时拉取项目列表
const showOpenDialog = async () => {
  openDialog.value = true
  loadingProjects.value = true
  try {
    const { data } = await axios.get(`${API_BASE}/api/project/list`)
    projectList.value = data.projects || []
  } catch (error) {
    console.error('获取项目列表失败', error)
    ElMessage.error('获取项目列表失败，请检查后端服务是否已启动')
    projectList.value = []
  } finally {
    loadingProjects.value = false
  }
}

// 选择并打开一个项目
const handleOpen = (project) => {
  try {
    const ok = openProject(project)
    if (!ok) {
      ElMessage.error('解析失败')
      return
    }
    ElMessage.success(`已打开项目：${project.name}`)
  } catch (error) {
    console.error('打开项目失败', error)
    ElMessage.error('解析失败')
  } finally {
    openDialog.value = false
  }
}
</script>

<template>
  <header class="navbar">
    <!-- 左侧：图标 + 工具名 -->
    <div class="navbar-left">
      <img class="navbar-logo" src="/favicon.png" alt="UIZed" />
      <span class="navbar-title">UIZed</span>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="navbar-right">
      <button type="button" class="navbar-btn" @click="handleNewProject">
        {{ creating ? '创建中…' : '新建项目' }}
      </button>
      <button type="button" class="navbar-btn navbar-btn-primary" @click="showOpenDialog">
        打开项目
      </button>
    </div>

    <!-- 打开项目对话框 -->
    <el-dialog v-model="openDialog" title="打开项目" width="560px">
      <div v-loading="loadingProjects" class="project-dialog-body">
        <el-table :data="projectList" style="width: 100%" size="small" v-if="projectList.length">
          <el-table-column prop="name" label="项目名" min-width="160" />
          <el-table-column prop="path" label="路径" min-width="240" show-overflow-tooltip />
          <el-table-column label="操作" width="90" align="center">
            <template #default="{ row }">
              <el-button type="primary" size="small" @click="handleOpen(row)">打开</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!loadingProjects" description="暂无项目，请先新建项目" />
      </div>
    </el-dialog>
  </header>
</template>

<style scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e4e7;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  z-index: 1000;
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.navbar-logo {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.navbar-title {
  font-size: 18px;
  font-weight: 600;
  color: #08060d;
  letter-spacing: 0.2px;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.navbar-btn {
  height: 34px;
  padding: 0 16px;
  font-size: 14px;
  color: #303133;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.navbar-btn:hover {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}

.navbar-btn-primary {
  color: #ffffff;
  background: #409eff;
  border-color: #409eff;
}

.navbar-btn-primary:hover {
  color: #ffffff;
  background: #66b1ff;
  border-color: #66b1ff;
}

.project-dialog-body {
  min-height: 120px;
}
</style>
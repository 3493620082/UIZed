<script setup>
import { computed, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { projectState } from '../store/project'

// 后端服务地址（与 store 中保持一致）
const API_BASE = 'http://127.0.0.1:8765'

const projectLabel = computed(() => (projectState.opened ? projectState.name : ''))

// 目录树数据
const tree = ref(null)
const loading = ref(false)
// 展开的目录路径集合（文件夹默认收起）
const expanded = ref(new Set())

// 加载项目目录树
async function loadTree() {
  if (!projectState.opened || !projectState.name) return
  loading.value = true
  try {
    const { data } = await axios.get(
      `${API_BASE}/api/project/${projectState.name}/tree`,
    )
    if (data.success) {
      tree.value = data.tree
      expanded.value = new Set()
    } else {
      ElMessage.error(data.error || '获取目录树失败')
    }
  } catch (error) {
    console.error('获取目录树失败', error)
    ElMessage.error('获取目录树失败')
  } finally {
    loading.value = false
  }
}

// 项目切换时重新加载
watch(
  () => projectState.name,
  () => loadTree(),
  { immediate: true },
)

// 把树扁平化为可渲染列表（只包含已展开路径下的节点）
const flatNodes = computed(() => {
  const list = []
  const walk = (node, level) => {
    list.push({ ...node, level })
    if (node.type === 'dir' && expanded.value.has(node.path)) {
      for (const child of node.children || []) walk(child, level + 1)
    }
  }
  if (tree.value) walk(tree.value, 0)
  return list
})

// 切换文件夹展开/收缩
function toggle(node) {
  const next = new Set(expanded.value)
  if (next.has(node.path)) {
    next.delete(node.path)
  } else {
    next.add(node.path)
  }
  expanded.value = next
}

// 打开项目所在文件夹
const opening = ref(false)
const handleOpenFolder = async () => {
  if (!projectState.opened || !projectState.name) return
  opening.value = true
  try {
    const { data } = await axios.post(
      `${API_BASE}/api/project/${projectState.name}/open`,
    )
    if (!data.success) ElMessage.error('打开文件夹失败')
  } catch (error) {
    console.error('打开文件夹失败', error)
    ElMessage.error('打开文件夹失败')
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <div class="file-page">
    <div class="file-toolbar">
      <span>项目：{{ projectLabel }}</span>
      <el-button
        type="primary"
        size="small"
        plain
        :loading="opening"
        @click="handleOpenFolder"
      >
        打开文件夹
      </el-button>
    </div>
    <div v-loading="loading" class="file-tree">
      <div
        v-for="node in flatNodes"
        :key="node.path"
        class="file-node"
        :class="{ 'is-dir': node.type === 'dir' }"
        :style="{ paddingLeft: node.level * 18 + 8 + 'px' }"
        @click="node.type === 'dir' && toggle(node)"
      >
        <span
          class="file-caret"
          :class="{ expanded: node.type === 'dir' && expanded.has(node.path) }"
        >
          {{ node.type === 'dir' ? '▸' : '' }}
        </span>
        <span class="file-node-name">{{ node.name }}</span>
      </div>
      <div v-if="!loading && tree && flatNodes.length === 0" class="file-empty">
        暂无文件
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.file-toolbar {
  padding: 10px 16px;
  font-size: 13px;
  color: #606266;
  border-bottom: 1px solid #e4e7ed;
  background: #ffffff;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-tree {
  flex: 1;
  overflow: auto;
  padding: 8px 0;
}

.file-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 4px;
  padding-bottom: 4px;
  cursor: default;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
}

.file-node.is-dir {
  cursor: pointer;
}

.file-node.is-dir:hover {
  background: #f5f7fa;
}

.file-caret {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-size: 12px;
  color: #909399;
  transition: transform 0.15s;
}

.file-caret.expanded {
  transform: rotate(90deg);
}

.file-node-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}
</style>

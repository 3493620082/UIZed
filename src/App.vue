<script setup>
import { computed } from 'vue'
import NavBar from './components/NavBar.vue'
import ProjectEditor from './components/ProjectEditor.vue'
import { projectState } from './store/project'

const opened = computed(() => projectState.opened)
</script>

<template>
  <div class="app-shell">
    <NavBar />

    <main class="app-content">
      <!-- 打开项目后显示编辑器 -->
      <ProjectEditor v-if="opened" />

      <!-- 未打开项目时的空状态 -->
      <div v-else class="no-project" data-state="empty">
        <p class="no-project-text">请打开项目</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-content {
  padding-top: 56px; /* 为固定顶部导航栏留出空间 */
}

.no-project {
  height: calc(100vh - 56px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-project-text {
  font-size: 20px;
  color: #909399;
  letter-spacing: 2px;
}
</style>
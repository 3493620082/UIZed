<script setup>
import { ref } from 'vue'
import UiDesign from './UiDesign.vue'
import LuaCode from './LuaCode.vue'
import FileView from './FileView.vue'
import ModStructure from './ModStructure.vue'

// 内层导航项，默认显示 UI设计
const tabs = [
  { name: 'design', label: 'UI设计' },
  { name: 'lua', label: 'Lua代码' },
  { name: 'files', label: '项目文件' },
  { name: 'structure', label: '模组结构' },
]
const activeTab = ref('design')
</script>

<template>
  <div class="project-editor">
    <!-- 内层导航栏 -->
    <nav class="editor-nav">
      <button
        v-for="t in tabs"
        :key="t.name"
        type="button"
        class="editor-tab"
        :class="{ active: activeTab === t.name }"
        @click="activeTab = t.name"
      >
        {{ t.label }}
      </button>
    </nav>

    <!-- 各页面内容 -->
    <div class="editor-body">
      <UiDesign v-if="activeTab === 'design'" />
      <LuaCode v-else-if="activeTab === 'lua'" />
      <FileView v-else-if="activeTab === 'files'" />
      <ModStructure v-else-if="activeTab === 'structure'" />
    </div>
  </div>
</template>

<style scoped>
.project-editor {
  height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
}

.editor-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 48px;
  padding: 0 12px;
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.editor-tab {
  height: 34px;
  padding: 0 18px;
  font-size: 14px;
  color: #606266;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.editor-tab:hover {
  color: #409eff;
  background: #ecf5ff;
}

.editor-tab.active {
  color: #409eff;
  background: #ecf5ff;
  font-weight: 500;
}

.editor-body {
  flex: 1;
  overflow: auto;
}
</style>
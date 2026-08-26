<script setup>
import { ref } from 'vue'

// 左侧列表项
const sections = [
  { key: 'mod', label: 'b42模组结构' },
  { key: 'workshop', label: '创意工坊结构' },
]
const active = ref('mod')

// b42 模组结构：使用扁平数组表树（depth 表示层级，dir 表示文件夹）
const modTree = [
  { label: '你的mod文件夹', depth: 0, dir: true },
  { label: '42', depth: 1, dir: true },
  { label: 'mod.info', depth: 2 },
  { label: '跟mod.info有关的文件', depth: 2 },
  { label: '42.19', depth: 1, dir: true },
  { label: 'mod.info', depth: 2 },
  { label: '跟mod.info有关的文件', depth: 2 },
  { label: 'common', depth: 1, dir: true },
  { label: 'media', depth: 2, dir: true },
  { label: 'lua', depth: 3 },
  { label: 'scripts', depth: 3 },
  { label: 'textures', depth: 3 },
  { label: '其他文件夹', depth: 3 },
  { label: 'mod.info', depth: 2 },
  { label: '跟mod.info有关的文件', depth: 2 },
]

// 创意工坊结构
const workshopTree = [
  { label: '用mod名字起名的文件夹', depth: 0, dir: true },
  { label: 'Contents', depth: 1, dir: true },
  { label: 'mods', depth: 2, dir: true },
  { label: '{你的mod文件夹}', depth: 3, dir: true },
  { label: 'workshop.txt(创意工坊信息文件)', depth: 1 },
  { label: 'preview.png(创意工坊预览图)', depth: 1 },
]

// 各区块的提示文本
const hints = {
  mod: '本地mod开发时，把你的mod文件夹放到"C:\\Users\\当前用户\\Zomboid\\mods"目录下',
  workshop: '创意工坊文件夹在"C:\\Users\\当前用户\\Zomboid\\workshop"，把你的mod文件夹按照如下格式组织',
}
</script>

<template>
  <div class="structure-page">
    <aside class="structure-sidebar">
      <div
        v-for="s in sections"
        :key="s.key"
        class="structure-item"
        :class="{ active: active === s.key }"
        @click="active = s.key"
      >
        {{ s.label }}
      </div>
    </aside>

    <div class="structure-content">
      <el-scrollbar class="structure-scroll">
        <div class="structure-inner">
          <div class="structure-hint">{{ hints[active] }}</div>

          <!-- b42 模组结构：目录树 -->
      <template v-if="active === 'mod'">
        <div class="structure-title">b42文件夹结构：</div>
        <div class="structure-tree">
          <div
            v-for="(item, i) in modTree"
            :key="i"
            class="tree-item"
            :style="{ paddingLeft: item.depth * 22 + 12 + 'px' }"
          >
            <span class="tree-icon" :class="{ dir: item.dir }">
              {{ item.dir ? '▸' : '・' }}
            </span>
            <span class="tree-label">{{ item.label }}</span>
          </div>
        </div>
      </template>

      <!-- 创意工坊结构：目录树 -->
      <template v-else>
        <div class="structure-title">创意工坊结构：</div>
        <div class="structure-tree">
          <div
            v-for="(item, i) in workshopTree"
            :key="i"
            class="tree-item"
            :style="{ paddingLeft: item.depth * 22 + 12 + 'px' }"
          >
            <span class="tree-icon" :class="{ dir: item.dir }">
              {{ item.dir ? '▸' : '・' }}
            </span>
            <span class="tree-label">{{ item.label }}</span>
          </div>
        </div>
      </template>

      <!-- 底部联系作者提示 -->
      <div class="structure-contact">
        <div>哪里不懂可以联系作者留言询问</div>
        <div>QQ:3493620082</div>
        <div>
          B站：<a href="https://space.bilibili.com/177309436" target="_blank">点击跳转</a>
        </div>
      </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<style scoped>
.structure-page {
  height: 100%;
  display: flex;
}

.structure-sidebar {
  width: 200px;
  flex-shrink: 0;
  padding: 12px 0;
  background: #ffffff;
  border-right: 1px solid #e4e7ed;
  overflow: auto;
}

.structure-item {
  padding: 10px 16px;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}

.structure-item:hover {
  color: #409eff;
  background: #ecf5ff;
}

.structure-item.active {
  color: #409eff;
  background: #ecf5ff;
  font-weight: 500;
  border-left: 3px solid #409eff;
}

.structure-content {
  flex: 1;
  min-width: 0;
  background: #f5f7fa;
}

.structure-scroll {
  height: 100%;
}

.structure-inner {
  padding: 16px 20px;
}

/* 提示文本 */
.structure-hint {
  font-size: 13px;
  color: #e6a23c;
  background: #fdf6ec;
  border: 1px solid #faecd8;
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 16px;
  line-height: 1.6;
}

.structure-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.structure-tree {
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px 0;
  font-family: 'Consolas', 'Courier New', monospace;
}

.tree-item {
  display: flex;
  align-items: center;
  padding-top: 4px;
  padding-bottom: 4px;
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
}

.tree-item:hover {
  background: #f5f7fa;
}

.tree-icon {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  font-size: 12px;
  color: #909399;
}

.tree-icon.dir {
  color: #e6a23c;
}

.structure-contact {
  margin-top: 16px;
  padding: 12px 14px;
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
}

.structure-contact a {
  color: #409eff;
  text-decoration: none;
}

.structure-contact a:hover {
  text-decoration: underline;
}
</style>
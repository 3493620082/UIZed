<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { projectState, saveRawLua } from '../store/project'

const API_BASE = 'http://127.0.0.1:8765'

// 显示当前项目的主 Lua 代码
const mainLua = computed(() => projectState.mainLua)

// 编辑模式状态
const editMode = ref(false)
const editingCode = ref('')

// 点击「编辑代码」：弹窗提示后进入编辑模式
function onStartEdit() {
  ElMessageBox.confirm(
    '因为该工具不是专业IDE，所以建议用户编辑代码使用VSCode或其他工具',
    '提示',
    {
      confirmButtonText: '继续编辑',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
    .then(() => {
      editingCode.value = mainLua.value
      editMode.value = true
    })
    .catch(() => {})
}

// 完成编辑：保存到磁盘并退出编辑模式
async function onSaveEdit() {
  const res = await saveRawLua(editingCode.value)
  if (res.success) {
    ElMessage.success('代码已保存')
    editMode.value = false
  } else {
    ElMessage.error('保存失败，请重试')
  }
}

// 取消编辑：放弃修改
function onCancelEdit() {
  editMode.value = false
}

// 复制代码到剪贴板
const copyCode = async () => {
  const text = mainLua.value
  try {
    // 安全上下文中优先使用剪贴板 API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      legacyCopy(text)
    }
    ElMessage.success('代码已复制到剪贴板')
  } catch (error) {
    // API 失败时再用兼容方案兜底
    console.error('复制失败', error)
    try {
      legacyCopy(text)
      ElMessage.success('代码已复制到剪贴板')
    } catch (e) {
      console.error('legacy 复制失败', e)
      ElMessage.error('复制失败，请重试')
    }
  }
}

// 兼容方案：隐藏 textarea + execCommand('copy')
function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (!ok) throw new Error('execCommand copy 失败')
}

// 行号列表
const lineNumbers = computed(() => {
  const count = mainLua.value ? mainLua.value.split('\n').length : 0
  return Array.from({ length: count }, (_, i) => i + 1)
})

// 解析当前 Lua 中所有 local function 定义的函数，附带签名所在行号
const funcList = computed(() => {
  const lines = mainLua.value.split('\n')
  const list = []
  const rx = /^\s*(?:local\s+)?function\s+(\w+)\s*\(([^)]*)\)/
  lines.forEach((line, idx) => {
    const code = line.replace(/\s*--.*$/, '')
    const m = code.match(rx)
    if (m) {
      list.push({
        name: m[1],
        signature: line.trim().replace(/\s*--.*$/, ''),
        line: idx + 1,
      })
    }
  })
  return list
})

// 左侧手风琴：默认展开「自定义函数」，收起「Lua全局函数」
const activeCollapse = ref(['custom'])

// 函数详情对话框状态
const funcDetailVisible = ref(false)
const funcDetailTitle = ref('')
const funcDetailCode = ref('')

// 提取函数的完整代码：从签名行开始，按块深度匹配到对应的 end
function extractFunctionCode(name) {
  const lines = mainLua.value.split('\n')
  const fn = funcList.value.find((f) => f.name === name)
  if (!fn) return ''
  const startRx = /\bfunction\b|\bif\b|\bfor\b|\bwhile\b|\bdo\b|\brepeat\b/g
  const endRx = /\bend\b|\buntil\b/g
  let depth = 0
  let endIdx = fn.line - 1
  for (let i = fn.line - 1; i < lines.length; i++) {
    const line = lines[i].replace(/\s*--.*$/, '')
    let m
    const starts = []
    while ((m = startRx.exec(line))) {
      // for/while/if 行内伴随的 do 不单独成块
      if (m[0] === 'do' && /\b(?:for|while|if)\b/.test(line)) continue
      starts.push(m[0])
    }
    const ends = []
    while ((m = endRx.exec(line))) ends.push(m[0])
    depth += starts.length - ends.length
    endIdx = i
    if (depth <= 0) break
  }
  return lines.slice(fn.line - 1, endIdx + 1).join('\n')
}

// 点击函数项：打开模态框显示该函数完整代码
function openFuncDetail(fn) {
  funcDetailTitle.value = fn.signature
  funcDetailCode.value = extractFunctionCode(fn.name)
  funcDetailVisible.value = true
}

// Lua 全局函数列表（来自后端 src/全局函数.json）
const globalFuncList = ref([])
const globalFuncLoading = ref(false)
async function loadGlobalFunctions() {
  globalFuncLoading.value = true
  try {
    const { data } = await axios.get(`${API_BASE}/api/global-functions`)
    if (data.success) {
      globalFuncList.value = data.data || []
    } else {
      ElMessage.error(data.message || '获取全局函数失败')
    }
  } catch (error) {
    console.error('获取全局函数失败', error)
    ElMessage.error('获取全局函数失败，请确认后端已启动')
  } finally {
    globalFuncLoading.value = false
  }
}

// Lua 全局事件列表（来自后端 src/全局事件.json）
const globalEventList = ref([])
const globalEventLoading = ref(false)
async function loadGlobalEvents() {
  globalEventLoading.value = true
  try {
    const { data } = await axios.get(`${API_BASE}/api/global-events`)
    if (data.success) {
      globalEventList.value = data.data || []
    } else {
      ElMessage.error(data.message || '获取全局事件失败')
    }
  } catch (error) {
    console.error('获取全局事件失败', error)
    ElMessage.error('获取全局事件失败，请确认后端已启动')
  } finally {
    globalEventLoading.value = false
  }
}

// 全局函数/事件详情对话框状态
const infoDetailVisible = ref(false)
const infoDetailTitle = ref('')
const infoDetailDescription = ref('')
function openInfoDetail(item) {
  infoDetailTitle.value = item.signature || item.name || ''
  infoDetailDescription.value = item.description || ''
  infoDetailVisible.value = true
}

onMounted(() => {
  loadGlobalFunctions()
  loadGlobalEvents()
})
</script>

<template>
  <div class="lua-page">
    <div class="lua-toolbar">
      <div class="toolbar-left">函数和事件</div>
      <div class="toolbar-right">
        <span>当前文件：{{ projectState.name }}.lua</span>
        <div class="toolbar-btns">
          <el-button v-if="!editMode" size="small" @click="onStartEdit">
            编辑代码
          </el-button>
          <template v-else>
            <el-button type="success" size="small" @click="onSaveEdit">
              完成
            </el-button>
            <el-button size="small" @click="onCancelEdit">
              取消
            </el-button>
          </template>
          <el-button type="primary" size="small" class="copy-btn" @click="copyCode">
            复制代码
          </el-button>
        </div>
      </div>
    </div>
    <div class="lua-body">
      <!-- 左侧：函数列表（手风琴） -->
      <div class="func-panel">
        <el-scrollbar class="func-scrollbar">
          <el-collapse v-model="activeCollapse" class="func-collapse">
            <el-collapse-item name="custom" title="自定义函数">
              <div class="func-list">
                <div
                  v-for="fn in funcList"
                  :key="fn.line"
                  class="func-item"
                  title="点击查看函数完整代码"
                  @click="openFuncDetail(fn)"
                >
                  <span class="func-signature" :title="fn.signature">{{ fn.signature }}</span>
                  <el-tag size="small" type="info" class="func-line-tag">第 {{ fn.line }} 行</el-tag>
                </div>
                <div v-if="funcList.length === 0" class="func-empty">暂无自定义函数</div>
              </div>
            </el-collapse-item>
            <el-collapse-item name="global" title="Lua全局函数">
              <div v-if="globalFuncLoading" class="func-empty">加载中...</div>
              <template v-else>
                <div
                  v-for="(fn, i) in globalFuncList"
                  :key="'gf' + i"
                  class="gfunc-item"
                  title="点击查看详情"
                  @click="openInfoDetail(fn)"
                >
                  <div class="gfunc-signature">{{ fn.signature }}</div>
                </div>
                <div v-if="globalFuncList.length === 0" class="func-empty">暂无全局函数</div>
              </template>
            </el-collapse-item>
            <el-collapse-item name="event" title="全局事件">
              <div v-if="globalEventLoading" class="func-empty">加载中...</div>
              <template v-else>
                <div
                  v-for="(ev, i) in globalEventList"
                  :key="'ev' + i"
                  class="gfunc-item"
                  title="点击查看详情"
                  @click="openInfoDetail(ev)"
                >
                  <div class="gfunc-signature">{{ ev.signature || ev.name }}</div>
                </div>
                <div v-if="globalEventList.length === 0" class="func-empty">暂无全局事件</div>
              </template>
            </el-collapse-item>
          </el-collapse>
        </el-scrollbar>
      </div>
      <!-- 中间：Lua 代码显示区（带行号） -->
      <el-scrollbar class="code-area">
        <template v-if="!editMode">
          <div v-if="lineNumbers.length" class="line-numbers">
            <div v-for="n in lineNumbers" :key="n" class="line-num">{{ n }}</div>
          </div>
          <pre class="lua-view">{{ mainLua }}</pre>
        </template>
        <textarea
          v-else
          v-model="editingCode"
          class="lua-edit"
          spellcheck="false"
        ></textarea>
      </el-scrollbar>
    </div>

    <!-- 函数详情模态框 -->
    <el-dialog
      v-model="funcDetailVisible"
      :title="funcDetailTitle"
      width="640px"
      top="10vh"
    >
      <pre class="func-code-view">{{ funcDetailCode }}</pre>
    </el-dialog>

    <!-- 全局函数/事件详情模态框 -->
    <el-dialog
      v-model="infoDetailVisible"
      :title="infoDetailTitle"
      width="480px"
      top="20vh"
    >
      <div class="info-detail-desc">{{ infoDetailDescription }}</div>
    </el-dialog>
  </div>
</template>

<style scoped>
.lua-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.lua-toolbar {
  padding: 0;
  font-size: 13px;
  color: #606266;
  border-bottom: 1px solid #e4e7ed;
  background: #ffffff;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  min-height: 42px;
}

.toolbar-left {
  width: 280px;
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-weight: 600;
  color: #303133;
  border-right: 1px solid #e4e7ed;
  background: #ffffff;
}

.toolbar-right {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.toolbar-btns {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lua-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* 左侧函数列表 */
.func-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #e4e7ed;
  background: #f5f7fa;
  overflow: hidden;
}

.func-scrollbar {
  height: 100%;
}

.func-collapse {
  border: none;
}

.func-collapse :deep(.el-collapse-item__header) {
  height: 40px;
  line-height: 40px;
  padding-left: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
}

.func-collapse :deep(.el-collapse-item__wrap) {
  background: #f5f7fa;
  border-bottom: none;
}

.func-collapse :deep(.el-collapse-item__content) {
  padding: 8px;
}

.func-list {
  overflow: auto;
}

.func-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.func-item:hover {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff;
}

.func-signature {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.func-line-tag {
  flex-shrink: 0;
}

.func-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: #909399;
}

/* Lua 全局函数/事件列表项（可点击卡片） */
.gfunc-item {
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.gfunc-item:hover {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff;
}

.gfunc-signature {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 全局函数/事件详情描述 */
.info-detail-desc {
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
  word-break: break-all;
  white-space: pre-line;
}

/* 中间代码区：行号 + 代码 */
.code-area {
  flex: 1;
  min-width: 0;
  background: #282c34;
}

.code-area :deep(.el-scrollbar__wrap) {
  height: 100%;
}

.code-area :deep(.el-scrollbar__view) {
  display: flex;
  min-height: 100%;
}

.line-numbers {
  position: sticky;
  left: 0;
  flex-shrink: 0;
  padding: 16px 8px 16px 16px;
  text-align: right;
  user-select: none;
  background: #21252b;
}

.line-num {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #636d83;
}

.lua-view {
  flex: 1;
  margin: 0;
  padding: 16px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #c9d1d9;
  background: #282c34;
  white-space: pre;
  word-break: normal;
}

/* 编辑模式：可编辑文本域 */
.lua-edit {
  flex: 1;
  min-width: 0;
  padding: 16px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #c9d1d9;
  background: #282c34;
  white-space: pre;
  word-break: normal;
}

/* 函数详情模态框代码区 */
.func-code-view {
  margin: 0;
  padding: 12px;
  max-height: 60vh;
  overflow: auto;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #c9d1d9;
  background: #282c34;
  white-space: pre;
  word-break: normal;
}
</style>

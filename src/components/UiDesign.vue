<script setup>
import { computed, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { WarningFilled, InfoFilled } from '@element-plus/icons-vue'
import {
  projectState,
  addElement,
  addLineBreak,
  removeElement,
  addFunction,
  saveProject,
  refreshFromDisk,
} from '../store/project'

// 后端服务地址（与 store 中保持一致）
const API_BASE = 'http://127.0.0.1:8765'

// 组件列表（对应 docs 中 ISUI 支持的元素，窗口为项目唯一，不在列表中）
// tip / tipColor：组件右侧的感叹号提示（red=红色警告, blue=蓝色说明）
const components = [
  { type: 'text', label: '文本' },
  { type: 'richtext', label: '富文本' },
  { type: 'button', label: '按钮' },
  { type: 'imagebutton', label: '图片按钮' },
  { type: 'progressbar', label: '进度条' },
  {
    type: 'tickbox',
    label: '复选框',
    tip: '复选框在游戏内显示有问题，可能是42版本bug',
    tipColor: 'red',
  },
  { type: 'entry', label: '输入框' },
  { type: 'combobox', label: '下拉框' },
  { type: 'scrolllist', label: '滚动列表' },
  { type: 'image', label: '图片' },
  {
    type: 'empty',
    label: '占位',
    tip: '占位组件的作用是占据空间，可以在组件之间创建间隔，提示美观性',
    tipColor: 'blue',
  },
]

// 每种元素类型的属性编辑表单定义
const propSchemas = {
  window: [
    { key: 'title', label: '标题' },
    { key: 'widthMode', label: '宽度单位', type: 'select', options: ['percent', 'pixel'] },
    { key: 'widthValue', label: '窗口宽度', type: 'number' },
  ],
  text: [
    { key: 'name', label: '变量名' },
    { key: 'text', label: '文本' },
    { key: 'font', label: '字体', type: 'select', group: 'props', options: ['Small', 'Medium', 'Large', 'Title'] },
    { key: 'position', label: '位置', type: 'select', group: 'props', options: ['Left', 'Right', 'Center'] },
  ],
  richtext: [
    { key: 'name', label: '变量名' },
    { key: 'text', label: '富文本内容', type: 'textarea', group: 'props' },
    { key: 'formatInfo', label: '', type: 'formatInfo' },
  ],
  button: [
    { key: 'name', label: '变量名' },
    { key: 'text', label: '按钮文本', group: 'props' },
    { key: 'onClick', label: '绑定点击事件', type: 'eventSelect', group: 'props' },
  ],
  imagebutton: [
    { key: 'name', label: '变量名' },
    { key: 'path', label: '图片路径', type: 'imagePicker', group: 'props', hint: '图片名不能包含中文字符' },
    { key: 'onClick', label: '绑定点击事件', type: 'eventSelect', group: 'props' },
  ],
  progressbar: [
    { key: 'name', label: '变量名' },
    { key: 'value', label: '当前值', type: 'number', group: 'props' },
    { key: 'min', label: '最小值', type: 'number', group: 'props' },
    { key: 'max', label: '最大值', type: 'number', group: 'props' },
    { key: 'color', label: '颜色', type: 'color', group: 'props' },
    { key: 'opacity', label: '透明度', type: 'opacity', group: 'props' },
  ],
  tickbox: [
    { key: 'name', label: '变量名' },
    { key: 'position', label: '位置', type: 'select', group: 'props', options: ['Left', 'Right', 'Centre'] },
  ],
  entry: [
    { key: 'name', label: '变量名' },
    { key: 'value', label: '默认值', group: 'props' },
    { key: 'isNumber', label: '是否为数字', type: 'switch', group: 'props' },
  ],
  combobox: [
    { key: 'name', label: '变量名' },
    { key: 'items', label: '选项(逗号分隔)', group: 'props' },
  ],
  scrolllist: [
    { key: 'name', label: '变量名' },
    { key: 'items', label: '选项(逗号分隔)', group: 'props' },
    { key: 'onItemClick', label: '绑定列表项点击事件', type: 'eventSelect', group: 'props' },
  ],
  image: [
    { key: 'name', label: '变量名' },
    { key: 'path', label: '图片路径', type: 'imagePicker', group: 'props', hint: '图片名不能包含中文字符' },
  ],
  empty: [
    { key: 'name', label: '变量名' },
    { key: 'width', label: '宽度', type: 'number', group: 'props' },
  ],
}

// 各元素通用方法（来源：Elements list.md + Vanilla functions.md 的 ISUIElement 公共能力）
const COMMON_METHODS = [
  { name: 'setBorder(bool)', desc: '添加/移除元素边框' },
  { name: 'setVisible(bool)', desc: '显示/隐藏元素' },
  { name: 'setWidthPercent(pctW)', desc: '设置元素宽度（百分比，需在 saveLayout 前调用）' },
  { name: 'setWidthPixel(pxlW)', desc: '设置元素宽度（像素，需在 saveLayout 前调用）' },
  { name: 'getX()', desc: '获取元素 X 坐标' },
  { name: 'getY()', desc: '获取元素 Y 坐标' },
  { name: 'getWidth()', desc: '获取元素宽度' },
  { name: 'getHeight()', desc: '获取元素高度' },
  { name: 'getRight()', desc: '获取元素右边界坐标（X + 宽度）' },
  { name: 'getBottom()', desc: '获取元素下边界坐标（Y + 高度）' },
  { name: 'bringToTop()', desc: '将元素置顶' },
]

// 每种类型可用的方法文档（来源：UI functions.md / Elements list.md / Vanilla functions.md / ISUI 源码）
const METHOD_DOCS = {
  window: [
    { name: 'open()', desc: '显示窗口' },
    { name: 'close()', desc: '隐藏窗口' },
    { name: 'toggle()', desc: '切换窗口显示状态' },
    { name: 'setTitle(str)', desc: '设置窗口标题' },
    { name: 'setWidthPercent(pctW)', desc: '设置窗口宽度（屏幕百分比 0-1）' },
    { name: 'setWidthPixel(pxlW)', desc: '设置窗口宽度（像素）' },
    { name: 'setPositionPercent(x, y)', desc: '设置窗口位置（屏幕百分比 0-1）' },
    { name: 'setPositionPixel(x, y)', desc: '设置窗口位置（像素）' },
    { name: 'setXPercent(x) / setXPixel(x)', desc: '设置窗口 X 坐标' },
    { name: 'setYPercent(y) / setYPixel(y)', desc: '设置窗口 Y 坐标' },
    { name: 'setInCenterOfScreen()', desc: '将窗口居中显示' },
    { name: 'setColumnWidthPercent(col, pctW)', desc: '设置列默认宽度（百分比）' },
    { name: 'setColumnWidthPixel(col, pxlW)', desc: '设置列默认宽度（像素）' },
    { name: 'setDefaultLineHeightPercent(h)', desc: '设置后续元素的默认行高（百分比）' },
    { name: 'setDefaultLineHeightPixel(h)', desc: '设置后续元素的默认行高（像素）' },
    { name: 'setLineHeightPercent(pctH)', desc: '设置当前行行高（百分比）' },
    { name: 'setLineHeightPixel(pxlH)', desc: '设置当前行行高（像素）' },
    { name: 'setBorderToAllElements(bool)', desc: '为窗口内所有元素添加/移除边框' },
    { name: 'setKey(key)', desc: '设置开关窗口的快捷键' },
    { name: 'setCollapse(bool)', desc: '点击窗口外部时是否收起（默认 false）' },
    { name: 'setVisible(bool)', desc: '设置窗口可见性' },
    { name: 'isSubUIOf(UI2)', desc: '设为另一窗口的子窗口（父关闭时随之关闭）' },
    { name: 'nextLine()', desc: '跳转到下一行' },
    { name: 'getIsVisible()', desc: '获取窗口是否可见' },
    { name: 'getDefaultLineHeightPercent()', desc: '获取默认行高（百分比）' },
    { name: 'getDefaultLineHeightPixel()', desc: '获取默认行高（像素）' },
    { name: 'bringToTop()', desc: '将窗口置顶' },
    { name: 'setDrawFrame(false)', desc: '移除窗口标题栏' },
  ],
  text: [
    { name: 'setText(str)', desc: '更改文本内容' },
    { name: 'setColor(a, r, g, b)', desc: '更改文本颜色（透明度 + RGB）' },
    { name: 'setPosition("Right")', desc: '更改文本在框内的位置' },
  ],
  richtext: [
    { name: 'setText("", str)', desc: '更改富文本内容' },
    { name: 'setColor(a, r, g, b)', desc: '更改富文本背景颜色' },
  ],
  progressbar: [
    { name: 'setValue(v)', desc: '设置进度条当前值' },
    { name: 'setMinMax(min, max)', desc: '设置最小/最大值' },
    { name: 'setMarginPercent(pctW, pctH)', desc: '设置进度条边距（百分比）' },
    { name: 'setMarginPixel(pxlW, pxlH)', desc: '设置进度条边距（像素）' },
    { name: 'setColor(a, r, g, b)', desc: '设置进度条颜色（默认白色）' },
  ],
  button: [
    { name: 'setText(str)', desc: '更改按钮文本' },
    { name: 'setOnClick(func)', desc: '设置点击回调函数（创建时已通过 addButton 第三个参数传入）' },
    { name: 'addArg(name, value)', desc: '添加回调参数，回调内通过 args.name 获取' },
  ],
  imagebutton: [
    { name: 'setPath(path)', desc: '更改按钮图片路径' },
    { name: 'setOnClick(func)', desc: '设置点击回调函数（创建时已通过 addImageButton 第三个参数传入）' },
    { name: 'addArg(name, value)', desc: '添加回调参数，回调内通过 args.name 获取' },
    { name: 'setColor(a, r, g, b)', desc: '设置图片按钮颜色' },
  ],
  tickbox: [
    { name: 'getValue()', desc: '获取勾选状态值' },
  ],
  entry: [
    { name: 'getValue()', desc: '获取输入框的值' },
    { name: 'addArg(name, value)', desc: '添加回调参数' },
  ],
  combobox: [
    { name: 'getValue()', desc: '获取当前选中项的值' },
    { name: 'setItems({...})', desc: '重新设置下拉选项' },
  ],
  scrolllist: [
    { name: 'getValue()', desc: '获取选中项（text, item，未选返回 false）' },
    { name: 'setItems({...})', desc: '重新设置列表项' },
    { name: 'setOnMouseDownFunction(_, func)', desc: '设置列表项点击回调（回调参数: _, item）' },
  ],
  image: [
    { name: 'setPath(path)', desc: '更改图片路径' },
    { name: 'setColor(r, g, b)', desc: '设置图片颜色（RGB）' },
  ],
  empty: [
    { name: 'setColor(a, r, g, b)', desc: '更改背景颜色' },
  ],
}

// 当前选中对象可用的方法列表（窗口=窗口方法；元素=通用方法+元素特有方法）
const methodCollapse = ref(['methods'])
const currentMethods = computed(() => {
  const t = selectedType.value
  if (t === 'window') return METHOD_DOCS.window
  if (t === 'linebreak') return []
  return [...COMMON_METHODS, ...(METHOD_DOCS[t] || [])]
})

// 当前选中的对象：window 或某个元素
const selected = ref({ kind: 'window', id: null })

const selectedType = computed(() => {
  if (selected.value.kind === 'window') return 'window'
  const el = projectState.elements.find((e) => e.id === selected.value.id)
  return el ? el.type : 'window'
})

const selectedElement = computed(() =>
  projectState.elements.find((e) => e.id === selected.value.id),
)

const isLineBreakSelected = computed(() => selectedElement.value?.isLineBreak)

const selectedSchema = computed(() => {
  const t = selectedType.value
  if (t === 'linebreak') return []
  return propSchemas[t] || []
})

const typeLabel = (type) => components.find((c) => c.type === type)?.label || type

// ---------- 富文本格式介绍 ----------
// 内容来源：docs/PZ-UI_API-main/Variables.md
const formatDialogVisible = ref(false)
const richFormatList = [
  { tag: '<LEFT>, <RIGHT>, <CENTER>', desc: '文本位置' },
  { tag: '<SIZE:small>, <SIZE:medium>, <SIZE:large>', desc: '切换字体大小' },
  { tag: '<LINE>, <BR>', desc: '换行（BR 为两倍行距）' },
  { tag: '<H1>, <H2>, <TEXT>', desc: '标题样式（改变位置、大小和颜色）' },
  { tag: '<RGB:r,g,b>、<RED>、<ORANGE>、<GREEN>', desc: '改变颜色' },
  { tag: '<IMAGECENTER:media/ui/xxx.png>', desc: '在文本中插入图片（居中）' },
  { tag: '<IMAGE:media/ui/xxx.png,28,28>', desc: '在文本中插入图片（自定义位置与尺寸）' },
  { tag: '<SETX:x>', desc: '设置 X 坐标位置' },
  { tag: '<INDENT:x>', desc: '缩进（作用未知）' },
]

// 进度条百分比（对应 (value-min)/(max-min)*100，夹取到 0-100）
const progressPct = (el) => {
  const { value, min, max } = el.props
  if (max === min) return 0
  const p = ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100
  return Math.max(0, Math.min(100, p))
}

// 颜色值规整为 6 位十六进制（#rrggbb），非法值回退默认蓝，避免产生 NaN
const normalizeColor = (v) => {
  const h = String(v == null ? '' : v).replace('#', '').replace(/[^0-9a-fA-F]/g, '')
  if (h.length >= 6 && /^[0-9a-fA-F]{6}$/.test(h.slice(0, 6))) {
    return '#' + h.slice(0, 6).toLowerCase()
  }
  return '#409eff'
}

// 进度条预览颜色：hex 颜色 + 透明度 -> rgba()
const progressColor = (el) => {
  const hex = normalizeColor(el.props.color).replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const a = Number(el.props.opacity)
  const alpha = Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// 宽度单位的显示标签
const optionLabel = (field, value) => {
  if (field.key === 'widthMode') {
    return value === 'percent' ? '百分比' : '像素'
  }
  return value
}

// 文本控件在预览中的对齐方式（Left/Center/Right -> text-align）
const textAlign = (el) => {
  const pos = el.props.position
  if (pos === 'Center') return 'center'
  if (pos === 'Right') return 'right'
  return 'left'
}

// 下拉框选项（逗号分隔字符串 -> 数组）
const comboboxOptions = (el) =>
  String(el.props.items || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)

// 下拉框占位提示：默认显示第一个选项
const comboboxPlaceholder = (el) => comboboxOptions(el)[0] || '下拉框'

// ---------- 事件绑定 ----------
// 下拉框里固定的“添加函数”入口（选中时打开添加模态框，而非绑定）
const ADD_FN_MARK = '__ADD_FUNCTION__'

// 绑定点击事件下拉框的选项：项目自定义函数 + 添加函数入口
const eventSelectOptions = computed(() => {
  const names = projectState.functions.map((f) => f.name)
  return [...names, ADD_FN_MARK]
})

const eventOptionLabel = (v) => (v === ADD_FN_MARK ? '＋ 添加函数...' : v)

// 添加函数模态框：输入函数名与参数，创建后写入 Lua（位于 onCreateUI 之上）
const funcDialogVisible = ref(false)
const funcForm = ref({ name: '', params: '' })
// 记录打开模态框时对应的事件字段，创建成功后绑定到该字段
const activeEventField = ref(null)

// 选中事件下拉框项：添加函数入口打开模态框，否则写入绑定
const onEventSelect = (field, value) => {
  if (value === ADD_FN_MARK) {
    activeEventField.value = field
    funcDialogVisible.value = true
    return
  }
  setFieldValue(field, value)
}

const confirmAddFunction = () => {
  const r = addFunction(funcForm.value.name, funcForm.value.params)
  if (!r.success) {
    ElMessage.error(r.message)
    return
  }
  // 创建成功后自动绑定到当前选中的控件对应的事件字段
  const el = selectedElement.value
  const field = activeEventField.value
  if (el && field) el.props[field.key] = funcForm.value.name
  funcDialogVisible.value = false
  activeEventField.value = null
  funcForm.value = { name: '', params: '' }
  ElMessage.success('函数已添加并绑定')
}

// ---------- 图片路径选择器 ----------
const imageDialogVisible = ref(false)
const textureLoading = ref(false)
const textureList = ref([])
const fileInput = ref(null)

// 项目 textures 目录下某张图片的预览 URL
const textureUrl = (name) =>
  `${API_BASE}/api/project/${projectState.name}/textures/${name}`

// 从 Lua 路径(media/textures/xxx.png)解析出预览 URL
const previewImageUrl = (path) => {
  const m = String(path || '').match(/([^/\\]+\.png)$/i)
  return m ? textureUrl(m[1]) : ''
}

// 打开图片选择器：拉取项目 textures 目录下的图片列表
const openImagePicker = async () => {
  if (!projectState.opened || !projectState.name) return
  imageDialogVisible.value = true
  textureLoading.value = true
  try {
    const { data } = await axios.get(
      `${API_BASE}/api/project/${projectState.name}/textures`,
    )
    textureList.value = (data.files || []).map((f) => ({
      name: f,
      url: textureUrl(f),
    }))
  } catch (error) {
    console.error('获取图片列表失败', error)
    ElMessage.error('获取图片列表失败')
  } finally {
    textureLoading.value = false
  }
}

// 选择某张图片：路径写入 media/textures/{图片名}
const chooseTexture = (name) => {
  const el = selectedElement.value
  if (el) el.props.path = `media/textures/${name}`
  imageDialogVisible.value = false
}

// 触发隐藏的文件选择器（仅 png）
const triggerUpload = () => {
  fileInput.value?.click()
}

// 选择本地 PNG 并上传到项目 textures 目录
const onFileChange = async (e) => {
  const file = e.target.files && e.target.files[0]
  e.target.value = '' // 允许重复选择同一文件
  if (!file) return
  if (!/\.png$/i.test(file.name)) {
    ElMessage.error('仅支持 PNG 图片')
    return
  }
  const form = new FormData()
  form.append('file', file)
  try {
    await axios.post(
      `${API_BASE}/api/project/${projectState.name}/textures`,
      form,
    )
    ElMessage.success('图片已添加')
    await openImagePicker() // 刷新列表
    const el = selectedElement.value
    if (el) el.props.path = `media/textures/${file.name}`
  } catch (error) {
    console.error('上传图片失败', error)
    ElMessage.error('上传图片失败，仅支持 PNG')
  }
}

// 窗口预览宽度样式（按单位生成 css）
const windowWidthStyle = computed(() =>
  projectState.windowWidthMode === 'pixel'
    ? projectState.windowWidthPixel + 'px'
    : projectState.windowWidthPercent + '%',
)

// 将元素按“行”分组：默认所有控件同处一行，遇到换行（nextLine）才换行
const lines = computed(() => {
  const result = []
  let current = []
  for (const el of projectState.elements) {
    if (el.isLineBreak) {
      result.push({ items: current, lineBreakId: el.id })
      current = []
    } else {
      current.push(el)
    }
  }
  if (current.length) result.push({ items: current, lineBreakId: null })
  return result
})

// 读取某个字段的值（窗口字段映射到 projectState，元素字段映射到元素）
function fieldValue(field) {
  if (selected.value.kind === 'window') {
    if (field.key === 'title') return projectState.windowTitle
    if (field.key === 'widthMode') return projectState.windowWidthMode
    if (field.key === 'widthValue') {
      return projectState.windowWidthMode === 'pixel'
        ? projectState.windowWidthPixel
        : projectState.windowWidthPercent
    }
    return ''
  }
  const el = selectedElement.value
  if (!el) return ''
  if (field.key === 'name') return el.name
  if (field.key === 'width') return el.props.width
  return el.props[field.key]
}

function setFieldValue(field, value) {
  if (selected.value.kind === 'window') {
    if (field.key === 'title') {
      projectState.windowTitle = value
    } else if (field.key === 'widthMode') {
      projectState.windowWidthMode = value
    } else if (field.key === 'widthValue') {
      if (projectState.windowWidthMode === 'pixel') {
        projectState.windowWidthPixel = value
      } else {
        projectState.windowWidthPercent = value
      }
    }
    return
  }
  const el = selectedElement.value
  if (!el) return
  if (field.key === 'name') {
    el.name = value
  } else if (field.key === 'width') {
    el.props.width = value
  } else if (field.key === 'color') {
    // 颜色统一规整为 6 位十六进制
    el.props.color = normalizeColor(value)
  } else {
    el.props[field.key] = value
  }
}

// 点击组件列表的加号，添加元素并选中它
const handleAdd = (type) => {
  const el = addElement(type)
  selected.value = { kind: 'element', id: el.id }
}

// 点击“换行”，添加换行并选中
const handleAddLineBreak = () => {
  const el = addLineBreak()
  selected.value = { kind: 'element', id: el.id }
}

// 预览中点击元素，选中它
const selectElement = (el) => {
  selected.value = { kind: 'element', id: el.id }
}

// 右键删掉当前选中的元素
const handleDelete = () => {
  if (selected.value.kind === 'element') {
    removeElement(selected.value.id)
    selected.value = { kind: 'window', id: null }
  }
}

// 刷新：重新从磁盘读取主 Lua 并按 onCreateUI 渲染
const refreshing = ref(false)
const handleRefresh = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const ok = await refreshFromDisk()
    if (!ok) {
      ElMessage.error('解析失败')
    } else {
      ElMessage.success('刷新成功')
    }
  } catch (error) {
    console.error('刷新失败', error)
    ElMessage.error('刷新失败')
  } finally {
    refreshing.value = false
  }
}

// 每次设计操作（增删元素、改属性、改窗口标题/宽度等）后自动保存到磁盘
// 排除 mainLua，避免 saveProject 更新 mainLua 时再次触发造成循环
watch(
  () => ({
    windowTitle: projectState.windowTitle,
    windowWidthMode: projectState.windowWidthMode,
    windowWidthPercent: projectState.windowWidthPercent,
    windowWidthPixel: projectState.windowWidthPixel,
    elements: projectState.elements,
    functions: projectState.functions,
  }),
  () => saveProject(),
  { deep: true },
)
</script>

<template>
  <div class="ui-design">
    <!-- 左栏：组件列表 -->
    <aside class="panel panel-left">
      <div class="panel-title">组件列表</div>
      <ul class="component-list">
        <li v-for="c in components" :key="c.type" class="component-item">
          <button
            type="button"
            class="add-btn"
            title="添加到窗口"
            @click="handleAdd(c.type)"
          >
            +
          </button>
          <span class="component-label">{{ c.label }}</span>
          <el-tooltip
            v-if="c.tip"
            :content="c.tip"
            placement="right"
            :show-after="200"
          >
            <el-icon
              class="tip-icon"
              :class="c.tipColor === 'red' ? 'tip-red' : 'tip-blue'"
            >
              <WarningFilled v-if="c.tipColor === 'red'" />
              <InfoFilled v-else />
            </el-icon>
          </el-tooltip>
        </li>
        <li class="component-item linebreak-item">
          <button
            type="button"
            class="add-btn"
            title="添加换行"
            @click="handleAddLineBreak"
          >
            +
          </button>
          <span class="component-label">换行</span>
        </li>
      </ul>
    </aside>

    <!-- 中栏：UI 预览 -->
    <section class="panel panel-center">
      <div class="panel-title panel-title-row">
        <span>UI预览(仅作参考,以游戏内实际效果为准)</span>
        <el-button
          type="primary"
          size="small"
          plain
          :loading="refreshing"
          @click="handleRefresh"
        >
          刷新
        </el-button>
      </div>
      <el-scrollbar class="preview-scrollbar">
      <div class="preview-canvas">
        <div
          class="preview-window"
          :style="{ width: windowWidthStyle }"
        >
          <div
            class="preview-titlebar"
            :class="{ selected: selected.kind === 'window' }"
            @click="selected = { kind: 'window', id: null }"
          >
            <span class="preview-close">×</span>
            <span class="preview-title">{{ projectState.windowTitle }}</span>
            <span class="preview-close-spacer"></span>
          </div>
          <div class="preview-body">
            <!-- 按行渲染：同一行的元素横向排列，换行处以虚线分隔 -->
            <template v-for="(line, li) in lines" :key="li">
              <div class="design-row">
                <div
                  v-for="el in line.items"
                  :key="el.id"
                  class="design-element"
                  :class="{ selected: selected.id === el.id }"
                  @click="selectElement(el)"
                >
                  <span
                    v-if="el.type === 'text'"
                    class="elem-text"
                    :style="{ textAlign: textAlign(el) }"
                    >{{ el.props.text }}</span
                  >
                  <span
                    v-else-if="el.type === 'richtext'"
                    class="elem-richtext"
                    :title="el.props.text"
                    >{{ el.props.text }}</span
                  >
                  <button v-else-if="el.type === 'button'" type="button" class="elem-button">
                    {{ el.props.text }}
                  </button>
                  <el-progress
                    v-else-if="el.type === 'progressbar'"
                    class="elem-progress"
                    :percentage="progressPct(el)"
                    :color="progressColor(el)"
                    :show-text="false"
                    :stroke-width="10"
                  />
                  <span v-else-if="el.type === 'empty'" class="elem-empty"></span>
                  <template v-else-if="el.type === 'image'">
                    <img
                      v-if="previewImageUrl(el.props.path)"
                      class="elem-image"
                      :src="previewImageUrl(el.props.path)"
                      alt=""
                    />
                    <span v-else class="elem-image-placeholder">图片</span>
                  </template>
                  <div v-else-if="el.type === 'imagebutton'" class="elem-imagebutton">
                    <img
                      v-if="previewImageUrl(el.props.path)"
                      class="elem-imagebutton-img"
                      :src="previewImageUrl(el.props.path)"
                      alt=""
                    />
                    <span v-else class="elem-imagebutton-placeholder">图片按钮</span>
                  </div>
                  <el-select
                    v-else-if="el.type === 'combobox'"
                    class="elem-combobox"
                    :model-value="''"
                    :placeholder="comboboxPlaceholder(el)"
                    size="small"
                    @click.stop
                  >
                    <el-option
                      v-for="opt in comboboxOptions(el)"
                      :key="opt"
                      :label="opt"
                      :value="opt"
                    />
                  </el-select>
                  <el-input
                    v-else-if="el.type === 'entry'"
                    class="elem-entry"
                    :model-value="el.props.value"
                    :placeholder="el.props.isNumber ? '数字' : ''"
                    size="small"
                    readonly
                    @click.stop
                  />
                  <el-checkbox
                    v-else-if="el.type === 'tickbox'"
                    class="elem-tickbox"
                    :model-value="true"
                    @click.stop
                  />
                  <div
                    v-else-if="el.type === 'scrolllist'"
                    class="elem-scrolllist"
                    @click.stop
                  >
                    <div
                      v-for="(opt, oi) in comboboxOptions(el)"
                      :key="opt"
                      class="elem-scrolllist-item"
                      :class="{ active: oi === 0 }"
                    >
                      {{ opt }}
                    </div>
                  </div>
                  <span v-else>{{ typeLabel(el.type) }}</span>
                </div>
              </div>
              <!-- 换行：虚线分隔，可选中删除 -->
              <div
                v-if="line.lineBreakId != null"
                class="line-break"
                :class="{ selected: selected.id === line.lineBreakId }"
                @click="selectElement({ id: line.lineBreakId })"
              ></div>
            </template>
            <p v-if="!projectState.elements.length" class="preview-empty">
              从左侧添加组件到窗口中
            </p>
          </div>
        </div>
      </div>
      </el-scrollbar>
    </section>

    <!-- 右栏：属性与操作 -->
    <aside class="panel panel-right">
      <div class="panel-title">
        属性 — {{ selectedType === 'window' ? '窗口' : typeLabel(selectedType) }}
      </div>

      <el-scrollbar class="prop-scrollbar">
        <div class="prop-form">
          <div v-for="field in selectedSchema" :key="field.key" class="prop-item">
          <label class="prop-label">
            {{ field.label }}
            <span v-if="field.hint" class="prop-label-hint">{{ field.hint }}</span>
          </label>
          <el-input
            v-if="!field.type && field.key !== 'isNumber'"
            :model-value="fieldValue(field)"
            size="small"
            @update:model-value="(v) => setFieldValue(field, v)"
          />
          <el-input
            v-else-if="field.type === 'textarea'"
            :model-value="fieldValue(field)"
            type="textarea"
            :rows="4"
            @update:model-value="(v) => setFieldValue(field, v)"
          />
          <el-input-number
            v-else-if="field.type === 'number'"
            :model-value="fieldValue(field)"
            size="small"
            :controls="false"
            style="width: 100%"
            @update:model-value="(v) => setFieldValue(field, v)"
          />
          <el-select
            v-else-if="field.type === 'select'"
            :model-value="fieldValue(field)"
            size="small"
            style="width: 100%"
            @update:model-value="(v) => setFieldValue(field, v)"
          >
            <el-option
              v-for="opt in field.options"
              :key="opt"
              :label="optionLabel(field, opt)"
              :value="opt"
            />
          </el-select>
          <el-select
            v-else-if="field.type === 'eventSelect'"
            :model-value="fieldValue(field)"
            size="small"
            style="width: 100%"
            placeholder="未绑定"
            @update:model-value="(v) => onEventSelect(field, v)"
          >
            <el-option
              v-for="opt in eventSelectOptions"
              :key="opt"
              :label="eventOptionLabel(opt)"
              :value="opt"
            />
          </el-select>
          <el-switch
            v-else-if="field.type === 'switch'"
            :model-value="fieldValue(field)"
            size="small"
            @update:model-value="(v) => setFieldValue(field, v)"
          />
          <el-color-picker
            v-else-if="field.type === 'color'"
            :model-value="fieldValue(field)"
            size="small"
            @update:model-value="(v) => setFieldValue(field, v)"
          />
          <el-slider
            v-else-if="field.type === 'opacity'"
            :model-value="fieldValue(field)"
            :min="0"
            :max="1"
            :step="0.01"
            size="small"
            :format-tooltip="(v) => v.toFixed(2)"
            @update:model-value="(v) => setFieldValue(field, v)"
          />
          <div v-else-if="field.type === 'imagePicker'" class="image-picker">
            <el-input
              :model-value="fieldValue(field)"
              readonly
              size="small"
              placeholder="点击选择图片"
              @click="openImagePicker"
            >
              <template #append>
                <el-button size="small" @click="openImagePicker">选择</el-button>
              </template>
            </el-input>
          </div>
          <el-button
            v-else-if="field.type === 'formatInfo'"
            size="small"
            plain
            style="width: 100%"
            @click="formatDialogVisible = true"
          >
            格式介绍
          </el-button>
        </div>

        <div v-if="!selectedSchema.length" class="prop-hint">
          {{ isLineBreakSelected ? '换行没有可编辑的属性' : '当前没有可编辑的属性' }}
        </div>
        </div>
      </el-scrollbar>

      <!-- 方法手风琴 -->
      <div class="method-panel">
        <el-collapse v-model="methodCollapse" class="method-collapse">
          <el-collapse-item title="方法" name="methods">
            <el-scrollbar class="method-scrollbar">
              <div class="method-list">
                <div v-for="(m, i) in currentMethods" :key="i" class="method-item">
                  <div class="method-name">{{ m.name }}</div>
                  <div class="method-desc">{{ m.desc }}</div>
                </div>
                <div v-if="!currentMethods.length" class="prop-hint">暂无可用方法</div>
              </div>
            </el-scrollbar>
          </el-collapse-item>
        </el-collapse>
      </div>

      <!-- 底部操作 -->
      <div class="panel-actions">
        <el-button
          v-if="selected.kind === 'element'"
          type="danger"
          size="small"
          plain
          @click="handleDelete"
        >
          {{ isLineBreakSelected ? '删除换行' : '删除' }}
        </el-button>
      </div>
    </aside>

    <!-- 图片选择模态框 -->
    <el-dialog v-model="imageDialogVisible" title="选择图片" width="620px" append-to-body>
      <div v-loading="textureLoading" class="texture-grid">
        <div
          v-for="t in textureList"
          :key="t.name"
          class="texture-card"
          @click="chooseTexture(t.name)"
        >
          <div class="texture-thumb">
            <img :src="t.url" :alt="t.name" />
          </div>
          <span class="texture-name" :title="t.name">{{ t.name }}</span>
        </div>
        <div v-if="!textureLoading && !textureList.length" class="texture-empty">
          暂无图片，点击下方「添加图片」上传 PNG
        </div>
      </div>
      <template #footer>
        <el-button type="primary" plain @click="triggerUpload">添加图片</el-button>
        <el-button @click="imageDialogVisible = false">取消</el-button>
      </template>
      <!-- 仅允许 png 的本地文件选择器 -->
      <input
        ref="fileInput"
        type="file"
        accept=".png,image/png"
        style="display: none"
        @change="onFileChange"
      />
    </el-dialog>

    <!-- 富文本格式介绍模态框 -->
    <el-dialog v-model="formatDialogVisible" title="富文本格式介绍" width="600px" append-to-body>
      <div class="format-tip">因年代久远，部分格式可能已经失效，请注意甄别</div>
      <ul class="format-list">
        <li v-for="(f, fi) in richFormatList" :key="fi" class="format-item">
          <code class="format-tag">{{ f.tag }}</code>
          <span class="format-desc">{{ f.desc }}</span>
        </li>
      </ul>
    </el-dialog>

    <!-- 添加函数模态框 -->
    <el-dialog v-model="funcDialogVisible" title="添加函数" width="460px" append-to-body>
      <div class="format-tip">函数将写入 Lua 代码，并定义在 onCreateUI 之前，防止事件绑定时找不到函数</div>
      <div class="prop-item">
        <label class="prop-label">函数名</label>
        <el-input
          v-model="funcForm.name"
          size="small"
          placeholder="如 onAccept"
        />
      </div>
      <div class="prop-item">
        <label class="prop-label">参数</label>
        <el-input
          v-model="funcForm.params"
          size="small"
          placeholder="如 button, args（可留空）"
        />
      </div>
      <template #footer>
        <el-button size="small" @click="funcDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="confirmAddFunction">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ui-design {
  display: flex;
  height: 100%;
  gap: 10px;
}

.panel {
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-title {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  border-bottom: 1px solid #f0f2f5;
  background: #fafafa;
  flex-shrink: 0;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-left {
  width: 200px;
  flex-shrink: 0;
}

.component-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow: auto;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 6px;
}

.component-item:hover {
  background: #f5f7fa;
}

.add-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #409eff;
  background: #ecf5ff;
  border: 1px solid #c6e2ff;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #409eff;
  color: #ffffff;
}

.component-label {
  font-size: 13px;
  color: #303133;
}

/* 组件右侧的感叹号提示图标 */
.tip-icon {
  font-size: 14px;
  cursor: help;
  flex-shrink: 0;
}

.tip-red {
  color: #f56c6c;
}

.tip-blue {
  color: #409eff;
}

.linebreak-item {
  margin-top: 6px;
  border-top: 1px dashed #dcdfe6;
  padding-top: 8px;
}

.panel-center {
  flex: 1;
}

/* 预览区滚动条（element-plus） */
.preview-scrollbar {
  flex: 1;
  height: 100%;
}

.preview-scrollbar :deep(.el-scrollbar__wrap) {
  height: 100%;
}

.preview-scrollbar :deep(.el-scrollbar__view) {
  height: 100%;
}

.preview-canvas {
  min-height: 100%;
  display: flex;
  background:
    linear-gradient(#e4e7ed 1px, transparent 1px),
    linear-gradient(90deg, #e4e7ed 1px, transparent 1px),
    #f7f8fa;
  background-size: 20px 20px;
  padding: 20px;
  box-sizing: border-box;
}

.preview-window {
  max-width: 100%;
  min-width: 160px;
  flex-shrink: 0;
  margin: auto; /* 窗口小时居中；窗口大时溢出部分可完整滚动查看 */
  background: #ffffff;
  border: 1px solid #c0c4cc;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.preview-titlebar {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 0 0 8px;
  font-size: 12px;
  color: #ffffff;
  background: #606266;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  user-select: none;
}

.preview-titlebar.selected {
  outline: 2px solid #409eff;
  outline-offset: -2px;
}

.preview-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.preview-title {
  flex: 1;
  text-align: center;
}

.preview-close-spacer {
  width: 18px;
  flex-shrink: 0;
}

.preview-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.design-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}

.preview-empty {
  margin: 0;
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
}

.design-element {
  flex: 1 1 0;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 13px;
  color: #303133;
  cursor: pointer;
}

.design-element:hover {
  border-color: #c6e2ff;
}

.design-element.selected {
  border-color: #409eff;
  background: #ecf5ff;
}

.elem-text {
  display: block;
  min-height: 18px;
}

/* 富文本预览：单行显示字符串，溢出隐藏 */
.elem-richtext {
  display: block;
  min-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.elem-button {
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  width: 100%;
  color: #000000;
  background: transparent;
  border: 1px solid #000000;
  border-radius: 0;
  cursor: pointer;
}

.elem-progress {
  width: 100%;
  --el-progress-border-radius: 0; /* 直角无圆角 */
}

.elem-progress :deep(.el-progress-bar__outer) {
  border-radius: 0;
}

.elem-progress :deep(.el-progress-bar__inner) {
  border-radius: 0;
}

.elem-empty {
  display: block;
  height: 10px;
}

.elem-image {
  display: block;
  width: 100%; /* 宽度自适应窗口 */
  height: auto; /* 高度按原图比例缩放，不变形 */
}

.elem-image-placeholder {
  display: block;
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
}

/* 图片按钮：黑色直角边框，中间放置图片 */
.elem-imagebutton {
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: 1px solid #000;
  border-radius: 0;
  background: transparent;
}

.elem-imagebutton-img {
  max-width: 100%;
  max-height: 40px;
  object-fit: contain;
}

.elem-imagebutton-placeholder {
  font-size: 12px;
  color: #000;
}

.elem-combobox {
  width: 100%;
}

/* el-select 内部各处圆角统一为直角（border-radius: var(--el-border-radius-base) 导致圆角） */
.elem-combobox :deep(.el-select__wrapper),
.elem-combobox :deep(.el-input__wrapper) {
  border-radius: 0;
}

.elem-combobox :deep(.el-select-dropdown) {
  border-radius: 0;
}

/* 输入框：黑色边框 + 直角 + 透明背景 */
.elem-entry {
  width: 100%;
}

.elem-entry :deep(.el-input__wrapper) {
  border-radius: 0;
  background: transparent;
  box-shadow: 0 0 0 1px #000 inset;
}

.elem-entry :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #000 inset;
}

.elem-entry :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #000 inset;
}

.elem-entry :deep(.el-input__inner) {
  color: #000;
}

/* 复选框：直角 */
.elem-tickbox {
  width: 100%;
  display: flex;
  align-items: center;
}

.elem-tickbox :deep(.el-checkbox__inner) {
  border-radius: 0;
  border-color: #000;
  background: transparent;
}

.elem-tickbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background: #000;
  border-color: #000;
}

/* 滚动列表：直角边框的列表 */
.elem-scrolllist {
  width: 100%;
  max-height: 90px;
  overflow-y: auto;
  border: 1px solid #000;
  border-radius: 0;
  background: #fff;
}

.elem-scrolllist-item {
  padding: 3px 8px;
  font-size: 12px;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.elem-scrolllist-item.active {
  background: #409eff;
  color: #fff;
}

.image-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.line-break {
  height: 0;
  border-top: 1px dashed #909399;
  cursor: pointer;
}

.line-break.selected {
  border-top-color: #409eff;
  outline: 1px solid #409eff;
}

.panel-right {
  width: 280px;
  flex-shrink: 0;
}

/* 属性表滚动条（element-plus） */
.prop-scrollbar {
  flex: 0 1 auto;
  max-height: 42%;
  min-height: 0;
}

.prop-form {
  padding: 12px 14px;
  border-bottom: 1px solid #f0f2f5;
}

.prop-item {
  margin-bottom: 12px;
}

.prop-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #606266;
}

/* 属性标签行内的灰色小字提示 */
.prop-label-hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-left: 6px;
}

.prop-hint {
  font-size: 12px;
  color: #c0c4cc;
  text-align: center;
  margin-top: 20px;
}

.panel-actions {
  padding: 12px 14px;
  border-top: 1px solid #f0f2f5;
  flex-shrink: 0;
}

/* 方法手风琴 */
.method-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f5f7fa;
}

.method-collapse {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: none;
  overflow: hidden;
}

.method-collapse :deep(.el-collapse-item) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.method-collapse :deep(.el-collapse-item__header) {
  flex-shrink: 0;
  height: 40px;
  line-height: 40px;
  padding-left: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
}

.method-collapse :deep(.el-collapse-item__wrap) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f5f7fa;
  border-bottom: none;
}

.method-collapse :deep(.el-collapse-item__content) {
  height: 100%;
  overflow: hidden;
  padding: 0;
}

.method-scrollbar {
  height: 100%;
}

.method-list {
  padding: 8px;
}

.method-item {
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #ffffff;
}

.method-name {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: #303133;
  word-break: break-all;
}

.method-desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}

/* 图片选择模态框 */
.texture-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
  min-height: 120px;
}

.texture-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.texture-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.25);
}

.texture-thumb {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f7f8fa;
  padding: 4px;
}

.texture-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.texture-name {
  display: block;
  padding: 6px;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.texture-empty {
  grid-column: 1 / -1;
  font-size: 13px;
  color: #c0c4cc;
  text-align: center;
  padding: 40px 0;
}

/* 富文本格式介绍模态框 */
.format-tip {
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #e6a23c;
  background: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 4px;
}

.format-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 400px;
  overflow: auto;
}

.format-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 4px;
  border-bottom: 1px dashed #e4e7ed;
}

.format-tag {
  flex-shrink: 0;
  max-width: 55%;
  padding: 2px 6px;
  font-size: 12px;
  color: #c7254e;
  background: #f9f2f4;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.format-desc {
  font-size: 13px;
  color: #606266;
}
</style>
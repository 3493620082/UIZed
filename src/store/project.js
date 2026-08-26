import { reactive } from 'vue'
import axios from 'axios'

// 后端服务地址（本地前后端，IP 端口一致）
const API_BASE = 'http://127.0.0.1:8765'

// 全局项目状态（简单响应式 store）
export const projectState = reactive({
  opened: false, // 是否已打开项目
  name: '', // 项目名（日期_时间）
  path: '', // 项目绝对路径
  mainLua: '', // 项目主 Lua 文件内容

  // UI 设计模型：窗口 + 已添加到窗口的元素
  windowTitle: '', // 窗口标题（与 Lua 中 setTitle 保持一致，无则空）
  windowWidthMode: 'percent', // 窗口宽度单位：percent | pixel
  windowWidthPercent: 40, // 宽度（百分比 0-100）
  windowWidthPixel: 400, // 宽度（像素）
  elements: [], // 已添加的元素 { id, type, name, props, isLineBreak }
  functions: [], // 自定义函数（供事件绑定），{ name, params }
})

let _uid = 0
function uid() {
  return ++_uid
}

// 解析/加载期间抑制自动保存：解析会改动 store 从而触发 watch，
// 但“刷新/打开”只是读取显示，不能把读到的内容立刻回写覆盖磁盘
let suppressSave = false
function withSaveSuppressed(fn) {
  suppressSave = true
  try {
    return fn()
  } finally {
    // Vue 的 watch 回调在微任务中执行，延后一个 tick 再恢复，避免仍在解析触发的保存
    setTimeout(() => {
      suppressSave = false
    }, 0)
  }
}

// 元素类型的变量名前缀（参考框架推荐：类型小写 + 序号）
const NAME_PREFIX = {
  text: 'text',
  richtext: 'rich',
  button: 'button',
  imagebutton: 'ibutton',
  progressbar: 'pbar',
  tickbox: 'tick',
  entry: 'entry',
  combobox: 'combo',
  scrolllist: 'scroll',
  image: 'image',
  empty: 'empty',
}

// 为某类型自动生成一个唯一变量名，如 pbar1、button2
function autoName(type) {
  const prefix = NAME_PREFIX[type] || type
  const count = projectState.elements.filter(
    (e) => e.type === type && !e.isLineBreak,
  ).length
  return prefix + (count + 1)
}

// 各元素类型的默认属性（不含变量名 name）
export const ELEMENT_DEFAULTS = {
  text: { text: '文本', font: 'Small', position: 'Left' },
  richtext: { text: '这是一段富文本' },
  button: { text: '按钮' },
  imagebutton: { path: '' },
  progressbar: { value: 20, min: 0, max: 100, color: '#409eff', opacity: 1 },
  tickbox: { position: 'Centre' },
  entry: { value: '', isNumber: false },
  combobox: { items: '选项1,选项2,选项3' },
  scrolllist: { items: '选项1,选项2,选项3' },
  image: { path: '' },
  empty: { width: 10 },
}

// Lua 中 UI:addXxx() 与元素类型的映射
const ADD_MAP = {
  addText: 'text',
  addRichText: 'richtext',
  addProgressBar: 'progressbar',
  addButton: 'button',
  addImageButton: 'imagebutton',
  addTickBox: 'tickbox',
  addEntry: 'entry',
  addComboBox: 'combobox',
  addScrollList: 'scrolllist',
  addImage: 'image',
  addEmpty: 'empty',
}

// 把以逗号分隔的参数串按顶层逗号切分，忽略引号和 {} 内部的逗号
function splitArgs(s) {
  const parts = []
  let depth = 0
  let cur = ''
  let inStr = false
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (inStr) {
      if (ch === '\\') {
        cur += ch + (s[i + 1] || '')
        i += 2
        continue
      }
      cur += ch
      if (ch === '"') inStr = false
      i++
      continue
    }
    if (ch === '"') {
      inStr = true
      cur += ch
      i++
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
      i++
      continue
    }
    cur += ch
    i++
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

// 去掉参数首尾字符串引号并还原转义
function unquote(s) {
  if (s == null) return ''
  let str = s.trim()
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    str = str.slice(1, -1)
  }
  return str.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

// 解析 Lua 表 {..} 为逗号分隔字符串
function parseItems(v) {
  if (v == null) return ''
  let s = v.trim()
  if (s.startsWith('{') && s.endsWith('}')) {
    s = s.slice(1, -1)
    return splitArgs(s)
      .map(unquote)
      .filter((x) => x !== '')
      .join(', ')
  }
  return unquote(s)
}

// 依据元素类型，将 addXxx 中 name 之后的具体参数解析为 props
function parseProps(type, args) {
  const p = {}
  const u = (i) => (args[i] != null ? unquote(args[i]) : undefined)
  switch (type) {
    case 'text':
      if (args[0] != null) p.text = u(0)
      if (args[1] != null) p.font = u(1)
      if (args[2] != null) p.position = u(2)
      break
    case 'richtext':
      if (args[0] != null) p.text = u(0)
      break
    case 'button':
      if (args[0] != null) p.text = u(0)
      // 第三个参数为回调函数：UI:addButton(name, text, func)
      if (args[1] != null) p.onClick = u(1)
      break
    case 'progressbar':
      if (args[0] != null) p.value = Number(args[0])
      if (args[1] != null) p.min = Number(args[1])
      if (args[2] != null) p.max = Number(args[2])
      break
    case 'image':
    case 'imagebutton':
      if (args[0] != null) p.path = u(0)
      // 图片按钮的第二个参数之后为回调函数：UI:addImageButton(name, path, func)
      if (type === 'imagebutton' && args[1] != null) p.onClick = u(1)
      break
    case 'tickbox':
      if (args[0] != null) p.position = u(0)
      break
    case 'entry':
      if (args[0] != null) p.value = u(0)
      if (args[1] != null) p.isNumber = String(args[1]).trim() === 'true'
      break
    case 'combobox':
    case 'scrolllist':
      p.items = parseItems(args[0])
      break
    default:
      break
  }
  return p
}

// 提取 Lua 中所有自定义函数（排除 onCreateUI）的完整代码块
// 采用逐行定位签名（避免全局正则 m.index 的 off-by-one），再从签名行按块深度匹配到对应的 end
// 返回 { 函数名: 完整代码 }；嵌套块（if/for/while/do/repeat + end/until）不会导致提前截断
function extractFuncBlocks(text) {
  const blocks = {}
  const lines = text.split('\n')
  const sigRx = /^\s*(?:local\s+)?function\s+(\w+)\s*\(([^)]*)\)/
  const startRx = /\bfunction\b|\bif\b|\bfor\b|\bwhile\b|\bdo\b|\brepeat\b/g
  const endRx = /\bend\b|\buntil\b/g
  lines.forEach((rawLine, lineNo) => {
    const line = rawLine.replace(/\s*--.*$/, '')
    const m = line.match(sigRx)
    if (!m) return
    const name = m[1]
    if (name === 'onCreateUI') return
    let depth = 0
    let endIdx = lineNo
    for (let j = lineNo; j < lines.length; j++) {
      const cur = lines[j].replace(/\s*--.*$/, '')
      const starts = []
      let sm
      startRx.lastIndex = 0
      while ((sm = startRx.exec(cur))) {
        // for/while/if 行内伴随的 do 不单独成块
        if (sm[0] === 'do' && /\b(?:for|while|if)\b/.test(cur)) continue
        starts.push(sm[0])
      }
      const ends = []
      let em
      endRx.lastIndex = 0
      while ((em = endRx.exec(cur))) ends.push(em[0])
      depth += starts.length - ends.length
      endIdx = j
      if (depth <= 0) break
    }
    blocks[name] = lines.slice(lineNo, endIdx + 1).join('\n')
  })
  return blocks
}

// 从 Lua 代码解析，建立/更新 UI 设计模型
// 返回是否解析成功；无法解析（例如不是有效的 NewUI 项目）时返回 false
export function parseProjectLua(lua) {
  const text = lua || ''

  return withSaveSuppressed(() => {
    try {

  // 解析窗口标题：UI:setTitle("xxx")
  const titleMatch = text.match(/setTitle\(\s*"([^"]*)"\s*\)/)
  projectState.windowTitle = titleMatch ? titleMatch[1] : ''

  // 解析窗口宽度：UI:setWidthPercent(pct) / UI:setWidthPixel(pxl)
  const pxWMatch = text.match(/setWidthPixel\(\s*([0-9.]+)\s*\)/)
  const pctWMatch = text.match(/setWidthPercent\(\s*([0-9.]+)\s*\)/)
  if (pxWMatch) {
    projectState.windowWidthMode = 'pixel'
    projectState.windowWidthPixel = Number(pxWMatch[1])
  } else if (pctWMatch) {
    projectState.windowWidthMode = 'percent'
    // Lua 中百分比为 0-1，转换为设计器 0-100
    projectState.windowWidthPercent = Number(pctWMatch[1]) * 100
  }

  // 解析已添加到窗口的元素与换行：UI:addXxx("name", ...) / UI:nextLine()
  const elements = []
  const callRx = /(?:UI:add(\w+)\(([^()]*)\)|UI:nextLine\(\))/g
  let m
  while ((m = callRx.exec(text))) {
    if (m[1]) {
      // m[1] 是 add 之后的方法名（无 add 前缀，如 ProgressBar），加上前缀查表
      const type = ADD_MAP['add' + m[1]]
      if (!type) continue
      const args = splitArgs(m[2])
      elements.push({
        id: uid(),
        type,
        name: args[0] != null ? unquote(args[0]) : '',
        props: reactive({ ...ELEMENT_DEFAULTS[type], ...parseProps(type, args.slice(1)) }),
        isLineBreak: false,
      })
    } else {
      elements.push({
        id: uid(),
        type: 'linebreak',
        name: '',
        props: {},
        isLineBreak: true,
      })
    }
  }
  // 解析 UI["name"]:setColor(a, r, g, b)，还原进度条颜色（含透明度）
  const scRx = /UI\["([^"]+)"\]:setColor\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)/g
  let sc
  while ((sc = scRx.exec(text))) {
    const el = elements.find((e) => e.name === sc[1])
    if (el && el.type === 'progressbar') {
      el.props.color = rgbToHex(
        Number(sc[3]),
        Number(sc[4]),
        Number(sc[5]),
      )
      el.props.opacity = Number(sc[2])
    }
  }

  // 解析 UI["name"]:setOnMouseDownFunction(_, func)，还原滚动列表的列表项点击绑定
  const sdRx = /UI\["([^"]+)"\]:setOnMouseDownFunction\(\s*[^,)]*\s*,\s*(\w+)\s*\)/g
  let sd
  while ((sd = sdRx.exec(text))) {
    const el = elements.find((e) => e.name === sd[1])
    if (el && el.type === 'scrolllist') {
      el.props.onItemClick = sd[2]
    }
  }

  // 提取所有函数（排除 onCreateUI）的完整代码块，供事件绑定下拉选择并保留函数体
  const funcs = []
  const blocks = extractFuncBlocks(text)
  const fnRx = /^\s*(?:local\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm
  let fm
  while ((fm = fnRx.exec(text))) {
    if (fm[1] === 'onCreateUI') continue
    funcs.push({
      name: fm[1],
      params: fm[2].trim(),
      code: blocks[fm[1]] || '',
    })
  }
  projectState.functions = funcs

  projectState.elements = elements

  // 只有包含 NewUI() 才算有效的可渲染 UI 项目
  if (!text.includes('NewUI(')) return false

  return true
    } catch (error) {
      console.error('解析 Lua 失败', error)
      return false
    }
  })
}

// 打开一个项目；解析失败时返回 false（不打开）
export function openProject(project) {
  try {
    // 先解析，能成功解析才打开
    const ok = parseProjectLua(project.mainLua || '')
    if (!ok) {
      closeProject()
      return false
    }
    projectState.opened = true
    projectState.name = project.name
    projectState.path = project.path
    projectState.mainLua = project.mainLua || ''
    return true
  } catch (error) {
    console.error('打开项目失败', error)
    closeProject()
    return false
  }
}

// 从打开的参考 Lua 刷新
export function refreshFromLua(luaContent) {
  return parseProjectLua(luaContent || '')
}

// 重新从磁盘读取当前项目的主 Lua 并解析渲染；失败返回 false
export async function refreshFromDisk() {
  if (!projectState.opened || !projectState.name) return false
  try {
    const { data } = await axios.get(
      `${API_BASE}/api/project/${projectState.name}`,
    )
    if (!data.success) return false
    const content = data.content || ''
    const ok = parseProjectLua(content)
    if (!ok) return false
    projectState.mainLua = content
    return true
  } catch (error) {
    console.error('刷新项目失败', error)
    return false
  }
}

// 关闭项目
export function closeProject() {
  projectState.opened = false
  projectState.name = ''
  projectState.path = ''
  projectState.mainLua = ''
  projectState.windowTitle = ''
  projectState.windowWidthMode = 'percent'
  projectState.windowWidthPercent = 40
  projectState.windowWidthPixel = 400
  projectState.elements = []
  projectState.functions = []
}

// 新增一个自定义函数（供控件事件绑定），函数名需为合法 Lua 标识符且唯一
export function addFunction(name, params) {
  const n = String(name || '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) {
    return { success: false, message: '函数名需为合法的 Lua 标识符' }
  }
  if (n === 'onCreateUI') {
    return { success: false, message: 'onCreateUI 为保留函数名，不可使用' }
  }
  if (projectState.functions.some((f) => f.name === n)) {
    return { success: false, message: '函数名已存在' }
  }
  const paramsText = String(params || '').trim()
  projectState.functions.push({
    name: n,
    params: paramsText,
    code: `local function ${n}(${paramsText})\n    -- TODO: 添加你的代码\nend`,
  })
  return { success: true }
}

// 删除一个自定义函数（取消绑定的元素会保留原函数名，仅列表移除）
export function removeFunction(name) {
  const index = projectState.functions.findIndex((f) => f.name === name)
  if (index >= 0) projectState.functions.splice(index, 1)
}

// 向窗口添加一个元素
export function addElement(type) {
  const el = {
    id: uid(),
    type,
    name: autoName(type),
    props: reactive({ ...ELEMENT_DEFAULTS[type] }),
    isLineBreak: false,
  }
  projectState.elements.push(el)
  return el
}

// 向窗口添加一个换行
export function addLineBreak() {
  const el = {
    id: uid(),
    type: 'linebreak',
    name: '',
    props: {},
    isLineBreak: true,
  }
  projectState.elements.push(el)
  return el
}

// 从窗口移除一个元素
export function removeElement(id) {
  const index = projectState.elements.findIndex((e) => e.id === id)
  if (index >= 0) projectState.elements.splice(index, 1)
}

// ---------- Lua 代码生成与保存 ----------

// 生成 Lua 字符串字面量（转义引号与反斜杠）
function luaStr(value) {
  const s = String(value == null ? '' : value)
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

// 颜色工具：把 6 位十六进制(#rrggbb) 转为 setColor 用的 0-1 浮点分量
// 非法的值一律回退为默认蓝，保证不产生 NaN
function hexToRgb(hex) {
  let h = String(hex == null ? '' : hex)
    .replace('#', '')
    .replace(/[^0-9a-fA-F]/g, '')
  if (h.length < 6) h = '409eff'
  h = h.slice(0, 6)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const c = (n) => (Number.isFinite(n) ? (n / 255).toFixed(3) : '1.000')
  return { r: c(r), g: c(g), b: c(b), a: '1.000' }
}
function componentToHex(v) {
  const n = Number.isFinite(v) ? Math.round(v * 255) : 255
  return n.toString(16).padStart(2, '0')
}
// 回读 setColor 的 r,g,b 还原为 6 位十六进制（透明度单独存于 opacity）
function rgbToHex(r, g, b) {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

// 把逗号分隔的字符串转成 Lua 表
function itemsTable(itemsStr) {
  const arr = String(itemsStr || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!arr.length) return '{}'
  return '{' + arr.map(luaStr).join(', ') + '}'
}

// 生成单个元素的 addXxx 调用代码
function buildElementLine(el) {
  const n = luaStr(el.name)
  const pr = el.props || {}
  switch (el.type) {
    case 'text':
      return `UI:addText(${n}, ${luaStr(pr.text)}, ${luaStr(pr.font || 'Small')}, ${luaStr(pr.position || 'Left')})`
    case 'richtext':
      // 移除换行符，把富文本内容压成一行字符串写入 Lua
      return `UI:addRichText(${n}, ${luaStr(String(pr.text || '').replace(/[\r\n]+/g, ''))})`
    case 'button':
      // 回调函数直接作为第三个参数传入：UI:addButton(name, text, func)
      return pr.onClick
        ? `UI:addButton(${n}, ${luaStr(pr.text)}, ${pr.onClick})`
        : `UI:addButton(${n}, ${luaStr(pr.text)})`
    case 'imagebutton':
      // 回调函数直接作为第三个参数传入：UI:addImageButton(name, path, func)
      return pr.onClick
        ? `UI:addImageButton(${n}, ${luaStr(pr.path || '')}, ${pr.onClick})`
        : `UI:addImageButton(${n}, ${luaStr(pr.path || '')})`
    case 'progressbar':
      return `UI:addProgressBar(${n}, ${pr.value ?? 0}, ${pr.min ?? 0}, ${pr.max ?? 100})`
    case 'tickbox':
      return `UI:addTickBox(${n}, ${luaStr(pr.position ?? 'Centre')})`
    case 'entry':
      return `UI:addEntry(${n}, ${luaStr(pr.value)}, ${pr.isNumber ? 'true' : 'false'})`
    case 'combobox':
      return `UI:addComboBox(${n}, ${itemsTable(pr.items)})`
    case 'scrolllist':
      return `UI:addScrollList(${n}, ${itemsTable(pr.items)})`
    case 'image':
      return `UI:addImage(${n}, ${luaStr(pr.path || '')})`
    case 'empty':
      return `UI:addEmpty(${n})`
    default:
      return ''
  }
}

// 根据设计模型生成完整的主 Lua 文件内容
export function generateLua() {
  const p = projectState
  const imports = [
    '"ISUI.GlobalFunctions"',
    '"ISUI.ISSimpleEmpty"',
    '"ISUI.ISSimpleText"',
    '"ISUI.ISSimpleRichText"',
    '"ISUI.ISSimpleProgressBar"',
    '"ISUI.ISSimpleButton"',
    '"ISUI.ISSimpleImageButton"',
    '"ISUI.ISSimpleTickBox"',
    '"ISUI.ISSimpleEntry"',
    '"ISUI.ISSimpleComboBox"',
    '"ISUI.ISSimpleScrollingListBox"',
    '"ISUI.ISSimpleImage"',
  ]

  const body = []
  body.push('local function onCreateUI()')
  body.push('    UI = NewUI()')
  if (p.windowTitle) body.push(`    UI:setTitle(${luaStr(p.windowTitle)})`)
  if (p.windowWidthMode === 'pixel') {
    body.push(`    UI:setWidthPixel(${p.windowWidthPixel})`)
  } else {
    body.push(`    UI:setWidthPercent(${(p.windowWidthPercent / 100).toFixed(4)})`)
  }

  for (const el of p.elements) {
    if (el.isLineBreak) {
      body.push('    UI:nextLine()')
    } else {
      const line = buildElementLine(el)
      if (line) body.push('    ' + line)
      // 进度条颜色与透明度：UI["name"]:setColor(a, r, g, b)
      if (el.type === 'progressbar' && el.props.color) {
        const c = hexToRgb(el.props.color)
        const a = Number(el.props.opacity)
        const alpha = Number.isFinite(a) ? Math.min(1, Math.max(0, a)).toFixed(3) : '1.000'
        body.push(`    UI[${luaStr(el.name)}]:setColor(${alpha}, ${c.r}, ${c.g}, ${c.b})`)
      }
      // 滚动列表的列表项点击事件：UI["name"]:setOnMouseDownFunction(_, funcName)
      if (el.type === 'scrolllist' && el.props.onItemClick) {
        body.push(
          `    UI[${luaStr(el.name)}]:setOnMouseDownFunction(_, ${el.props.onItemClick})`,
        )
      }
    }
  }

  body.push('    UI:saveLayout()')
  body.push('end')
  body.push('')
  body.push('Events.OnCreateUI.Add(onCreateUI)')

  const lines = []
  lines.push('--[[')
  lines.push('    UIZed 生成的项目主文件')
  lines.push(']]')
  lines.push('-- 导入 ISUI 目录下的 Lua 代码文件')
  for (const imp of imports) lines.push(`require ${imp}`)
  lines.push('')
  lines.push('local UI')
  lines.push('')
  // 自定义函数必须定义在 onCreateUI 之前，防止事件绑定时找不到函数
  for (const fn of p.functions) {
    // 优先输出保存的函数体代码，未编辑过的函数输出 TODO 占位
    if (fn.code) {
      lines.push(fn.code)
    } else {
      lines.push(`local function ${fn.name}(${fn.params || ''})`)
      lines.push('    -- TODO: 添加你的代码')
      lines.push('end')
    }
    lines.push('')
  }
  lines.push(body.join('\n'))
  return lines.join('\n')
}

// 保存项目主 Lua 文件到磁盘，并同步到 store 的 mainLua
export async function saveProject() {
  if (!projectState.opened || !projectState.name) return
  if (suppressSave) return // 解析/加载期间不回写
  const content = generateLua()
  try {
    await axios.post(`${API_BASE}/api/project/${projectState.name}/lua`, { content })
    projectState.mainLua = content
  } catch (error) {
    console.error('保存项目失败', error)
  }
}

// 直接用给定内容覆盖保存项目主 Lua（用于 Lua 代码页的手动编辑）
export async function saveRawLua(content) {
  if (!projectState.opened || !projectState.name) {
    return { success: false }
  }
  try {
    await axios.post(`${API_BASE}/api/project/${projectState.name}/lua`, { content })
    // 重新解析同步 UI 模型（提取函数体、控件绑定等），防止后续自动保存覆盖手动编辑内容
    parseProjectLua(content)
    projectState.mainLua = content
    return { success: true }
  } catch (error) {
    console.error('保存 Lua 失败', error)
    return { success: false }
  }
}
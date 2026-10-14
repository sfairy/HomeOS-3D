/**
 * 无障碍交互契约回归（P1-a11y 的成绩单棘轮）。
 *
 * 两批修复各有一批「缺了就等于没做」的契约，vue-tsc 与既有门禁都看不见：
 *
 * 1. **模态对话框**（8 个）：`role="dialog"`/`alertdialog` + `aria-modal` + 可访问名称
 *    + 焦点陷阱 + Esc 栈 + 背景 inert + 背景滚动锁。
 * 2. **纯点击元素补键盘路径**（6 处）：`<div @click="...">` 这类「鼠标能点、键盘完全
 *    到不了」的交互，必须换成原生可聚焦控件，或同时带 `@keydown` /
 *    `role="button" + tabindex`。
 *
 * 本脚本逐个解析模板（标签名 + 属性），检查上面这些不变量——新增一处
 * `<div @click>`、或某个模态掉了 `aria-modal`，都会红。纯粹读源码，不需要浏览器：
 * 解析器与 Vue 运行时无关（注释、script/style 段先剥掉，属性值引号内的 `>` 不会误切）。
 *
 * 口径说明（为什么只扫这两批清单）：这是**已收敛清单的棘轮**，不是全仓扫描器。
 * 全仓还有大量未处理的 `<div @click>`（弹窗遮罩、拖拽容器等），本批不碰；把清单写死
 * 才能保证「修好的地方不退化」，而不是把未修的既存问题也变成红灯。
 *
 * 用法：`bun run scripts/smoke/_a11y_contracts_smoke.ts`（在 homeos/frontend 下执行）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { check, report, section } from '../_smoke_harness'

const SRC = join(import.meta.dir, '..', '..', 'src')

/* ------------------------------------------------------------------ *
 * 极简模板解析：标签名 + 属性
 * ------------------------------------------------------------------ */

interface Attr {
  name: string
  value: string
  /** 是否显式带值（`@click.stop` 与 `@click.stop=""` 都算「无处理器」） */
  hasValue: boolean
}

interface Tag {
  tag: string
  attrs: Attr[]
  /** 该标签在源文件里的起始行号（报错定位用） */
  line: number
}

/** 剥掉 `<script>` / `<style>` 块与 HTML 注释（前者可能含 `>` / `<` 干扰分词）。 */
function templateOf(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

/** 解析一段属性串（标签名之后、`>` 之前的内容）。 */
function parseAttrs(raw: string): Attr[] {
  const attrs: Attr[] = []
  let index = 0
  const readWhile = (test: (char: string) => boolean) => {
    let text = ''
    while (index < raw.length && test(raw[index])) text += raw[index++]
    return text
  }
  while (index < raw.length) {
    readWhile((char) => /\s/.test(char))
    if (index >= raw.length) break
    const name = readWhile((char) => !/[\s=]/.test(char))
    readWhile((char) => /\s/.test(char))
    if (raw[index] !== '=') {
      attrs.push({ name, value: '', hasValue: false })
      continue
    }
    index += 1 // 吃掉 '='
    readWhile((char) => /\s/.test(char))
    const quote = raw[index]
    if (quote === '"' || quote === "'") {
      index += 1
      const value = readWhile((char) => char !== quote)
      index += 1 // 吃掉收尾引号
      attrs.push({ name, value, hasValue: true })
    } else {
      attrs.push({ name, value: readWhile((char) => !/\s/.test(char)), hasValue: true })
    }
  }
  return attrs
}

/** 扫描模板里的所有开标签（忽略闭标签）。 */
function tagsOf(source: string): Tag[] {
  const body = templateOf(source)
  const tags: Tag[] = []
  let index = 0
  let line = 1
  while (index < body.length) {
    const char = body[index]
    if (char === '\n') {
      line += 1
      index += 1
      continue
    }
    if (char !== '<') {
      index += 1
      continue
    }
    const nameMatch = /^<([A-Za-z][\w.-]*)/.exec(body.slice(index))
    if (!nameMatch) {
      index += 1
      continue
    }
    const startLine = line
    const tag = nameMatch[1]
    let cursor = index + nameMatch[0].length
    let raw = ''
    let quote: string | null = null
    while (cursor < body.length) {
      const current = body[cursor]
      if (current === '\n') line += 1
      if (quote) {
        if (current === quote) quote = null
      } else if (current === '"' || current === "'") {
        quote = current
      } else if (current === '>') {
        break
      }
      raw += current
      cursor += 1
    }
    tags.push({ tag, attrs: parseAttrs(raw), line: startLine })
    index = cursor + 1
  }
  return tags
}

/* ------------------------------------------------------------------ *
 * 判定口径
 * ------------------------------------------------------------------ */

/** 原生就带键盘语义的标签（`button` 不需要额外属性）。 */
const NATIVE_KEYBOARD_TAGS = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
  'RouterLink',
  'router-link',
])

const isHandler = (attr: Attr) => attr.hasValue && attr.value.trim().length > 0
const isClickHandler = (attr: Attr) =>
  /^(?:@|v-on:)(?:click|tap)(?:\.[\w-]+)*$/.test(attr.name)
const isKeyHandler = (attr: Attr) =>
  /^(?:@|v-on:)(?:keydown|keyup|keypress)(?:\.[\w-]+)*$/.test(attr.name)

/**
 * 一个标签上的「真实点击处理器」。
 * `@click.stop`（无值 / 空值）只是阻止冒泡的护栏，不是交互，不在此列。
 */
function clickHandlers(tag: Tag): Attr[] {
  return tag.attrs.filter((attr) => isClickHandler(attr) && isHandler(attr))
}

/** 该元素是否具备键盘触发路径。 */
function keyboardReachable(tag: Tag): boolean {
  if (NATIVE_KEYBOARD_TAGS.has(tag.tag)) return true
  // `<component :is="clickable ? 'button' : 'div'">`：可点击时才渲染成 button
  const dynamic = tag.attrs.find((attr) => attr.name === ':is' || attr.name === 'v-bind:is')
  if (tag.tag === 'component' && dynamic?.value.includes("'button'")) return true
  if (tag.attrs.some((attr) => isKeyHandler(attr) && isHandler(attr))) return true
  const role = tag.attrs.find((attr) => attr.name === 'role')
  const tabindex = tag.attrs.find((attr) => attr.name === 'tabindex' || attr.name === ':tabindex')
  return role?.value === 'button' && !!tabindex
}

/** 扫描一份 `.vue`：返回标签表、违规清单与「真实点击处理器」总数。 */
function analyze(relPath: string) {
  const tags = tagsOf(readFileSync(join(SRC, relPath), 'utf8'))
  const violations: string[] = []
  let clickCount = 0
  for (const tag of tags) {
    if (clickHandlers(tag).length === 0) continue
    clickCount += 1
    if (!keyboardReachable(tag)) violations.push(`第 ${tag.line} 行 <${tag.tag}>`)
  }
  return { tags, violations, clickCount }
}

/** 按标签名 + class 片段定位一个元素。 */
function findTag(tags: Tag[], tag: string, classFragment: string): Tag | undefined {
  return tags.find(
    (item) =>
      item.tag === tag &&
      item.attrs.some(
        (attr) =>
          (attr.name === 'class' || attr.name === ':class') && attr.value.includes(classFragment),
      ),
  )
}

const hasAttr = (tag: Tag | undefined, name: string) =>
  !!tag?.attrs.some((attr) => attr.name === name || attr.name === `:${name}`)

/**
 * 是否给了无障碍名称。除显式 `aria-label` / `:aria-label` 外，也接受写在
 * `v-bind` 对象里的（`浮动中心实体部件` 就是这么写的：只有渲染成 button 时才需要名称）。
 */
const hasAriaLabel = (tag: Tag | undefined) =>
  hasAttr(tag, 'aria-label') ||
  !!tag?.attrs.some((attr) => attr.name === 'v-bind' && attr.value.includes('aria-label'))

const isClickable = (tag: Tag | undefined) => !!tag && clickHandlers(tag).length > 0

/* ------------------------------------------------------------------ *
 * 1. 不变量：有真实点击处理器的元素必须键盘可达
 * ------------------------------------------------------------------ */

const COMPONENTS = {
  assetList: ['素材列表条目', 'components/common/asset-manager/AssetManagerListItem.vue'],
  grid: ['素材网格条目', 'components/common/AssetGridItem.vue'],
  camera: ['安防摄像头格', 'features/security/CameraTile.vue'],
  hubEntity: ['浮动中心实体部件', 'components/shell/floating-hub/FloatingHubEntityWidget.vue'],
  mini: ['多媒体迷你部件', 'components/widgets/media/MiniWidget.vue'],
  lightCard: ['设备组灯具卡片', 'components/entities/device-group/DeviceGroupLightCard.vue'],
} as const

section('1. 不变量：有真实点击处理器的元素必须键盘可达')

const analyzed: Record<string, ReturnType<typeof analyze>> = {}
for (const [key, [label, relPath]] of Object.entries(COMPONENTS)) {
  const result = analyze(relPath)
  analyzed[key] = result
  check(`${label}：无「仅有点击」元素`, result.violations.length === 0, result.violations.join('；'))
  check(`${label}：确实存在点击交互（断言不是空跑）`, result.clickCount > 0, result.clickCount)
}

/* ------------------------------------------------------------------ *
 * 2. 逐个组件：主操作真的落在了 <button> 上
 * ------------------------------------------------------------------ */

section('2. 主操作落在 <button> 上')

{
  const { tags } = analyzed.assetList
  const main = findTag(tags, 'button', 'asset-list-item__main')
  check('素材列表条目：主操作是 .asset-list-item__main 按钮', !!main, '')
  check('素材列表条目：主操作带无障碍名称', hasAriaLabel(main), '')
  check(
    '素材列表条目：条目根容器不再是可点击 div',
    !isClickable(findTag(tags, 'div', 'asset-list-item')),
    '',
  )
  check(
    '素材列表条目：复制 / 删除仍是普通按钮',
    isClickable(findTag(tags, 'button', 'asset-list-action-btn')),
    '',
  )
}

{
  const { tags } = analyzed.grid
  const main = findTag(tags, 'button', 'agi-item__main')
  check('素材网格条目：主操作是 .agi-item__main 按钮', !!main, '')
  check('素材网格条目：主操作带无障碍名称', hasAriaLabel(main), '')
  check('素材网格条目：根卡片不再是可点击 div', !isClickable(findTag(tags, 'div', 'agi-item')), '')
}

{
  const { tags } = analyzed.camera
  const selectLayer = findTag(tags, 'button', 'sct-select-layer')
  const placeholder = findTag(tags, 'button', 'sct-placeholder-btn')
  check('摄像头格：拉流中是整格选中按钮', !!selectLayer, '')
  check('摄像头格：未拉流 / 失败是占位按钮', !!placeholder, '')
  check(
    '摄像头格：两者互斥（v-if / v-else）',
    hasAttr(selectLayer, 'v-if') && hasAttr(placeholder, 'v-else'),
    '',
  )
  check(
    '摄像头格：皆有无障碍名称',
    hasAriaLabel(selectLayer) && hasAriaLabel(placeholder),
    '',
  )
  const root = tags.find((tag) =>
    tag.attrs.some((attr) => attr.name === 'ref' && attr.value === 'rootRef'),
  )
  check('摄像头格：根容器不再是可点击 div', !isClickable(root), '')
}

{
  const { tags } = analyzed.hubEntity
  const dynamic = tags.find((tag) => tag.tag === 'component')
  check('浮动中心实体部件：可点击性决定标签类型（button / div）', hasAttr(dynamic, ':is'), '')
  check('浮动中心实体部件：按钮态带无障碍名称', hasAriaLabel(dynamic), '')
}

{
  const { tags } = analyzed.mini
  const dot = findTag(tags, 'button', 'mm-dot')
  const open = findTag(tags, 'button', 'mm-open')
  check('多媒体迷你部件：分页点改成 <button>', !!dot, '')
  check(
    '多媒体迷你部件：分页点带无障碍名称与当前项语义',
    hasAriaLabel(dot) && hasAttr(dot, 'aria-current'),
    '',
  )
  check('多媒体迷你部件：打开播放器是 .mm-open 按钮', !!open, '')
  check('多媒体迷你部件：打开播放器带无障碍名称', hasAriaLabel(open), '')
}

{
  const { tags } = analyzed.lightCard
  const card = findTag(tags, 'button', 'dgm-light-card')
  check('设备组灯具卡片：整卡是 <button>', !!card, '')
  check('设备组灯具卡片：用 aria-pressed 表达开关态', hasAttr(card, 'aria-pressed'), '')
  check('设备组灯具卡片：名称与状态分离（aria-label 用实体名）', hasAriaLabel(card), '')
}

/* ------------------------------------------------------------------ *
 * 3. 只靠 :hover 显形的操作，键盘聚焦时也要显形
 * ------------------------------------------------------------------ */

section('3. 悬停显形的操作在 :focus-within 下同样显形')

const CSS_RULES: Array<[string, string, string]> = [
  [
    '素材列表条目',
    'components/common/asset-manager/styles/asset-manager-body.css',
    '.asset-list-item:focus-within .asset-list-item__actions',
  ],
  [
    '素材网格条目',
    'components/common/styles/AssetGridItem.css',
    '.agi-item:focus-within .agi-actions',
  ],
]

for (const [label, relPath, selector] of CSS_RULES) {
  const css = readFileSync(join(SRC, relPath), 'utf8')
  check(`${label}：${selector} 存在`, css.includes(selector), '')
}

{
  // 摄像头格的名称条改成容器 :hover / :focus-within 显形（原来是自身 :hover，
  // 加了 pointer-events:none 之后就永远显不出来）。
  const source = readFileSync(join(SRC, COMPONENTS.camera[1]), 'utf8')
  check(
    '摄像头格：名称条改用容器 :focus-within 显形',
    source.includes('.security-camera-tile:focus-within .sct-name-bar'),
    '',
  )
  check(
    '摄像头格：名称条是装饰层（点击穿透）',
    /\.sct-name-bar \{[\s\S]*?pointer-events: none;/.test(source),
    '',
  )
  check(
    '摄像头格：hover 显形收在 @media (hover: hover) 里（触屏不卡住）',
    /@media \(hover: hover\) \{[\s\S]*?\.security-camera-tile:hover \.sct-name-bar[\s\S]*?\n\}/.test(
      source,
    ),
    '',
  )
}

/* ------------------------------------------------------------------ *
 * 4. 高对比（forced-colors）模式下的焦点可见性
 * ------------------------------------------------------------------ */

section('4. 高对比模式下焦点可见')

{
  const css = readFileSync(join(SRC, 'assets/styles/main.css'), 'utf8')
  const block = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(css)
  check('main.css 有 @media (forced-colors: active) 块', !!block, '')
  check(
    '高对比焦点环走 outline + Highlight（系统保留绘制 / 跟随系统强调色）',
    !!block && /outline: 3px solid Highlight/.test(block[1]),
    '',
  )
  check(
    '高对比焦点环覆盖 [role="button"] / [tabindex] 等非原生控件',
    !!block && /role="button"/.test(block[1]) && /tabindex/.test(block[1]),
    '',
  )
}

/* ------------------------------------------------------------------ *
 * 5. 模态对话框：语义 + 焦点陷阱 + Esc + 背景隔离 + 滚动锁
 * ------------------------------------------------------------------ */

section('5. 模态对话框语义与焦点治理')

/**
 * P1 点名要补的 8 个模态。每一条都是「缺了就等于没做」的契约：
 * - `role`：读屏才知道这是个对话框（`alertdialog` 用于「放弃修改」这类需要立刻决断的）
 * - `aria-modal`：虚拟光标不会跑到后面还在闪的页面上
 * - 名称：`aria-label` 或 `aria-labelledby` 至少有一个，否则读屏只念「对话框」
 * - 四个 composable：焦点陷阱（Tab 循环）/ Esc 栈（叠层 LIFO）/ 背景 inert / 背景滚动锁
 */
const MODALS: Array<[string, string, boolean]> = [
  ['媒体播放器', 'components/modals/MediaPlayerModal.vue', false],
  ['设备组', 'components/entities/device-group/DeviceGroupModal.vue', false],
  ['设置锁验证', 'components/modals/SettingsLockModal.vue', false],
  ['放弃修改确认', 'components/common/ExitEditConfirmDialog.vue', true],
  ['实体选择', 'components/entities/EntityPickModal.vue', false],
  ['素材选择', 'components/common/AssetPickerModal.vue', false],
  ['素材管理', 'components/common/AssetManagerModal.vue', false],
  ['告警规则', 'features/settings/interact/AlertRulesPanel.vue', false],
]

const COMPOSABLE_CALLS = [
  'useFocusTrap(',
  'useEscLayer(',
  'useBackgroundInert(',
  'useBodyScrollLock(',
] as const

for (const [label, relPath, isAlertDialog] of MODALS) {
  const { tags } = analyze(relPath)
  const role = isAlertDialog ? 'alertdialog' : 'dialog'
  const dialog = tags.find(
    (tag) =>
      tag.attrs.some((attr) => attr.name === 'role' && attr.value === role) &&
      tag.attrs.some((attr) => attr.name === 'aria-modal' && attr.value === 'true'),
  )
  const named = hasAriaLabel(dialog) || hasAttr(dialog, 'aria-labelledby')
  const source = readFileSync(join(SRC, relPath), 'utf8')
  const missing = COMPOSABLE_CALLS.filter((call) => !source.includes(call))

  check(`${label}模态：role="${role}" + aria-modal`, !!dialog, '')
  check(`${label}模态：有可访问名称`, named, '')
  check(`${label}模态：焦点陷阱 / Esc / 背景 inert / 滚动锁齐备`, missing.length === 0, missing.join('、'))
}

report('无障碍交互契约回归')


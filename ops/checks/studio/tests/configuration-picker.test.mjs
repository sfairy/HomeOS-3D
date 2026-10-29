/**
 * `configuration-picker`（0.8.1）的契约测试。
 *
 * 配置页里「当前设备 / 类别 / 关联模型 / 添加」原来各有一套下拉，0.8.1 收敛成
 * 同一个弹窗选择器。收敛后最容易坏的不是样式，而是**判据**：
 *
 * 1. 触发器必须带 `aria-haspopup="dialog"` 且无可选项时 `disabled`；
 * 2. 选项的 `disabled` 要真禁掉（已配置的模型不能重复选）；
 * 3. 空分组要落到 `emptyMessage`，不能弹出一个空白弹窗；
 * 4. `onSelect` 抛错时错误写回弹窗且选项恢复可点（不能整窗关掉）；
 * 5. 关窗后再点选项必须无效（过期守卫的最后一层）。
 *
 * 这里用一份最小 DOM 假件驱动真实模块 —— `openConfigurationPicker` 只依赖
 * createElement / append / setAttribute / addEventListener / showModal 这几个面。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase()
    this.ownerDocument = ownerDocument
    this.children = []
    this.attributes = {}
    this.listeners = {}
    this.style = {}
    this.className = ''
    this.textContent = ''
    this.disabled = false
    this.type = ''
    this.title = ''
    this.closed = false
    this.removed = false
    this.open = false
    this.parentElement = null
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value)
  }
  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null
  }
  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === 'string') this.children.push({ textContent: node })
      else {
        node.parentElement = this
        this.children.push(node)
      }
    }
  }
  addEventListener(type, handler) {
    ;(this.listeners[type] ||= []).push(handler)
  }
  remove() {
    this.removed = true
  }
  close() {
    this.closed = true
  }
  showModal() {
    this.open = true
  }
  focus() {
    this.focused = true
  }
}

const FAKE_DOCUMENT = {
  activeElement: null,
  body: new FakeElement('body', null),
  createElement(tagName, className = '', textContent = '') {
    const element = new FakeElement(tagName, FAKE_DOCUMENT)
    element.className = className
    element.textContent = textContent
    return element
  },
}
FAKE_DOCUMENT.body.ownerDocument = FAKE_DOCUMENT

// `openConfigurationPicker` 用 `instanceof HTMLElement` 判断焦点恢复，Node/Bun 里没有这个全局。
globalThis.HTMLElement = FakeElement

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/config-ui/configuration-picker.ts', import.meta.url),
)
const PROGRESS_MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/config-ui/configuration-progress.ts', import.meta.url),
)
const PICKER_ROW_MODULE = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/runtime/config-ui/config-editor/rendering/picker-row.ts',
    import.meta.url,
  ),
)

const { openConfigurationPicker, configurationSummary } = await import(MODULE)
const { configurationProgress } = await import(PROGRESS_MODULE)
const { bindPickerRow, kindConfigurationProgress } = await import(PICKER_ROW_MODULE)

/** 深度收集满足条件的元素。 */
function collect(root, predicate, found = []) {
  if (root && typeof root === 'object') {
    if (predicate(root)) found.push(root)
    for (const child of root.children || []) collect(child, predicate, found)
  }
  return found
}
function options(root) {
  return collect(root, (node) => node.attributes?.['data-configuration-choice'] !== undefined)
}
function textOf(node) {
  if (!node || typeof node !== 'object') return ''
  return String(node.textContent || '') + (node.children || []).map(textOf).join('')
}
function lastDialog() {
  return collect(FAKE_DOCUMENT.body, (node) => node.tagName === 'DIALOG').at(-1)
}
async function click(element) {
  for (const handler of element.listeners.click || []) await handler({ currentTarget: element })
}

test('触发器：aria-haspopup=dialog、禁用态、点击回调', () => {
  const appended = []
  const createSettingRow = (rowContainer, rowLabel, rowControl) => {
    appended.push({ rowContainer, rowLabel, rowControl })
    return rowControl
  }
  const createPickerRow = bindPickerRow(
    { createElement: (tagName, className, textContent) => FAKE_DOCUMENT.createElement(tagName, className, textContent) },
    createSettingRow,
  )
  const container = FAKE_DOCUMENT.createElement('div')
  let opened = 0
  const enabledTrigger = createPickerRow({
    rowContainer: container,
    rowLabel: '当前设备',
    currentLabel: '客厅灯',
    onOpen: () => opened++,
  })
  assert.equal(enabledTrigger.getAttribute('aria-haspopup'), 'dialog')
  assert.equal(enabledTrigger.getAttribute('aria-label'), '当前设备')
  assert.equal(textOf(enabledTrigger), '客厅灯')
  assert.equal(enabledTrigger.disabled, false)
  enabledTrigger.listeners.click[0]({})
  assert.equal(opened, 1)

  const disabledTrigger = createPickerRow({
    rowContainer: container,
    rowLabel: '关联模型',
    currentLabel: '无',
    disabled: true,
    onOpen: () => opened++,
  })
  assert.equal(disabledTrigger.disabled, true)
  disabledTrigger.listeners.click[0]({})
  assert.equal(opened, 1, '禁用时不得打开弹窗')
  assert.deepEqual(
    appended.map((entry) => entry.rowLabel),
    ['当前设备', '关联模型'],
  )
})

test('选项：分组标题、当前项标记、禁用项真禁用', async () => {
  const handle = openConfigurationPicker({
    document: FAKE_DOCUMENT,
    title: '关联空调模型',
    kicker: 'MODEL SELECTION',
    selectedId: 'm1',
    sections: [
      {
        label: '本层模型',
        options: [
          { id: 'm1', label: '主卧空调', detail: '当前关联' },
          { id: 'm2', label: '客厅空调', disabled: true, detail: '已配置' },
        ],
      },
    ],
    onSelect: () => {},
  })
  const dialog = lastDialog()
  assert.equal(dialog.open, true)
  assert.equal(dialog.getAttribute('aria-label'), '关联空调模型')
  const grouped = collect(dialog, (node) => node.tagName === 'SECTION')
  assert.equal(textOf(grouped[0]).startsWith('本层模型'), true)

  const [currentOption, occupiedOption] = options(dialog)
  assert.equal(currentOption.getAttribute('aria-pressed'), 'true')
  assert.equal(currentOption.className.includes('is-selected'), true)
  assert.equal(occupiedOption.disabled, true)
  handle.close()
})

test('空分组：落到 emptyMessage，而不是空白弹窗', () => {
  const handle = openConfigurationPicker({
    document: FAKE_DOCUMENT,
    title: '选择当前设备',
    sections: [{ options: [] }],
    emptyMessage: '当前楼层还没有配置对象。',
    onSelect: () => {},
  })
  assert.equal(textOf(lastDialog()).includes('当前楼层还没有配置对象。'), true)
  handle.close()
})

test('onSelect 抛错：文案写回弹窗、选项恢复可点、弹窗不关', async () => {
  const handle = openConfigurationPicker({
    document: FAKE_DOCUMENT,
    title: '添加门',
    sections: [
      {
        options: [
          { id: 'd1', label: '门 1' },
          { id: 'd2', label: '门 2', disabled: true, detail: '已配置' },
        ],
      },
    ],
    onSelect: () => {
      throw new Error('该对象已添加或不再可用，请重新选择。')
    },
  })
  const dialog = lastDialog()
  const [firstOption, occupiedOption] = options(dialog)
  await click(firstOption)
  const errorElement = collect(dialog, (node) =>
    String(node.className || '').includes('i3d-error'),
  ).at(-1)
  assert.equal(errorElement.textContent, '该对象已添加或不再可用，请重新选择。')
  assert.equal(errorElement.getAttribute('role'), 'status')
  assert.equal(dialog.closed, false, '失败时必须留在弹窗里重选')
  assert.equal(firstOption.disabled, false)
  assert.equal(occupiedOption.disabled, true)
  handle.close()
})

test('选择成功即关窗；关窗后选项不再响应（过期守卫）', async () => {
  let selected = ''
  let closed = 0
  const handle = openConfigurationPicker({
    document: FAKE_DOCUMENT,
    title: '选择设备类别',
    sections: [{ options: [{ id: 'nas', label: 'NAS' }] }],
    onSelect: (choiceId) => {
      selected = choiceId
    },
    onClose: () => closed++,
  })
  const dialog = lastDialog()
  const [onlyOption] = options(dialog)
  await click(onlyOption)
  assert.equal(selected, 'nas')
  assert.equal(dialog.closed, true)
  assert.equal(dialog.removed, true)
  assert.equal(closed, 1)
  // 关窗后按钮仍挂着监听，但 `isClosed` 应该让第二次点击完全无效。
  await click(onlyOption)
  assert.equal(selected, 'nas')
  handle.close()
  assert.equal(closed, 1, 'close 必须幂等')
})

test('cancel 事件：preventDefault + stopPropagation（不冒出到外层对话框）', () => {
  const handle = openConfigurationPicker({
    document: FAKE_DOCUMENT,
    title: '选择环境类别',
    sections: [{ options: [{ id: 'cover', label: '窗帘' }] }],
    onSelect: () => {},
  })
  const dialog = lastDialog()
  const event = {
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
  }
  for (const handler of dialog.listeners.cancel || []) handler(event)
  assert.equal(event.prevented, true)
  assert.equal(event.stopped, true)
  assert.equal(dialog.closed, true)
  handle.close()
})

test('configurationSummary：加载中 / 缺失计数 / 已配置为 0 的样式类', () => {
  const loadingElement = configurationSummary(configurationProgress({ ready: false }), {
    document: FAKE_DOCUMENT,
    unit: '模型',
  })
  assert.equal(loadingElement.textContent, '加载中…')

  const summary = configurationProgress({
    models: [{ id: 'm1' }, { id: 'm2' }],
    bindings: [{ modelId: 'm1' }, { modelId: 'gone' }],
  })
  const summaryElement = configurationSummary(summary, { document: FAKE_DOCUMENT, unit: '模型' })
  const numbers = collect(summaryElement, (node) => String(node.className || '').includes('i3d-configuration-number'))
  assert.deepEqual(
    numbers.map((node) => node.textContent),
    ['2', '1', '1', '1'],
    '总数 / 已配置 / 未配置 / 缺失',
  )
  assert.equal(numbers[0].className.includes('is-zero'), false)
  const zeroElement = configurationSummary(
    configurationProgress({ models: [], bindings: [] }),
    { document: FAKE_DOCUMENT, unit: '模型' },
  )
  assert.equal(
    collect(zeroElement, (node) => String(node.className || '').includes('i3d-configuration-number'))[0]
      .className.includes('is-zero'),
    true,
  )
})

test('类别进度：按目标类别的模型库算，环境标签只数已配置', () => {
  const editorHost = {
    floorSelection: 'f1',
    sceneMetadata: {
      floors: [
        {
          id: 'f1',
          airConditioners: [{ id: 'ac-1' }, { id: 'ac-2' }],
          airPurifiers: [{ id: 'ap-1' }],
          curtains: [],
        },
      ],
    },
    structuredClone2: {
      devices: {},
      environment: {
        airConditioners: [
          { id: 'i1', floorId: 'f1', modelId: 'ac-1' },
          { id: 'i2', floorId: 'f1', modelId: 'gone' },
        ],
        airPurifiers: [],
        curtains: [],
        temperatureHumidity: [
          { id: 'l1', floorId: 'f1' },
          { id: 'l2', floorId: 'f1' },
        ],
      },
    },
    getItemList: () => [],
  }
  const climateProgress = kindConfigurationProgress(editorHost, 'climate')
  assert.equal(climateProgress.total, 2)
  assert.equal(climateProgress.configured, 1)
  assert.equal(climateProgress.missing, 1, '只有引用失效模型的条目算缺失')
  assert.equal(climateProgress.disabled, false)

  const purifierProgress = kindConfigurationProgress(editorHost, 'purifier')
  assert.equal(purifierProgress.total, 1)
  assert.equal(purifierProgress.configured, 0)
  assert.equal(purifierProgress.missing, 0, '别的类别的条目不能算进本类别缺失')

  const coverProgress = kindConfigurationProgress(editorHost, 'cover')
  assert.equal(coverProgress.disabled, true, '没有模型也没有条目 → 禁用入口')

  const labelProgress = kindConfigurationProgress(editorHost, 'temperature-humidity')
  assert.equal(labelProgress.requiresModel, false)
  assert.equal(labelProgress.configured, 2, '环境标签按已配置条目数统计')
  assert.equal(labelProgress.disabled, false)
})

/**
 * 「开窗器」配置段（0.8.9 上游「窗户动画」分区）。
 *
 * ## 为什么单独成文件
 *
 * 这一段同时管四件事：窗磁与开窗器的分工说明、动画来源（自动 / 开窗器 / 安防窗磁）、
 * 无回报时的估算动画与行程时间、以及只改模型不改目标的「最大显示开度」。它原来内联在
 * 面板总装函数里，分支让那个长函数越来越难读；抽出来以后新增开关不会再动总装。
 *
 * ## 与安防窗磁的关系（上游同口径）
 *
 * 同一扇窗只允许一个动画来源：开窗器有位置回报就按开窗器，没有就退回窗磁。
 * 所以分区首行必须说明「本层哪些窗扇已经在安防里配了窗磁」，否则用户会以为
 * 开窗器能独立确认关闭。
 */

/** 一条安防窗磁记录（只声明本段读到的字段）。 */
type WindowContactRecord = {
  floorId?: string
  label?: string
  contactEntityId?: string
}

/** 本段真正用到的宿主能力（窄接口，避免把整个编辑器上下文传进来）。 */
type WindowOpenerEditorHost = {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K]
  createButton: (label: string, onClick: () => unknown) => HTMLButtonElement
  structuredClone2: { environment?: { security?: { windows?: WindowContactRecord[] } } & Record<string, unknown> }
  /** 舞台下发的「预览开窗 / 关窗」动作；没有就禁用预览按钮。 */
  previewWindowMotion?: (itemId: string, opening: boolean) => unknown
}

/** 开窗器条目（只声明本段读写的字段）。 */
export type WindowOpenerItem = {
  id?: string
  floorId?: string
  motionSource?: string
  estimateMotion?: boolean
  travelSeconds?: number
  openPercent?: number
}

export type WindowOpenerSectionDeps = {
  editorHost: WindowOpenerEditorHost
  createConfigSection: (sectionTitle: string) => HTMLElement
  createConfigRow: (parentSectionElement: HTMLElement) => HTMLElement
  createSelectRow: (...args: unknown[]) => HTMLSelectElement
  createNumberRow: (...args: unknown[]) => HTMLInputElement
  refreshEditorPreview: (markChanged?: boolean) => unknown
  renderPanel: () => unknown
}

/** 本层已配置窗磁的窗扇（按楼层过滤；上游同口径）。 */
export function floorWindowContacts(
  environment: { security?: { windows?: WindowContactRecord[] } } | null | undefined,
  floorId: string,
): WindowContactRecord[] {
  return (environment?.security?.windows || []).filter(
    (contact) => contact.contactEntityId && (contact.floorId || '') === (floorId || ''),
  )
}

/** 首行说明：已有窗磁时列出名字，否则说明可以单用开窗器。 */
export function windowContactNote(contacts: ReadonlyArray<WindowContactRecord>): string {
  return contacts.length
    ? '已在安防配置窗磁：' +
        contacts.map((contact) => contact.label || contact.contactEntityId).join('、') +
        '。开窗器负责控制，窗磁保留监测，同一窗扇只使用一个动画来源。'
    : '可单独使用开窗器；需要独立确认开关时，可在安防中为此窗扇配置窗磁。'
}

/** 渲染「开窗器」分区，返回分区元素（总装用它继续挂后续内容）。 */
export function renderWindowOpenerSection(deps: WindowOpenerSectionDeps, item: WindowOpenerItem): HTMLElement {
  const { editorHost, createConfigSection, createConfigRow, createSelectRow, createNumberRow } = deps,
    sectionElement = createConfigSection('开窗器'),
    settingsRow = createConfigRow(sectionElement)
  sectionElement.append(
    editorHost.createElement(
      'p',
      'i3d-note',
      windowContactNote(floorWindowContacts(editorHost.structuredClone2.environment, String(item.floorId || ''))),
    ),
  )
  createSelectRow(
    settingsRow,
    '动画来源',
    [
      ['auto', '自动：有位置用开窗器，无位置用窗磁'],
      ['opener', '开窗器'],
      ['contact', '安防窗磁'],
    ],
    ['auto', 'opener', 'contact'].includes(String(item.motionSource)) ? item.motionSource : 'auto',
    (pickedMotionSource: unknown) => {
      item.motionSource = String(pickedMotionSource)
      deps.refreshEditorPreview()
      deps.renderPanel()
    },
  )
  appendEstimateMotionRow(deps, sectionElement, item)
  createNumberRow(
    settingsRow,
    '全行程时间（秒）',
    Number.isFinite(item.travelSeconds) ? item.travelSeconds : 20,
    5,
    180,
    1,
    (pickedTravelSeconds: unknown) => {
      item.travelSeconds = Number(pickedTravelSeconds)
      deps.refreshEditorPreview()
    },
  )
  createNumberRow(
    settingsRow,
    '最大显示开度（%）',
    Number.isFinite(item.openPercent) ? item.openPercent : 100,
    0,
    100,
    1,
    (pickedOpenPercent: unknown) => {
      item.openPercent = Number(pickedOpenPercent)
      deps.refreshEditorPreview()
    },
  )
  sectionElement.append(
    editorHost.createElement(
      'p',
      'i3d-note',
      '位置回报优先。行程时间只用于无回报时的动画估算；动画到位不代表窗户已关好。最大显示开度只调整模型，不改变发给设备的目标。',
    ),
  )
  sectionElement.append(...buildPreviewControls(deps, item))
  return sectionElement
}

/** 「无位置回报时显示估算动画」；选窗磁但本层没配窗磁时给出提示。 */
function appendEstimateMotionRow(
  deps: WindowOpenerSectionDeps,
  sectionElement: HTMLElement,
  item: WindowOpenerItem,
): void {
  const { editorHost, createConfigRow } = deps
  if (item.motionSource === 'contact') {
    const configuredContacts = floorWindowContacts(editorHost.structuredClone2.environment, String(item.floorId || ''))
    configuredContacts.length ||
      sectionElement.append(editorHost.createElement('p', 'i3d-note', '尚未配置窗磁，动画会保留当前姿态。'))
  }
  const estimateMotionRow = createConfigRow(sectionElement),
    estimateMotionInput = editorHost.createElement('input')
  estimateMotionInput.type = 'checkbox'
  estimateMotionInput.checked = item.estimateMotion !== false
  estimateMotionInput.onchange = () => {
    item.estimateMotion = estimateMotionInput.checked
    deps.refreshEditorPreview()
    deps.renderPanel()
  }
  estimateMotionRow.append(editorHost.createElement('span', '', '无位置回报时显示估算动画'), estimateMotionInput)
}

/** 预览开窗 / 关窗按钮；舞台没下发动作时禁用（只检查模型，不发指令）。 */
function buildPreviewControls(deps: WindowOpenerSectionDeps, item: WindowOpenerItem): HTMLElement[] {
  const { editorHost } = deps,
    previewRow = editorHost.createElement('div', 'i3d-security-grid i3d-lock-motion-grid')
  for (const [previewLabel, previewOpening] of [
    ['预览开窗', true],
    ['预览关窗', false],
  ] as [string, boolean][]) {
    const previewButton = editorHost.createButton(previewLabel, () =>
      editorHost.previewWindowMotion?.(String(item.id || ''), previewOpening),
    )
    previewButton.disabled = !editorHost.previewWindowMotion
    previewRow.append(previewButton)
  }
  return [previewRow, editorHost.createElement('p', 'i3d-note', '预览只检查模型动作，不发送设备指令。')]
}

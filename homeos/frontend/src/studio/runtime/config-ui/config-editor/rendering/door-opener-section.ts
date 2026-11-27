/**
 * 「开门器」配置段（0.9.0 环境 → 开门器）。
 *
 * ## 与开窗器的分工
 *
 * 开窗器的宿主是**窗扇**、实体是 `cover.*`；开门器的宿主是**户型里画的门**、实体是
 * `switch.*`。两者共用「控制 + 接触确认」这套心智，但开关语义不同：
 *
 * - **保持型**（默认）：`开 / 关` 各对应一次 `switch` 调用；
 * - **点动型**：脉冲触发、开关自动复位 —— 只能开门，且复位前禁止再发。
 *   所以点动型必须**隐藏「开门对应状态」**：这个概念在复位语义下不成立。
 *
 * ## 与门磁的关系
 *
 * 门磁负责**确认**门是否关上，开门器负责**控制**。两者可以同时绑在同一扇门上，
 * 但只有一套动画来源（`motionSource`）。首行说明要让用户知道「本层哪些门已经在
 * 安防里配了门磁」，否则会以为开门器能独立确认关闭。
 */

/** 一条安防门磁记录（只声明本段读到的字段）。 */
type DoorContactRecord = {
  floorId?: string
  label?: string
  doorEntityId?: string
  doorOpenEntityId?: string
  doorEventEntityId?: string
}

/** 本段真正用到的宿主能力（窄接口，避免把整个编辑器上下文传进来）。 */
export type DoorOpenerEditorHost = {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K]
  createButton: (label: string, onClick: () => unknown) => HTMLButtonElement
  structuredClone2: { environment?: { security?: { locks?: DoorContactRecord[] } } & Record<string, unknown> }
  /** 舞台下发的「预览开 / 关」动作；没有就禁用预览按钮。 */
  previewDoorMotion?: (itemId: string, opening: boolean) => unknown
}

/** 开门器条目（只声明本段读写的字段）。 */
export type DoorOpenerItem = {
  id?: string
  floorId?: string
  entityId?: string
  switchMode?: string
  switchOpenState?: string
  travelSeconds?: number
  openPercent?: number
  motionSource?: string
  estimateMotion?: boolean
}

export type DoorOpenerSectionDeps = {
  editorHost: DoorOpenerEditorHost
  createConfigSection: (sectionTitle: string) => HTMLElement
  createConfigRow: (parentSectionElement: HTMLElement) => HTMLElement
  createSelectRow: (...args: unknown[]) => HTMLSelectElement
  createNumberRow: (...args: unknown[]) => HTMLInputElement
  refreshEditorPreview: (markChanged?: boolean) => unknown
  renderPanel: () => unknown
}

/** 本层已配置门磁的门（按楼层过滤；与安防 `security.locks` 同口径）。 */
export function floorDoorContacts(
  environment: { security?: { locks?: DoorContactRecord[] } } | null | undefined,
  floorId: string,
): DoorContactRecord[] {
  return (environment?.security?.locks || []).filter(
    (contact) =>
      (contact.doorEntityId || contact.doorOpenEntityId || contact.doorEventEntityId) &&
      (contact.floorId || '') === (floorId || ''),
  )
}

/** 门磁记录的展示名：优先 label，其次任一实体 id。 */
export function doorContactLabel(contact: DoorContactRecord): string {
  return contact.label || contact.doorEntityId || contact.doorOpenEntityId || contact.doorEventEntityId || ''
}

/** 首行说明：已有门磁时列出名字，否则说明可以单用开门器。 */
export function doorContactNote(contacts: ReadonlyArray<DoorContactRecord>): string {
  return contacts.length
    ? '已在安防配置门磁：' + contacts.map(doorContactLabel).join('、') + '。开门器负责控制，同一模型使用一路动画反馈。'
    : '可单独使用开门器；需要独立确认开关时，可在安防中为此门配置门磁。'
}

/** 开关方式的说明文案（第二行提示，随模式变化）。 */
export function doorSwitchModeNote(switchMode: string): string {
  return switchMode === 'momentary'
    ? '触发门机后，由设备自动复位开关。点动型只用于开门，等待复位期间不能再次触发。'
    : '门扇跟随安防门磁回报。配置门磁后可以确认门是否已关上。'
}

/** 该绑定是否 `cover` 域（此时没有「开关方式」可选）。 */
export function isCoverDoorOpener(entityId: unknown): boolean {
  return typeof entityId === 'string' && entityId.startsWith('cover.')
}

/** 归一化开关方式（未知值按保持型，与后端默认一致）。 */
export function normalizeDoorSwitchMode(switchMode: unknown): 'maintained' | 'momentary' {
  return switchMode === 'momentary' ? 'momentary' : 'maintained'
}

/**
 * 渲染「开门器」分区，返回分区元素。
 *
 * 顺序刻意与开窗器一致（说明 → 动画来源 → 估算 → 行程 → 开度 → 预览），
 * 只在「点动型」这一档上分叉：那档不显示「开门对应状态」。
 */
export function renderDoorOpenerSection(deps: DoorOpenerSectionDeps, item: DoorOpenerItem): HTMLElement {
  const { editorHost, createConfigSection, createConfigRow, createSelectRow, createNumberRow } = deps,
    sectionElement = createConfigSection('开门器'),
    settingsRow = createConfigRow(sectionElement),
    switchMode = normalizeDoorSwitchMode(item.switchMode)
  sectionElement.append(
    editorHost.createElement(
      'p',
      'i3d-note',
      doorContactNote(floorDoorContacts(editorHost.structuredClone2.environment, String(item.floorId || ''))),
    ),
  )
  // 开关动作：方式 + 极性。点动型隐藏极性（复位语义下不成立）。
  // `cover` 域的门机自己带行程，没有「开关方式」这一档 —— 与上游「绑定 cover 或 switch 实体」同口径。
  const switchRow = createConfigRow(sectionElement),
    isCoverDoor = isCoverDoorOpener(item.entityId)
  if (isCoverDoor)
    sectionElement.append(
      editorHost.createElement('p', 'i3d-note', '当前绑定的是 cover 实体：按行程直接开合，不需要设置开关方式。'),
    )
  else {
    createSelectRow(
      switchRow,
      '开关方式',
      [
        ['maintained', '保持型：开和关分别控制门'],
        ['momentary', '点动型：开关自动复位'],
      ],
      switchMode,
      (pickedSwitchMode: unknown) => {
        const nextMode = normalizeDoorSwitchMode(pickedSwitchMode)
        item.switchMode = nextMode
        // 切到点动型要清掉极性字段：留着会让后端校验直接 422。
        nextMode === 'momentary' && delete item.switchOpenState
        deps.refreshEditorPreview()
        deps.renderPanel()
      },
    )
    if (switchMode === 'momentary')
      sectionElement.append(editorHost.createElement('p', 'i3d-note', doorSwitchModeNote('momentary')))
    else
      createSelectRow(
        switchRow,
        '开门对应状态',
        [
          ['on', '开启（on）'],
          ['off', '关闭（off）'],
        ],
        item.switchOpenState === 'off' ? 'off' : 'on',
        (pickedOpenState: unknown) => {
          item.switchOpenState = pickedOpenState === 'off' ? 'off' : 'on'
          deps.refreshEditorPreview()
        },
      )
  }
  // 动画来源：自动优先有位置回报的一路（与开窗器同口径）。
  createSelectRow(
    settingsRow,
    '动画来源',
    [
      ['auto', '自动：有位置用开门器，无位置用门磁'],
      ['opener', '开门器'],
      ['contact', '安防门磁'],
    ],
    ['auto', 'opener', 'contact'].includes(String(item.motionSource)) ? item.motionSource : 'auto',
    (pickedMotionSource: unknown) => {
      item.motionSource = String(pickedMotionSource)
      deps.refreshEditorPreview()
      deps.renderPanel()
    },
  )
  appendEstimateMotionRow(deps, sectionElement, item, switchMode)
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
      '全行程时间用于估算动画。设备回报用于确认实际位置。最大显示开度只调整模型，不改变发给设备的目标。',
    ),
  )
  sectionElement.append(...buildPreviewControls(deps, item))
  return sectionElement
}

/** 「无位置回报时显示估算动画」；选门磁但本层没配门磁时给出提示。 */
function appendEstimateMotionRow(
  deps: DoorOpenerSectionDeps,
  sectionElement: HTMLElement,
  item: DoorOpenerItem,
  switchMode: string,
): void {
  const { editorHost, createConfigRow } = deps
  if (item.motionSource === 'contact') {
    const configuredContacts = floorDoorContacts(editorHost.structuredClone2.environment, String(item.floorId || ''))
    configuredContacts.length ||
      sectionElement.append(editorHost.createElement('p', 'i3d-note', '尚未配置门磁，动画会保留当前姿态。'))
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
  // 点动型在这里补一句：用户最容易误以为「能开就能关」。
  switchMode === 'momentary' &&
    estimateMotionRow.append(editorHost.createElement('small', '', ' 点动型只发脉冲，关门需等复位后重新触发。'))
}

/** 预览开 / 关按钮；舞台没下发动作时禁用（只检查模型，不发指令）。 */
function buildPreviewControls(deps: DoorOpenerSectionDeps, item: DoorOpenerItem): HTMLElement[] {
  const { editorHost } = deps,
    previewRow = editorHost.createElement('div', 'i3d-security-grid i3d-lock-motion-grid')
  for (const [previewLabel, previewOpening] of [
    ['预览开门', true],
    ['预览关门', false],
  ] as [string, boolean][]) {
    const previewButton = editorHost.createButton(previewLabel, () =>
      editorHost.previewDoorMotion?.(String(item.id || ''), previewOpening),
    )
    previewButton.disabled = !editorHost.previewDoorMotion
    previewRow.append(previewButton)
  }
  return [previewRow, editorHost.createElement('p', 'i3d-note', '预览只检查模型动作，不发送设备指令。')]
}

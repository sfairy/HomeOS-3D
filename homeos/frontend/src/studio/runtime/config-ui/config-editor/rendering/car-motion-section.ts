/**
 * 车辆「在家 / 离家」与「四门两舱」的配置段（0.9.0）。
 *
 * ## 为什么要有「状态值」这一层
 *
 * `person` / `device_tracker` 回报的是 `home` / `not_home`，`input_select`
 * 更是任意文案；用户只能枚举「哪些算在家」。留空时按 0.9.0 的内置词表自动识别
 * （`在家` / `at home` / `home` …），这是绝大多数用户的用法；只有填了才逐值精确匹配。
 *
 * ## 0.9.0 的 DOM 结构（实测）
 *
 * 「车辆状态」「车辆开合」两个 `section` 里，每个可折叠项都是一条
 * `<details class="i3d-vehicle-state" data-vehicle-state="…">`：
 *
 * ```html
 * <details class="i3d-vehicle-state" data-vehicle-state="presence">
 *   <summary>车辆在家 / 离家（可选）</summary>
 *   <div class="i3d-vehicle-state-body">
 *     <label><span>在家 / 离家实体</span>…</label>
 *     <div class="i3d-vehicle-state-fields">
 *       <div class="i3d-vehicle-state-field"><label>在家的状态值</label><textarea/><button class="i3d-vehicle-state-use-current">…</button></div>
 *     </div>
 *     <dl class="i3d-vehicle-state-reading"><div><dt>HA 当前值：</dt><dd>…</dd></div></dl>
 *     <p class="i3d-note">…</p>
 *   </div>
 * </details>
 * ```
 *
 * 这些类名不是装饰：0.9.0 的 22 条 `.i3d-vehicle-state*` 样式全部挂在它们上面，
 * 少了任何一个都会退回默认排版（行距、折叠标题、读数框全都不一样）。
 */

/** 在家/离家的状态组键。 */
export const CAR_PRESENCE_KEYS = ['home', 'away'] as const

/** 每组最多 16 个状态值（后端同值）。 */
export const CAR_STATE_MAX_PER_GROUP = 16

/** 单个状态值最长 255 字符（后端同值）。 */
export const CAR_STATE_MAX_LENGTH = 255

/** 六个开合件的展示名（顺序即面板顺序）。 */
export const CAR_OPENING_PART_LABELS: ReadonlyArray<readonly [CarOpeningPart, string]> = Object.freeze([
  ['leftFront', '左前门'],
  ['leftRear', '左后门'],
  ['rightFront', '右前门'],
  ['rightRear', '右后门'],
  ['hood', '前备箱'],
  ['tail', '后备箱'],
] as const)

export type CarOpeningPart = 'leftFront' | 'leftRear' | 'rightFront' | 'rightRear' | 'hood' | 'tail'

/** 把多行文本切成状态数组：逐行 trim、丢空行、去重、截到上限。 */
export function parseCarStateLines(rawText: string): string[] {
  const seen = new Set<string>(),
    parsedStates: string[] = []
  for (const lineText of String(rawText || '').split(/\r?\n/)) {
    const trimmedState = lineText.trim()
    if (!trimmedState || seen.has(trimmedState)) continue
    seen.add(trimmedState)
    parsedStates.push(trimmedState)
    if (parsedStates.length >= CAR_STATE_MAX_PER_GROUP) break
  }
  return parsedStates
}

/** 状态数组 → 多行文本（供输入框回填）。 */
export function formatCarStateLines(stateList: ReadonlyArray<string> | undefined): string {
  return (stateList || []).join('\n')
}

/** 该组是否「填了东西」（用于提示「留空自动识别」）。 */
export function hasCarStateValues(stateList: ReadonlyArray<string> | undefined): boolean {
  return !!stateList?.length
}

/**
 * 两组状态值的提示文案。
 *
 * 必须写清三件事：留空的含义、当前识别到什么、以及自动识别的词表是什么 ——
 * 只说「留空自动识别」时，用户不知道 `not_home` 到底算不算离家。
 */
export function carPresenceHint(
  homeStates: ReadonlyArray<string> | undefined,
  awayStates: ReadonlyArray<string> | undefined,
  rawState: string,
  matchedHome: boolean | null,
): string {
  if (!hasCarStateValues(homeStates) && !hasCarStateValues(awayStates))
    return (
      '两项都留空 = 自动识别：在家匹配「在家 / 在家里 / Home / at home」，' +
      '离家匹配「离家 / Away / not home」，跟踪器按 home / not_home。' +
      (rawState ? '当前识别：' + (matchedHome === null ? '未匹配' : matchedHome ? '在家' : '离家') + '。' : '')
    )
  return rawState
    ? '按填写的原始值完整匹配，每行一个。未列出的状态显示未知。当前原始状态：' +
        rawState +
        '，识别为' +
        (matchedHome === null ? '未匹配' : matchedHome ? '在家' : '离家') +
        '。'
    : '按填写的原始值完整匹配，每行一个。当前原始状态：尚未取得。'
}

/** 开合件的提示文案（未匹配时明确说「不动作」）。 */
export function carOpeningHint(rawState: string, isOpen: boolean | null): string {
  if (!rawState) return '留空 = 自动识别门 / 车库门 / 窗口类传感器的开合。'
  return (
    '当前原始状态：' +
    rawState +
    '，识别为' +
    (isOpen === null ? '未匹配（不会动作）' : isOpen ? '打开' : '关闭') +
    '。'
  )
}

/** 更换 / 解绑车辆设备时的清空提示（0.9.0 原文）。 */
export const CAR_REBIND_WARNING =
  '更换或解绑设备将清空车辆状态、在家 / 离家、胎压和原设备附加功能绑定，胎压样式保留。其他关联设备的弹窗功能保留。取消保留原配置，保存后生效。'

/** 开合件未配置时的说明。 */
export const CAR_OPENING_EMPTY_NOTE = '未配置的开合件不动作。只有轿车与 SUV 有可开合的四门两舱；电瓶车不支持。'

/** 本段真正用到的宿主能力（窄接口）。 */
export type CarMotionSectionDeps = {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K]
  createConfigSection: (sectionTitle: string) => HTMLElement
  createConfigRow: (parentSectionElement: HTMLElement) => HTMLElement
  createSelectRow: (...args: unknown[]) => HTMLSelectElement
  createSettingRow: (rowContainer: any, rowLabel: any, rowControl: any) => any
  /** 该设备目录下的实体（已按 deviceId 过滤）。 */
  entityCatalog: ReadonlyArray<{ entityId: string; name?: string; enabled?: boolean; status?: string }>
  /** 当前车辆配置（就地修改，与同文件其它段一致）。 */
  item: Record<string, any>
  /** 读取当前实体状态，用于「当前识别」提示。 */
  readEntityState: (entityId: string) => any
  /** 舞台下发的「预览开 / 关」；没有就禁用预览按钮（只动模型、不发指令）。 */
  previewCarOpening?: (part: string, opening: boolean) => unknown
  refreshEditorPreview: (markChanged?: boolean) => unknown
  renderPanel: () => unknown
}

/** 车辆实体候选：只保留允许域，附带「失效但仍绑定」的兜底项。 */
function carEntityOptions(deps: CarMotionSectionDeps, domains: readonly string[], boundEntityId: string) {
  const entityOptions = deps.entityCatalog
    .filter(
      (entityProbe) =>
        domains.includes(entityProbe.entityId.split('.')[0]) &&
        entityProbe.enabled !== false &&
        !['missing', 'disabled'].includes(String(entityProbe.status)),
    )
    .map((entityOptionEntry) => [
      entityOptionEntry.entityId,
      (entityOptionEntry.name || entityOptionEntry.entityId) + ' · ' + entityOptionEntry.entityId,
    ]) as Array<[string, string]>
  // 已绑定但不在当前目录里（换了设备 / 实体被禁用）：插在「未绑定」之后，让用户能看见并清除。
  boundEntityId &&
    !entityOptions.some(([optionEntityId]) => optionEntityId === boundEntityId) &&
    entityOptions.splice(1, 0, [boundEntityId, boundEntityId + '（失效或不属于当前设备）'])
  return [['', '未绑定'], ...entityOptions] as Array<[string, string]>
}

/** 实体在目录里的显示名（没有就退回实体 id）。 */
function entityDisplayName(deps: CarMotionSectionDeps, entityId: string): string {
  const catalogEntry = deps.entityCatalog.find((probe) => probe.entityId === entityId)
  return catalogEntry?.name || entityId
}

/** 当前实体原始状态（统一成去空白的字符串）。 */
function readRawState(deps: CarMotionSectionDeps, entityId: string): string {
  return String(deps.readEntityState(entityId)?.state ?? '').trim()
}

/**
 * 一条「状态值」输入（0.9.0 `.i3d-vehicle-state-field`）。
 *
 * 多行文本 + 右上角的「把当前值加入」：把手头看到的 HA 原始值一键拼进去，
 * 比让用户回 HA 抄一遍再手打安全得多（拼错一个字符就是「未匹配」）。
 */
function createStateValueField(
  deps: CarMotionSectionDeps,
  {
    label,
    stateList,
    entityId,
    onCommit,
  }: { label: string; stateList: string[] | undefined; entityId: string; onCommit: (parsedStates: string[]) => void },
): HTMLElement {
  const fieldElement = deps.createElement('div', 'i3d-vehicle-state-field'),
    textareaElement = deps.createElement('textarea')
  textareaElement.setAttribute('aria-label', label)
  textareaElement.setAttribute('placeholder', '每行一个，例如：在家')
  textareaElement.maxLength = CAR_STATE_MAX_PER_GROUP * (CAR_STATE_MAX_LENGTH + 1)
  textareaElement.value = formatCarStateLines(stateList)
  textareaElement.addEventListener('input', () => onCommit(parseCarStateLines(textareaElement.value)))
  const useCurrentButton = deps.createElement('button', 'i3d-vehicle-state-use-current', '把当前值加入')
  useCurrentButton.type = 'button'
  useCurrentButton.disabled = !entityId
  useCurrentButton.addEventListener('click', () => {
    const rawState = readRawState(deps, entityId)
    if (!rawState) return
    const nextStates = parseCarStateLines(textareaElement.value + '\n' + rawState)
    textareaElement.value = formatCarStateLines(nextStates)
    onCommit(nextStates)
  })
  fieldElement.append(deps.createElement('label', '', label), textareaElement, useCurrentButton)
  return fieldElement
}

/** 读数框（0.9.0 `.i3d-vehicle-state-reading`）：`dt` 是标签、`dd` 是值。 */
function createReadingList(deps: CarMotionSectionDeps, entries: ReadonlyArray<readonly [string, string]>): HTMLElement {
  const readingList = deps.createElement('dl', 'i3d-vehicle-state-reading')
  for (const [readingLabel, readingValue] of entries) {
    const rowElement = deps.createElement('div')
    rowElement.append(deps.createElement('dt', '', readingLabel), deps.createElement('dd', '', readingValue))
    readingList.append(rowElement)
  }
  return readingList
}

/** 一条可折叠的车辆配置块（`details.i3d-vehicle-state`）。 */
function createVehicleStateBlock(
  deps: CarMotionSectionDeps,
  stateKey: string,
  summaryText: string,
  children: readonly HTMLElement[],
  isOpen = false,
  boundLabel = '',
): HTMLElement {
  const detailsElement = deps.createElement('details', 'i3d-vehicle-state'),
    bodyElement = deps.createElement('div', 'i3d-vehicle-state-body'),
    summaryElement = deps.createElement('summary', '', summaryText)
  // 折叠标题右侧显示已绑定实体的名字（0.9.0 的 `.i3d-vehicle-state-bound`）：
  // 六个开合件的标题都只写「左前门」，不显示绑了谁，展开前无法确认是否配错。
  if (boundLabel) summaryElement.append(deps.createElement('span', 'i3d-vehicle-state-bound', ' · ' + boundLabel))
  detailsElement.dataset.vehicleState = stateKey
  detailsElement.open = isOpen
  detailsElement.append(summaryElement)
  bodyElement.append(...children)
  detailsElement.append(bodyElement)
  return detailsElement
}

/**
 * 「车辆在家 / 离家」块（0.9.0 `data-vehicle-state="presence"`）。
 *
 * 由 `panel-assembly` 追加进「车辆状态」分区（与「车辆充电」同级），
 * 不单独成一个分区 —— 0.9.0 实测就是这么排的。
 */
export function renderCarPresenceBlock(deps: CarMotionSectionDeps): HTMLElement {
  const { item } = deps,
    entityRow = deps.createConfigRow(
      // 临时容器只是为了复用「一行一个控件」的排版；下面会被搬进 details body。
      deps.createElement('div', 'i3d-vehicle-state-fields'),
    ),
    presenceEntityId = String(item.presenceEntityId || '')
  deps.createSelectRow(
    entityRow,
    '在家 / 离家实体',
    carEntityOptions(
      deps,
      ['person', 'device_tracker', 'binary_sensor', 'input_select', 'input_text'],
      presenceEntityId,
    ),
    presenceEntityId,
    (pickedPresenceEntityId: unknown) => {
      const nextEntityId = String(pickedPresenceEntityId || '')
      item.presenceEntityId = nextEntityId
      // 换实体 / 解绑：两组状态值都属于旧实体，必须一起清掉。
      nextEntityId
        ? item.presenceStates || (item.presenceStates = { home: [], away: [] })
        : (delete item.presenceStates, delete item.presenceEntityId)
      deps.refreshEditorPreview()
      deps.renderPanel()
    },
  )
  const entityFieldElement = entityRow.firstElementChild as HTMLElement | null,
    bodyChildren: HTMLElement[] = []
  entityFieldElement && bodyChildren.push(entityFieldElement)

  if (presenceEntityId) {
    const stateGroups = (item.presenceStates ||= { home: [], away: [] }),
      fieldsElement = deps.createElement('div', 'i3d-vehicle-state-fields')
    for (const [groupKey, groupLabel] of [
      ['home', '在家的状态值'],
      ['away', '离家的状态值'],
    ] as const) {
      fieldsElement.append(
        createStateValueField(deps, {
          label: groupLabel,
          stateList: stateGroups[groupKey],
          entityId: presenceEntityId,
          onCommit: (parsedStates) => {
            stateGroups[groupKey] = parsedStates
            // 两组都空时删对象：文档更小，且后端把「缺字段」当自动识别。
            !stateGroups.home?.length && !stateGroups.away?.length
              ? delete item.presenceStates
              : (item.presenceStates = stateGroups)
            deps.refreshEditorPreview()
            // 读数框要跟着原始状态变，重绘是最省事且不会漏的一步。
            deps.renderPanel()
          },
        }),
      )
    }
    bodyChildren.push(fieldsElement)

    const rawState = readRawState(deps, presenceEntityId),
      matchedHome = !rawState
        ? null
        : ['在家', '在家里', 'home', 'at home'].includes(rawState.toLowerCase())
          ? true
          : ['离家', 'away', 'not home', 'not_home'].includes(rawState.toLowerCase())
            ? false
            : null
    bodyChildren.push(
      createReadingList(deps, [
        ['HA 当前值：', rawState || '尚未取得'],
        ['自动识别为', matchedHome === null ? '未识别' : matchedHome ? '在家' : '离家'],
      ]),
      deps.createElement(
        'p',
        'i3d-note',
        carPresenceHint(item.presenceStates?.home, item.presenceStates?.away, rawState, matchedHome),
      ),
    )
  } else {
    bodyChildren.push(
      deps.createElement(
        'p',
        'i3d-note',
        '绑定一个能表示车在不在家的实体：位置跟踪、人体传感器或状态选择器都可以。留空则不启用驶离动画。',
      ),
    )
  }

  return createVehicleStateBlock(
    deps,
    'presence',
    '车辆在家 / 离家（可选）',
    bodyChildren,
    !!presenceEntityId,
    presenceEntityId ? entityDisplayName(deps, presenceEntityId) : '',
  )
}

/**
 * 「车辆开合」分区：六条 `details.i3d-vehicle-state`（`data-vehicle-state` = 件名）。
 *
 * 每条的 body 是「状态实体 + 预览打开 / 预览关闭」；预览只动模型、不发指令。
 */
export function renderCarOpeningSection(deps: CarMotionSectionDeps): HTMLElement {
  const sectionElement = deps.createConfigSection('车辆开合'),
    openings = (deps.item.openings ||= {})
  sectionElement.append(deps.createElement('p', 'i3d-note', CAR_OPENING_EMPTY_NOTE))
  for (const [openingPartKey, openingPartLabel] of CAR_OPENING_PART_LABELS) {
    const partConfig = (openings[openingPartKey] ||= {}),
      partEntityId = String(partConfig.openingEntityId || ''),
      entityRow = deps.createConfigRow(deps.createElement('div', 'i3d-vehicle-state-fields'))
    deps.createSelectRow(
      entityRow,
      openingPartLabel + '状态实体',
      carEntityOptions(deps, ['binary_sensor', 'sensor', 'input_select', 'input_boolean'], partEntityId),
      partEntityId,
      (pickedOpeningEntityId: unknown) => {
        const nextEntityId = String(pickedOpeningEntityId || '')
        nextEntityId
          ? ((partConfig.openingEntityId = nextEntityId), (partConfig.states ||= { open: [], closed: [] }))
          : // 解绑：整件删掉，避免留下「有 states 没实体」的非法配置（后端会 422）。
            delete openings[openingPartKey]
        Object.keys(openings).length ? (deps.item.openings = openings) : delete deps.item.openings
        deps.refreshEditorPreview()
        deps.renderPanel()
      },
    )
    const bodyChildren: HTMLElement[] = []
    const entityFieldElement = entityRow.firstElementChild as HTMLElement | null,
      partStates = partConfig.states
    entityFieldElement && bodyChildren.push(entityFieldElement)

    if (partEntityId && partStates) {
      const fieldsElement = deps.createElement('div', 'i3d-vehicle-state-fields')
      for (const [groupKey, groupLabel] of [
        ['open', '打开的状态值'],
        ['closed', '关闭的状态值'],
      ] as const) {
        fieldsElement.append(
          createStateValueField(deps, {
            label: groupLabel,
            stateList: partStates[groupKey],
            entityId: partEntityId,
            onCommit: (parsedStates) => {
              partStates[groupKey] = parsedStates
              deps.refreshEditorPreview()
              deps.renderPanel()
            },
          }),
        )
      }
      bodyChildren.push(fieldsElement)
      const rawState = readRawState(deps, partEntityId),
        isOpen = !rawState
          ? null
          : ['打开', '已打开', '开启', '已开启', 'open', 'on'].includes(rawState.toLowerCase())
            ? true
            : ['关闭', '已关闭', 'close', 'closed', 'off'].includes(rawState.toLowerCase())
              ? false
              : null
      bodyChildren.push(
        createReadingList(deps, [
          ['HA 当前值：', rawState || '尚未取得'],
          ['自动识别为', isOpen === null ? '未识别' : isOpen ? '打开' : '关闭'],
        ]),
        deps.createElement('p', 'i3d-note', carOpeningHint(rawState, isOpen)),
      )
    }

    const previewRow = deps.createElement('div', 'i3d-config-row')
    for (const [previewLabel, previewOpening] of [
      ['预览打开', true],
      ['预览关闭', false],
    ] as [string, boolean][]) {
      const previewButton = deps.createElement('button', '', previewLabel)
      previewButton.type = 'button'
      previewButton.disabled = !deps.previewCarOpening || !partEntityId
      previewButton.addEventListener('click', () => deps.previewCarOpening?.(openingPartKey, previewOpening))
      previewRow.append(previewButton)
    }
    bodyChildren.push(previewRow)
    sectionElement.append(
      createVehicleStateBlock(
        deps,
        openingPartKey,
        openingPartLabel,
        bodyChildren,
        !!partEntityId,
        partEntityId ? entityDisplayName(deps, partEntityId) : '',
      ),
    )
  }
  return sectionElement
}

/**
 * 兼容入口：返回 `[在家 / 离家块, 车辆开合分区]`。
 *
 * 调用方要么按 0.9.0 的顺序把块塞进「车辆状态」分区（推荐，`panel-assembly` 就是
 * 这么做的），要么整体 append；两种都不会漏样式。
 */
export function renderCarMotionSections(deps: CarMotionSectionDeps): HTMLElement[] {
  return [renderCarPresenceBlock(deps), renderCarOpeningSection(deps)]
}

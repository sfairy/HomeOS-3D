/**
 * 「附加功能」分区（上游 0.8.9 `mountExtraSourcesEditor`）。
 *
 * ## 结构（与上游逐字同构）
 *
 * ```
 * 附加功能
 *   [实时预览弹窗] [添加关联设备]          ← 同一行（.i3d-config-row）
 *   添加设备后勾选弹窗内容，设备和实体数量不限。关联设备不改变模型的主控、动画或指示灯。
 *   <details class="i3d-extra-chooser">
 *     <summary>选择附加功能（已选 N 项）</summary>
 *     <input placeholder="搜索已添加设备的实体名称或 ID" aria-label="搜索附加实体">
 *     <div class="i3d-extra-source-groups">
 *       <details class="i3d-extra-source">   ← 每台设备一份（主设备 + 关联设备 + 原设备暂不可用）
 *         <summary>设备名（当前设备） · 已选 N 项</summary>
 *         [<div class="i3d-extra-source-actions">移除设备 …</div>]   ← 主设备没有
 *         <div class="i3d-extra-entity-list">实体行…</div>
 *         [<div class="i3d-extra-pages">上一页 x / y · N 项 下一页</div>]
 *       </details>
 *     </div>
 *   </details>
 * ```
 *
 * ## 为什么按设备分组而不是一个平铺清单
 *
 * 一台舞台设备可以挂多台 HA 设备的实体（关联设备）。平铺清单里「这条实体属于哪台设备」
 * 只靠一行小字，勾错就要回关联设备里翻；上游按设备折成 `<details>`，并把「移除设备」
 * 放在同一个分组里，语义一目了然。
 *
 * ## 分页
 *
 * 上游每台设备独立分页（40 条 / 页）。一个 NAS 或电视能带出上百个实体，不分页会把整个
 * 配置面板撑到几千像素高。
 */

import { extraLabels, extraTypes, purifierRelatedEntities } from '../../../climate/climate'
import { removeExtraDevice, selectableExtraEntity } from '../../../device/device'
import { deviceEntityCatalog } from '../../device-entity-config'

/** 每页实体数（上游 `0x28`）。 */
const EXTRA_PAGE_SIZE = 40

/** 一条关联设备记录。 */
export type ExtraSourceDevice = {
  deviceId: string
  deviceName?: string
  /** 主设备（条目绑定的那台）：没有「移除设备」。 */
  primary?: boolean
}

/** 一条附加功能记录。 */
export type ExtraControlRecord = {
  entityId?: string
  type?: string
  label?: string
  sourceDeviceId?: string
}

/** 实体目录条目（只声明本段读到的字段）。 */
type EntityEntry = {
  entityId: string
  name?: string
  deviceId?: string
  device_id?: string
  disabledBy?: unknown
  disabled_by?: unknown
  enabled?: boolean
  status?: string
  sourceMissing?: boolean
  sourceDeviceId?: string
}

/** 本段真正用到的宿主能力（窄接口）。 */
export type ExtraSourcesEditorHost = {
  createElement: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ) => HTMLElementTagNameMap[K]
  createButton: (label: string, onClick: () => unknown) => HTMLButtonElement
  isDisposed: boolean
  isAccessAllowed: boolean
  pickerGeneration: number
  pickerHandle: { close?: () => void } | null
  errorMessageElement: { textContent: string }
  entities: ReadonlyArray<EntityEntry>
  latestStates?: Record<string, unknown> | null
  states?: ({ get?: (entityId: string) => unknown } & Record<string, unknown>) | null
  editorRuntime?: { focusCommand?: (command: string, itemId?: string) => Promise<unknown> }
  pickers?: {
    device?: (
      options: Record<string, unknown>,
    ) => Promise<{ close?: () => void } | null | undefined> | { close?: () => void } | null | undefined
  }
}

/** 舞台条目：只声明本段读写的字段。 */
export type ExtraSourcesItem = {
  id?: string
  entityId?: string
  mainEntityId?: string
  deviceId?: string
  extraDevices?: ExtraSourceDevice[]
  extraControls?: ExtraControlRecord[]
}

export type ExtraSourcesSectionOptions = {
  editorHost: ExtraSourcesEditorHost
  createConfigSection: (sectionTitle: string) => HTMLElement
  item: ExtraSourcesItem
  /** 主设备 id；空表示条目还没有设备归属。 */
  primaryDeviceId: string
  /** `true`：按「主设备 + 关联设备」分桶；`false`：净化器的关联实体。 */
  usesDeviceCatalog: boolean
  refreshEditorPreview: () => void
  renderPanel: () => void
  /** 勾选变化后的联动（浴霸出风 / 净化器气流 / 喷雾 / 油烟机）。 */
  onExtraControlChanged: (removedEntityId: string | null) => void
}

/** 渲染过的实体行（状态刷新只改这些节点，不重建 DOM）。 */
type RenderedEntity = {
  entity: EntityEntry
  stateLine: HTMLElement
  type: string
}

/** 一组渲染状态（`createSourceGroup` 与分页共用）。 */
type GroupState = {
  rendered: RenderedEntity[]
  pageByDevice: Map<string, number>
  openSet: Set<string>
  rerender: () => void
  refreshSummary: () => void
  query: () => string
}

const isDisabledEntity = (entity: EntityEntry): boolean =>
  !!(
    entity.disabledBy ||
    entity.disabled_by ||
    entity.enabled === false ||
    ['disabled', 'missing'].includes(String(entity.status || ''))
  )

/** 实体当前状态（兼容「状态中枢 Map」与「普通对象」两种来源）。 */
function stateOf(host: ExtraSourcesEditorHost, entityId: string): Record<string, unknown> | undefined {
  const raw = host.latestStates?.[entityId] || host.states?.get?.(entityId) || host.states?.[entityId]
  if (!raw || typeof raw !== 'object') return undefined
  const snapshot = (raw as { newState?: unknown }).newState
  return (snapshot || raw) as Record<string, unknown>
}

/** 状态行文字：可用实体给「域 · 状态」，失效条目给专门说明。 */
function entityStateText(host: ExtraSourcesEditorHost, entity: EntityEntry, type: string): string {
  if (isDisabledEntity(entity)) return entity.sourceMissing ? '实体已移除或归属已改变，可取消选择' : '已禁用或移除'
  const snapshot = stateOf(host, entity.entityId),
    unavailable = snapshot?.available === false || snapshot?.state === 'unavailable'
  return (
    String((extraLabels as Record<string, string>)[type] || '') +
    ' · ' +
    (unavailable ? '不可用' : String(snapshot?.state || '暂无状态'))
  )
}

/** 可用按钮类实体：状态行没有信息量（上游直接隐藏）。 */
function isStateLineHidden(host: ExtraSourcesEditorHost, entity: EntityEntry, type: string): boolean {
  if (isDisabledEntity(entity) || type !== 'button') return false
  const snapshot = stateOf(host, entity.entityId)
  return snapshot?.available !== false && snapshot?.state !== 'unavailable'
}

/** 一条附加功能归属哪台设备：显式 `sourceDeviceId` 优先，否则算主设备的。 */
function sourceDeviceOf(control: ExtraControlRecord, primaryDeviceId: string): string {
  return control.sourceDeviceId || primaryDeviceId || ''
}

/** 设备清单：主设备 → 关联设备 → （有孤儿条目时）「原设备暂不可用」。 */
export function buildExtraSourceList(options: ExtraSourcesSectionOptions): ExtraSourceDevice[] {
  const { item, primaryDeviceId } = options,
    linkedDevices = Array.isArray(item.extraDevices) ? item.extraDevices : [],
    list: ExtraSourceDevice[] = []
  if (primaryDeviceId) list.push({ deviceId: primaryDeviceId, primary: true })
  for (const device of linkedDevices)
    if (device.deviceId && device.deviceId !== primaryDeviceId) list.push({ ...device, primary: false })
  const extraControls = item.extraControls || [],
    hasOrphanControl = extraControls.some(
      (control) => !list.some((device) => device.deviceId === sourceDeviceOf(control, primaryDeviceId)),
    )
  if (hasOrphanControl || (!list.length && extraControls.length))
    list.push({ deviceId: '', deviceName: '原设备暂不可用', primary: true })
  return list
}

/** 某台设备可勾选的实体（已排除主实体与条目自身）。 */
export function entitiesForDevice(options: ExtraSourcesSectionOptions, deviceId: string): EntityEntry[] {
  const { item, editorHost, primaryDeviceId } = options,
    catalog = primaryDeviceId
      ? options.usesDeviceCatalog
        ? deviceEntityCatalog(
            editorHost.entities as never[],
            deviceId || primaryDeviceId,
            (editorHost.latestStates || editorHost.states || new Map()) as never,
          )
        : purifierRelatedEntities(editorHost.entities as never[], item.entityId || '')
      : [],
    isLinkedDevice = !!deviceId && deviceId !== primaryDeviceId
  return (catalog as EntityEntry[]).filter(
    (entity) =>
      entity.entityId !== item.entityId &&
      entity.entityId !== item.mainEntityId &&
      (!isLinkedDevice || selectableExtraEntity(entity as never)),
  )
}

/** 设备分组摘要：`名称（当前设备） · 已选 N 项`。 */
function deviceSummaryLabel(options: ExtraSourcesSectionOptions, device: ExtraSourceDevice): string {
  const { item, editorHost, primaryDeviceId } = options,
    name =
      device.deviceName ||
      editorHost.entities.find((entity) => String(entity.deviceId || entity.device_id || '') === device.deviceId)
        ?.name ||
      device.deviceId ||
      '原设备暂不可用',
    selected = (item.extraControls || []).filter(
      (control) => sourceDeviceOf(control, primaryDeviceId) === device.deviceId,
    ).length
  return name + (device.primary ? '（当前设备）' : '') + ' · 已选 ' + selected + ' 项'
}

/** 每台设备的实体清单：目录条目 + 已配置但已不在目录里的孤儿条目。 */
function deviceEntityRows(options: ExtraSourcesSectionOptions, device: ExtraSourceDevice): EntityEntry[] {
  const known = entitiesForDevice(options, device.deviceId),
    knownIds = new Set(known.map((entity) => entity.entityId)),
    orphans = (options.item.extraControls || [])
      .filter(
        (control) =>
          sourceDeviceOf(control, options.primaryDeviceId) === device.deviceId && !knownIds.has(control.entityId || ''),
      )
      .map((control) => ({
        entityId: control.entityId || '',
        name: '已失效或不属于当前设备',
        status: 'missing',
        sourceMissing: true,
      }))
  return [...known, ...orphans]
}

/** 勾选一条实体：写入/移除 `extraControls`，并把来源设备记在条目上。 */
function toggleExtraControl(options: ExtraSourcesSectionOptions, entity: EntityEntry, checked: boolean): void {
  const current = options.item.extraControls || []
  options.item.extraControls = checked
    ? [
        ...current,
        {
          entityId: entity.entityId,
          type: extraTypes(entity.entityId)[0],
          label: '',
          // 来自关联设备的实体要记住归属，运行时按设备名区分。
          ...(entity.sourceDeviceId ? { sourceDeviceId: entity.sourceDeviceId } : {}),
        },
      ]
    : current.filter((control) => control.entityId !== entity.entityId)
  options.refreshEditorPreview()
  options.onExtraControlChanged(checked ? null : entity.entityId)
}

/** 一行实体：勾选框 + 名称/ID/状态。 */
function createEntityRow(options: ExtraSourcesSectionOptions, entity: EntityEntry, state: GroupState): HTMLElement {
  const { editorHost } = options,
    type = extraTypes(entity.entityId)[0],
    checked = (options.item.extraControls || []).some((control) => control.entityId === entity.entityId),
    disabled = isDisabledEntity(entity),
    rowElement = editorHost.createElement('label', 'i3d-extra-entity-row'),
    checkboxElement = editorHost.createElement('input')
  checkboxElement.type = 'checkbox'
  checkboxElement.checked = checked
  checkboxElement.disabled = !checked && disabled
  checkboxElement.setAttribute('aria-label', entity.name || entity.entityId)
  const detailElement = editorHost.createElement('span'),
    stateLineElement = editorHost.createElement('small', '', entityStateText(editorHost, entity, type))
  detailElement.title = (entity.name || entity.entityId) + '\n' + entity.entityId
  stateLineElement.hidden = isStateLineHidden(editorHost, entity, type)
  detailElement.append(
    editorHost.createElement('strong', '', entity.name || entity.entityId),
    editorHost.createElement('small', '', entity.entityId),
    stateLineElement,
  )
  state.rendered.push({ entity, stateLine: stateLineElement, type })
  checkboxElement.addEventListener('change', () => {
    if (editorHost.isDisposed) return
    toggleExtraControl(options, entity, checkboxElement.checked)
    state.rerender()
  })
  rowElement.append(checkboxElement, detailElement)
  return rowElement
}

/** 上一页 / `x / y · N 项` / 下一页。 */
function createPager(
  options: ExtraSourcesSectionOptions,
  device: ExtraSourceDevice,
  state: GroupState,
  page: number,
  pageCount: number,
  total: number,
): HTMLElement {
  const { editorHost } = options,
    pagerElement = editorHost.createElement('div', 'i3d-extra-pages'),
    goTo = (nextPage: number) => {
      state.pageByDevice.set(device.deviceId, nextPage)
      state.rerender()
    },
    previousButton = editorHost.createButton('上一页', () => goTo(page - 1)),
    nextButton = editorHost.createButton('下一页', () => goTo(page + 1))
  previousButton.disabled = page <= 1
  nextButton.disabled = page >= pageCount
  pagerElement.append(
    previousButton,
    editorHost.createElement('span', '', page + ' / ' + pageCount + ' · ' + total + ' 项'),
    nextButton,
  )
  return pagerElement
}

/** 「移除设备」：没有附加功能直接移除，否则行内二次确认（上游 `i3d-extra-remove-confirm`）。 */
function createRemoveDeviceControl(options: ExtraSourcesSectionOptions, device: ExtraSourceDevice): HTMLElement {
  const { editorHost } = options,
    actionsElement = editorHost.createElement('div', 'i3d-extra-source-actions'),
    removeDevice = () => {
      removeExtraDevice(options.item as never, device.deviceId)
      options.refreshEditorPreview()
      options.renderPanel()
    },
    removeButton = editorHost.createButton('移除设备', () => {
      if (editorHost.isDisposed || !editorHost.isAccessAllowed) return
      const removedCount = (options.item.extraControls || []).filter(
        (control) => sourceDeviceOf(control, options.primaryDeviceId) === device.deviceId,
      ).length
      if (!removedCount) {
        removeDevice()
        return
      }
      const confirmElement = editorHost.createElement('div', 'i3d-extra-remove-confirm')
      confirmElement.append(
        editorHost.createElement('span', '', '同时移除此设备的 ' + removedCount + ' 项弹窗功能？'),
        editorHost.createButton('确认移除', removeDevice),
        editorHost.createButton('取消', () => confirmElement.remove()),
      )
      actionsElement.append(confirmElement)
    })
  actionsElement.append(removeButton)
  return actionsElement
}

/** 一台设备的 `<details>`：摘要 + 移除设备 + 实体清单 + 分页。 */
function createSourceGroup(
  options: ExtraSourcesSectionOptions,
  device: ExtraSourceDevice,
  state: GroupState,
): HTMLElement {
  const { editorHost } = options,
    groupElement = editorHost.createElement('details', 'i3d-extra-source'),
    listElement = editorHost.createElement('div', 'i3d-extra-entity-list'),
    query = state.query().trim().toLowerCase(),
    allEntities = deviceEntityRows(options, device),
    matchedEntities = query
      ? allEntities.filter((entity) => ((entity.name || '') + ' ' + entity.entityId).toLowerCase().includes(query))
      : allEntities,
    pageCount = Math.max(1, Math.ceil(matchedEntities.length / EXTRA_PAGE_SIZE)),
    page = Math.min(state.pageByDevice.get(device.deviceId) || 1, pageCount)
  groupElement.append(editorHost.createElement('summary', '', deviceSummaryLabel(options, device)))
  if (!device.primary) groupElement.append(createRemoveDeviceControl(options, device))
  state.pageByDevice.set(device.deviceId, page)
  if (!matchedEntities.length)
    listElement.append(
      editorHost.createElement('p', 'i3d-note', query ? '没有匹配的实体。' : '此设备暂无可选实体；已有配置会保留。'),
    )
  for (const entity of matchedEntities.slice((page - 1) * EXTRA_PAGE_SIZE, page * EXTRA_PAGE_SIZE))
    listElement.append(createEntityRow(options, entity, state))
  groupElement.append(listElement)
  if (pageCount > 1) groupElement.append(createPager(options, device, state, page, pageCount, matchedEntities.length))
  // 搜索时全部展开；否则只有首次构建时那台（上游同口径）。
  groupElement.open = query ? true : state.openSet.has(device.deviceId)
  groupElement.addEventListener('toggle', () => {
    if (editorHost.isDisposed) return
    groupElement.open ? state.openSet.add(device.deviceId) : state.openSet.delete(device.deviceId)
  })
  return groupElement
}

/** 打开 HA 设备选择器并把选中的设备挂到 `extraDevices`。 */
async function pickExtraDevice(options: ExtraSourcesSectionOptions, trigger: HTMLElement): Promise<void> {
  const { editorHost, item } = options
  editorHost.errorMessageElement.textContent = ''
  const pickerGeneration = ++editorHost.pickerGeneration,
    linkedIds = new Set((item.extraDevices || []).map((device) => device.deviceId)),
    devicePicker = editorHost.pickers?.device
  if (!devicePicker) throw new Error('选择器尚未准备好，请保存后刷新页面。')
  editorHost.pickerHandle?.close?.()
  const pickerHandle = await devicePicker({
    trigger,
    title: '添加弹窗关联设备',
    // 已关联的设备不再出现在候选里（上游 `deviceFilter` 同一口径）。
    deviceFilter: (candidate: { deviceId?: string; id?: string }) =>
      !linkedIds.has(String(candidate.deviceId || candidate.id || '')),
    current: '',
    onSelect(selectedDevice?: { deviceId?: string; id?: string; name?: string }) {
      const deviceId = String(selectedDevice?.deviceId || selectedDevice?.id || '')
      if (!deviceId || linkedIds.has(deviceId) || editorHost.isDisposed || !editorHost.isAccessAllowed) return
      if (pickerGeneration !== editorHost.pickerGeneration) return
      item.extraDevices = [
        ...(item.extraDevices || []),
        { deviceId, deviceName: String(selectedDevice?.name || deviceId) },
      ]
      options.refreshEditorPreview()
      options.renderPanel()
    },
  })
  editorHost.isDisposed || !editorHost.isAccessAllowed || pickerGeneration !== editorHost.pickerGeneration
    ? pickerHandle?.close?.()
    : (editorHost.pickerHandle = pickerHandle ?? null)
}

/**
 * 渲染「附加功能」分区并返回分区元素。
 *
 * 勾选后整块重建（与上游一致）：实体数量有限，重建能保证「已选 N 项」与各设备摘要不漂移；
 * 状态刷新走 `refreshStates()`，只改文字，保住勾选与焦点。
 */
export function createExtraSourcesSection(options: ExtraSourcesSectionOptions): HTMLElement {
  const { editorHost, item } = options,
    sectionElement = options.createConfigSection('附加功能'),
    previewButton = editorHost.createButton('实时预览弹窗', async () => {
      try {
        await editorHost.editorRuntime?.focusCommand?.('preview-device-panel', item.id)
      } catch (previewError) {
        editorHost.isDisposed ||
          (editorHost.errorMessageElement.textContent =
            previewError instanceof Error ? previewError.message : String(previewError))
      }
    }),
    addDeviceButton = editorHost.createButton('添加关联设备', () => {
      pickExtraDevice(options, addDeviceButton).catch((pickerError: unknown) => {
        editorHost.isDisposed ||
          (editorHost.errorMessageElement.textContent =
            pickerError instanceof Error ? pickerError.message : String(pickerError))
      })
    }),
    rowElement = editorHost.createElement('div', 'i3d-config-row'),
    chooserElement = editorHost.createElement('details', 'i3d-extra-chooser'),
    summaryElement = editorHost.createElement('summary'),
    searchElement = editorHost.createElement('input'),
    groupsElement = editorHost.createElement('div', 'i3d-extra-source-groups'),
    rendered: RenderedEntity[] = [],
    pageByDevice = new Map<string, number>(),
    openSet = new Set<string>()
  addDeviceButton.classList.add('i3d-extra-add-device')
  rowElement.append(previewButton, addDeviceButton)
  searchElement.placeholder = '搜索已添加设备的实体名称或 ID'
  searchElement.setAttribute('aria-label', '搜索附加实体')
  chooserElement.append(summaryElement, searchElement, groupsElement)
  sectionElement.append(
    rowElement,
    editorHost.createElement(
      'p',
      'i3d-note',
      '添加设备后勾选弹窗内容，设备和实体数量不限。关联设备不改变模型的主控、动画或指示灯。',
    ),
    chooserElement,
  )
  const state: GroupState = {
      rendered,
      pageByDevice,
      openSet,
      rerender: () => renderGroups(),
      refreshSummary: () =>
        (summaryElement.textContent = '选择附加功能（已选 ' + (item.extraControls || []).length + ' 项）'),
      query: () => searchElement.value,
    },
    renderGroups = () => {
      const sources = buildExtraSourceList(options)
      sources[0] && openSet.add(sources[0].deviceId)
      groupsElement.replaceChildren()
      rendered.length = 0
      if (!sources.length)
        groupsElement.append(editorHost.createElement('p', 'i3d-note', '先添加关联设备，再选择弹窗内容。'))
      else for (const device of sources) groupsElement.append(createSourceGroup(options, device, state))
      state.refreshSummary()
    }
  searchElement.addEventListener('input', () => {
    pageByDevice.clear()
    renderGroups()
  })
  chooserElement.addEventListener('toggle', () => {
    chooserElement.open && !editorHost.isDisposed && renderGroups()
  })
  ;(editorHost as { refreshExtraControlStates?: () => void }).refreshExtraControlStates = () => {
    if (editorHost.isDisposed) return
    for (const row of rendered) {
      if (!row.stateLine.isConnected) continue
      row.stateLine.hidden = isStateLineHidden(editorHost, row.entity, row.type)
      row.stateLine.textContent = entityStateText(editorHost, row.entity, row.type)
    }
  }
  renderGroups()
  return sectionElement
}

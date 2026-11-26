/**
 * 失效配置检查与修复（0.8.9 起为「列表 + 逐条操作」）。
 *
 * 复制控件 / 删除模型后，文档里会残留指向已不存在模型的绑定。后端
 * `POST /projects/{id}/binding-check` 返回可移除的失效项；这里负责
 * 「先列清单 → 用户确认 → 再检查一次（防止期间户型已改）→ 返回清理后的文档」。
 *
 * ## 为什么从「一段文本」改成「列表」
 *
 * 0.8.4 的确认框把所有失效项拼成多行文本，用户只能整体接受或整体取消：
 * 既看不出每条属于哪个分组，也没法只处理其中一条。0.8.9 把它拆成两个清单：
 *
 * - **可以应用的修复**：服务端能自动移除的关联，逐条列出 + 「定位控件」；
 * - **需要手动处理**：服务端只能指出问题（例如实体已删但模型还在），
 *   需要用户自己重新选择，文案会告出「打开哪个分组 → 哪个字段」。
 *
 * 分组/字段的文案映射与检查器的折叠组一一对应（`bindingInspectorGroup`
 * 返回的 key 就是 `appendInspectorGroup` 用的 key），否则「打开『设备配置 → …』」
 * 会指向一个不存在的入口。
 */

import { shellConfirm } from '@/studio/platform/shell-chrome'

export interface BindingRepairIssue {
  componentLabel?: string
  label?: string
  reason?: string
  /** 服务端给出的配置路径：`['devices', 'lights', 'entityId']`。 */
  path?: unknown[]
  /** 服务端标记「只能人工处理」。缺省视为可自动修复。 */
  manual?: boolean
  [key: string]: any
}

/** 检查器折叠组：key 与 `appendInspectorGroup` 的 groupKey 一致。 */
const INSPECTOR_GROUP_LABELS: Readonly<Record<string, string>> = Object.freeze({
  layout: '户型与布局',
  devices: '设备配置',
  defaults: '默认显示',
  appearance: '画面效果',
})

/** 分组内的分区标题（上游文案，用于拼「设备配置 → 配置灯光」）。 */
const INSPECTOR_SECTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  lights: '配置灯光',
  environment: '配置环境',
  devices: '配置设备',
  security: '配置安防',
  vacuum: '配置扫地机',
  rendering: '户型渲染',
  navigation: '视角与导航',
})

/** 字段标题：只收容易出错的几个，缺省不拼（宁可少一段也不给错名字）。 */
const INSPECTOR_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  entityId: '绑定实体',
  entityIds: '绑定实体',
  modelId: '关联模型',
  sourceEntityId: '绑定设备',
  icon: '图标',
  opacity: '不透明度',
  height: '高度',
  // 0.8.9 增补：这些字段在「可以应用的修复 / 需要手动处理」里最常出现，
  // 少一个就会让提示指向一个笼统的「3D 控件设置」，用户找不到入口。
  remark: '备注',
  displayName: '设备显示名',
  room: '楼层',
  floorGap: '楼层间距',
  columns: '排列列数',
  temperatureEntityId: '温度实体',
  humidityEntityId: '湿度实体',
  formaldehydeEntityId: '甲醛实体',
  pm25EntityId: 'PM2.5 实体',
  pm10EntityId: 'PM10 实体',
  tvocEntityId: 'TVOC 实体',
  co2EntityId: 'CO₂ 实体',
  aqiEntityId: 'AQI 实体',
  powerEntityId: '电量实体',
  lightEntityId: '光照实体',
  airflowSourceId: '出风动画来源',
  popupDeviceId: '弹窗关联设备',
  alarmCard: '报警卡片',
  masterCard: '主控卡片',
  thermostatCard: '温控卡',
  airConditionerCard: '空调卡',
  curtainGroup: '窗帘组合',
  windowSash: '窗扇',
  openWindow: '开窗器控制',
  shutter: '开合类',
  brokenRelation: '失效关联',
})

/** 「基础 → 备注」这类两段式路径的固定片（0.8.9 直接写在提示里）。 */
const INSPECTOR_LEAF_PATHS: Readonly<Record<string, string>> = Object.freeze({
  basic: '基础',
  remark: '备注',
})

/** 可被判为「3D 配置无效」的错误码（0.8.9 `isInteraction3dSaveFailure`）。 */
const INTERACTION3D_SAVE_FAILURE_CODES = Object.freeze(['INTERACTION3D_CONFIG_INVALID', 'STUDIO3D_BINDING_CONFLICT'])

/** 修复对话框与结果行的**全部文案**（0.8.9 `binding-repair.js`）。 */
const REPAIR_COPY = Object.freeze({
  titleRepair: '检查失效配置',
  titleCopy: '待复制控件中有失效配置',
  sectionAuto: '可以应用的修复',
  sectionManual: '需要手动处理',
  confirmRepair: '移除列出的失效配置',
  confirmCopy: '移除失效项并继续复制',
  cancel: '取消，保留配置',
  locate: '定位控件',
  applyListed: '应用列出的修复',
  repairAndSave: '修复并重新保存',
  resave: '重新保存',
  applyHint: '先确认要应用的修复，再按提示处理需要手动修改的设置。',
  removeRelation: '移除这条关联，可在编辑器重新关联模型。',
  recheckSourceChanged: '请核对户型来源后重新检查。',
  /** 检查入口的说明（0.8.9：在面板里说清「会列出什么」）。 */
  inspectIntro: '检查会列出这个仪表盘里受影响的 3D 控件、原因和处理办法。',
  /** 结果行（`editor.ts` 的 `.binding-repair-results`）。 */
  resultRepaired: (count: number) => `${count} 项修复，请点击顶部“保存”。`,
  resultManual: (count: number) => `${count} 项设置需要按检查提示手动处理。`,
  resultMixed: (removed: number, manual: number) => `${removed} 项修复，还有 ${manual} 项需要按检查提示手动处理。`,
})

/** 结果行文案（供 `editor.ts` 复用，避免它再写一份「N 项修复」）。 */
export function repairResultMessage(removedCount: number): string {
  return removedCount > 0 ? REPAIR_COPY.resultRepaired(removedCount) : '没有发现失效配置。'
}

export function hasInteractionBindings(bindingTree: any): boolean {
  if (!bindingTree || typeof bindingTree !== 'object') return true
  if (bindingTree.type === 'interaction3d') return false
  return Object.values(bindingTree).some(hasInteractionBindings)
}

/**
 * 失效项属于哪个检查器折叠组。
 *
 * 返回 `null` 表示路径不在已知分组里：调用方不应据此跳转，只提示文案即可。
 */
export function bindingInspectorGroup(issue: BindingRepairIssue): string | null {
  const head = Array.isArray(issue?.path) ? String(issue.path[0] ?? '') : ''
  return head in INSPECTOR_GROUP_LABELS ? head : null
}

/**
 * 「打开『设备配置 → 配置灯光 → 绑定实体』，重新选择或调整对应设置。」（0.8.9）
 *
 * 未知层级的处理：**跳过**而不是猜一个名字 —— 指错入口比不给入口更糟。
 */
export function configurationRepairHint(path: readonly unknown[] = []): string {
  // 复用 `bindingInspectorGroup`：分组名与「能否跳转」必须同一套判定，
  // 否则会出现「文案说有这个分组、点击却跳不过去」。
  const groupKey = bindingInspectorGroup({ path: [...path] })
  const group = (groupKey && INSPECTOR_GROUP_LABELS[groupKey]) || '3D 控件设置'
  const section = INSPECTOR_SECTION_LABELS[String(path[1] ?? '')]
  const leaf = INSPECTOR_LEAF_PATHS[String(path[0] ?? '')]
  const field = INSPECTOR_FIELD_LABELS[String(path.at(-1) ?? '')]
  // `基础 → 备注` 是上游的两段固定路径：分组本身就是「基础」时不再重复拼分组名。
  const trail = (leaf ? [leaf, field].filter(Boolean) : [group, section, field].filter(Boolean)).join(' → ')
  return `打开「${trail}」，重新选择或调整对应设置。若窗口无法打开，可先撤销最近一次配置修改。`
}

/**
 * 保存失败是否是「3D 配置无效」。
 *
 * 两条判据缺一不可：
 * - 结构化错误码（首选，跨语言稳定）；
 * - `422 + 文案前缀`（老后端没有登记错误码时的兜底，0.8.9 同样保留）。
 */
export function isInteraction3dSaveFailure(error: any): boolean {
  if (!error) return false
  if (INTERACTION3D_SAVE_FAILURE_CODES.includes(String(error.code ?? error.detail?.code ?? ''))) return true
  return error.status === 422 && String(error.message ?? '').startsWith('3D 交互配置无效')
}

/** 一条失效项的一行文案：`客厅主灯 · 绑定实体：模型已删除`。 */
function issueLine(issue: BindingRepairIssue): string {
  return [String(issue.componentLabel || ''), String(issue.label || '')].filter(Boolean).join(' · ')
}

/**
 * 合并两处失效项清单并去重。
 *
 * 后端在 `issues` 之外还提供 `configurationIssues`（同一份清单的两种叫法，
 * 老前端读前者、0.8.9 读后者）。取并集是为了「有失效项却显示为 0」不会发生；
 * 去重按内容比较 —— 同一项在两个字段里出现时不该列两遍。
 */
function collectRepairIssues(response: {
  issues?: BindingRepairIssue[]
  configurationIssues?: BindingRepairIssue[]
}): BindingRepairIssue[] {
  const merged = [...(response.issues ?? []), ...(response.configurationIssues ?? [])]
  return merged.filter(
    (issue, index) => merged.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(issue)) === index,
  )
}

/** 一行失效项：文案 + （可选的）修复提示 + （可选的）定位按钮。 */
function createIssueItem(
  issue: BindingRepairIssue,
  withHint: boolean,
  locate?: (issue: BindingRepairIssue) => void,
): HTMLLIElement {
  const item = document.createElement('li')
  const line = document.createElement('p')
  line.textContent = issueLine(issue) + (issue.reason ? '：' + String(issue.reason) : '')
  item.append(line)
  if (withHint) {
    const hint = document.createElement('small')
    hint.textContent = configurationRepairHint(Array.isArray(issue.path) ? issue.path : [])
    item.append(hint)
  }
  if (locate) {
    const locateButton = document.createElement('button')
    locateButton.type = 'button'
    locateButton.textContent = REPAIR_COPY.locate
    locateButton.addEventListener('click', () => locate(issue))
    item.append(locateButton)
  }
  return item
}

/** 一段失效项清单；分组为空时不生成节点。 */
function createIssueSection(
  headingText: string,
  issues: BindingRepairIssue[],
  withHint: boolean,
  locate?: (issue: BindingRepairIssue) => void,
): HTMLElement | null {
  if (!issues.length) return null
  const section = document.createElement('section')
  const sectionTitle = document.createElement('h3')
  sectionTitle.textContent = headingText
  const list = document.createElement('ul')
  list.className = 'binding-repair-list'
  for (const issue of issues) list.append(createIssueItem(issue, withHint, locate))
  section.append(sectionTitle, list)
  return section
}

type RepairDialogParts = {
  dialog: HTMLElement
  confirmButton: HTMLButtonElement
  cancelButton: HTMLButtonElement
}

/** 组装对话框骨架（不含事件与返回值），把 DOM 细节从主流程里挪走。 */
function createRepairDialog({
  title,
  lead,
  issues,
  mode,
  locate,
}: {
  title: string
  lead: string
  issues: BindingRepairIssue[]
  mode?: string
  locate?: (issue: BindingRepairIssue) => void
}): RepairDialogParts {
  const dialog = document.createElement('div')
  dialog.className = 'binding-repair-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', title)
  const heading = document.createElement('h2')
  heading.textContent = title
  const intro = document.createElement('p')
  intro.textContent = lead
  const results = document.createElement('div')
  results.className = 'binding-repair-results'
  for (const section of [
    createIssueSection(
      REPAIR_COPY.sectionAuto,
      issues.filter((issue) => issue.manual !== true),
      false,
      locate,
    ),
    createIssueSection(
      REPAIR_COPY.sectionManual,
      issues.filter((issue) => issue.manual === true),
      true,
      locate,
    ),
  ]) {
    if (section) results.append(section)
  }
  const actions = document.createElement('div')
  actions.className = 'binding-repair-actions'
  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.textContent = REPAIR_COPY.cancel
  const confirmButton = document.createElement('button')
  confirmButton.type = 'button'
  confirmButton.className = 'primary-action'
  confirmButton.textContent = mode === 'copy' ? REPAIR_COPY.confirmCopy : REPAIR_COPY.applyListed
  actions.append(cancelButton, confirmButton)
  dialog.append(heading, intro, results, actions)
  return { dialog, confirmButton, cancelButton }
}

/**
 * 渲染失效项列表对话框，返回用户是否确认修复。
 *
 * 为什么不用 `shellConfirm`：那个入口只吃字符串，无法给每条失效项挂「定位控件」。
 * 这里自建与 0.8.9 同名的标记（`.binding-repair-dialog` / `.binding-repair-results`
 * / `.binding-repair-list`），样式在 `app.css`；只用 `shellConfirm` 作为
 * 「拿不到 DOM」环境（例如单测）的降级路径。
 */
export async function confirmBindingRepair(
  issues: BindingRepairIssue[],
  { mode, signal, locate }: { mode?: string; signal?: AbortSignal; locate?: (issue: BindingRepairIssue) => void } = {},
): Promise<boolean> {
  if (signal?.aborted) return false
  if (!issues.length) return true
  const title = mode === 'copy' ? REPAIR_COPY.titleCopy : REPAIR_COPY.titleRepair
  const lead =
    mode === 'copy'
      ? `发现 ${issues.length} 项失效配置。确认后从待复制的副本中移除，源控件保持原样。也可以取消后重新关联模型。`
      : `发现 ${issues.length} 项失效配置。确认后移除以下配置，保留其他设置和 HA 实体。完成后请点击顶部“保存”；也可以取消后重新关联模型。`
  if (typeof document === 'undefined') {
    return shellConfirm({
      title,
      message: lead + '\n\n' + issues.map((issue) => issueLine(issue) + '：' + String(issue.reason || '')).join('\n'),
      confirmLabel: mode === 'copy' ? REPAIR_COPY.confirmCopy : REPAIR_COPY.confirmRepair,
      cancelLabel: REPAIR_COPY.cancel,
      tone: 'danger',
    })
  }
  const { dialog, confirmButton, cancelButton } = createRepairDialog({ title, lead, issues, mode, locate })
  return new Promise<boolean>((resolve) => {
    const finish = (confirmed: boolean) => {
      signal?.removeEventListener('abort', onAbort)
      dialog.remove()
      resolve(!signal?.aborted && confirmed)
    }
    const onAbort = () => finish(false)
    cancelButton.addEventListener('click', () => finish(false))
    confirmButton.addEventListener('click', () => finish(true))
    signal?.addEventListener('abort', onAbort, { once: true })
    document.body.append(dialog)
    confirmButton.focus()
  })
}

export function createBindingRepair({
  api,
  confirm = confirmBindingRepair,
  locate,
}: {
  api: (path: string, options?: Record<string, any>) => Promise<any>
  confirm?: typeof confirmBindingRepair
  locate?: (issue: BindingRepairIssue) => void
}) {
  let activeRequest: AbortController | null = null
  const cancel = () => {
    activeRequest?.abort(), (activeRequest = null)
  }

  async function prepare({
    panelDocument,
    componentIds = [],
    mode = 'repair',
    isCurrent = () => true,
  }: any): Promise<any> {
    cancel()
    if (!hasInteractionBindings(panelDocument)) return { document: panelDocument, issues: [] }
    const requestController = new AbortController()
    activeRequest = requestController
    const { signal } = requestController,
      isStillCurrent = () => !signal.aborted && isCurrent(),
      requestBody = JSON.stringify({ document: panelDocument, componentIds }),
      checkBindings = async () => {
        const timeoutId = setTimeout(() => requestController.abort(), 15000)
        try {
          return await api('/projects/' + encodeURIComponent(panelDocument.projectId) + '/binding-check', {
            method: 'POST',
            body: requestBody,
            signal,
          })
        } finally {
          clearTimeout(timeoutId)
        }
      }
    try {
      const firstCheck = await checkBindings()
      if (!isStillCurrent()) return null
      // 0.8.9：`issues` 与 `configurationIssues` 是同一份清单的两种叫法（老前端读前者）。
      const issues = collectRepairIssues(firstCheck)
      if (!issues.length) return firstCheck
      if (!(await confirm(issues, { mode, signal, locate })) || !isStillCurrent()) return null
      const repairedCheck = await checkBindings()
      if (!isStillCurrent()) return null
      if (JSON.stringify(repairedCheck.issues) !== JSON.stringify(firstCheck.issues))
        throw new Error('户型或工作稿中的失效项已变化，请重新检查。')
      return repairedCheck
    } catch (repairError: any) {
      if (!isCurrent() || activeRequest !== requestController) return null
      throw signal.aborted ? new Error('检查已取消或超时，配置保持不变，请重试。') : repairError
    } finally {
      activeRequest === requestController && (activeRequest = null), requestController.abort()
    }
  }

  return { prepare, cancel }
}

/** 「检查」按钮的说明文案（供 `editor.ts` 作 title，不必再导出一份表）。 */
export const REPAIR_INSPECT_INTRO: string = REPAIR_COPY.inspectIntro

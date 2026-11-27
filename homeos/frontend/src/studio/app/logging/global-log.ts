import { navigateInShell } from '@/studio/platform/shell-navigation'
import { type DomControl } from '@app/shared/util/dom-control'
import { domElement } from '@app/shared/util/dom-factory'

async function apiFetch(path: any, options: { body?: any; headers?: Record<string, string> } = {}) {
  const response = await fetch('/api/v1' + path, {
      cache: 'no-store',
      ...options,
      headers: options.body
        ? {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          }
        : options.headers,
    }),
    responseText = response.status === 204 ? '' : await response.text()
  let payload: any = null
  if (responseText)
    try {
      payload = JSON.parse(responseText)
    } catch {
      if (response.ok) throw new Error('接口返回格式异常：' + path.split('?')[0])
    }
  if (response.status === 401) throw (navigateInShell('/login'), new Error('登录状态已失效。'))
  if (!response.ok) {
    const detail = payload?.detail
    throw new Error(typeof detail == 'string' ? detail : detail?.message || '请求失败（HTTP ' + response.status + '）')
  }
  return payload
}
setupGlobalLog({
  api: apiFetch,
})

const LEVEL_LABELS = {
  info: '信息',
  success: '成功',
  warning: '警告',
  error: '错误',
}
const CONTEXT_LABELS = {
  requestId: '请求编号',
  requestIds: '近期请求编号',
  firstRequestId: '首次请求编号',
  lastRequestId: '最近请求编号',
  correlationId: '关联事件编号',
  path: '请求路径',
  method: '请求方法',
  status: '响应状态',
  durationMs: '耗时（毫秒）',
  durationMinMs: '最短耗时（毫秒）',
  durationMaxMs: '最长耗时（毫秒）',
  page: '页面',
  pageSessionId: '本次页面编号',
  peer: '请求来源地址（服务端观察）',
  projectId: '仪表盘编号',
  projectName: '仪表盘名称',
  componentId: '控件编号',
  componentIds: '关联控件编号（最多6项）',
  componentName: '控件名称',
  displayId: '显示设备编号',
  displayName: '显示设备名称',
  pairingId: '配对入口编号',
  bindingId: '三维绑定编号',
  bindingFloorId: '三维楼层编号',
  bindingModelId: '三维模型编号',
  entityId: '实体',
  entityName: '实体名称',
  service: '服务',
  modelType: '模型类型',
  operation: '相关操作',
  eventType: '事件类型',
  actor: '操作账号',
  userAgent: '浏览器信息',
  code: '原因代码',
  reasonCode: '具体原因代码',
  reason: '失败原因',
  hint: '建议检查',
  line: '行号',
  column: '列号',
  phase: '发生阶段',
  hours: '历史范围（小时）',
  revision: '当前修订',
  previousRevision: '原修订',
  persistenceState: '持久化状态',
  retryAfterSeconds: '计划重试间隔（秒）',
  droppedEvents: '浏览器丢失条数',
  parameterFields: '服务参数字段（不含值）',
  appVersion: '程序版本',
  frontendRevision: '服务端前端修订',
  clientFrontendRevision: '浏览器前端修订',
  connectionName: 'HA连接名称',
  connectionRevision: 'HA配置版本指纹（不含凭据）',
}
const EVENT_LABELS = {
  startup: '程序启动',
  ready: '程序就绪',
  shutdown: '程序停止',
  accepted: '建立连接',
  rejected: '拒绝或终止连接',
  disconnected: '连接断开',
  subscribe: '订阅实体',
  'camera-stream': '摄像头持续传输',
  'device-control': '设备控制',
  'component-action': '控件操作',
  'runtime-operation': '显示端操作',
  'editor-operation': '编辑器操作',
  'save-draft': '仪表盘保存',
  'display-refresh': '仪表盘刷新',
  'studio-save': '户型草稿保存',
  'studio-exit-save': '退出前保存户型',
  'studio-export': '户型导出',
  'studio-model-load': '3D 模型加载',
  'studio-webgl-init': '3D 图形初始化',
  'studio-webgl-context': '3D 图形上下文',
  'studio-light-precompile': '灯光材质提前准备',
  'studio-model-precompile': '模型材质提前准备',
  'studio-initial-precompile': '首屏材质提前准备',
  'studio-shadow-atlas': '聚光灯阴影图集生成',
  'studio-light-cache': '光照缓存生成',
  'studio-light-cache-restore': '光照缓存恢复',
  'interaction3d-cache-write': '3D 缓存写入',
  'interaction3d-settled-cache': '3D 稳定画面缓存',
  'interaction3d-lifecycle': '3D 运行生命周期',
  'websocket-reconnected': '实时连接恢复',
  'websocket-disconnected': '实时连接断开',
  'websocket-message': '实时消息处理',
  'history-timeout': '历史曲线超时',
  'model-hover-preview': '模型悬停预览',
  'runtime-processing': '实时状态处理',
  'device-control-failed': '设备服务调用失败',
  'runtime-failure': '运行故障',
  'fault-recovery': '故障恢复',
  'image-asset': '图片资源',
  'style-asset': '样式资源',
  'script-asset': '脚本资源',
  'video-init': '视频初始化',
  'video-play': '视频播放',
  'camera-live-sync': '摄像头实时画面同步',
  'cover-memory': '窗帘位置记忆',
  'ha-catalog': 'HA实体目录',
  'ha-connect': 'HA连接',
  'backup-generate': '生成业务备份',
  'backup-inspect': '检查业务备份',
  'backup-restore': '恢复业务备份',
  'display-pairing': '显示设备配对管理',
  'project-copy': '复制仪表盘',
  'project-read': '读取仪表盘',
  'entity-history': '读取实体历史',
  'save-progress': '保存进度',
  'save-auto-diagram-lighting': '保存导图光照',
  'auth-operation': '授权操作',
  'auth-state': '授权状态变化',
  'admin-login': '管理员登录',
  'admin-account': '管理员账号设置',
  'login-ended': '结束登录',
  'geometry-batch-fallback': '几何合批回退',
  'lighting-notice': '灯光性能提示',
}
/**
 * 「涉及的对象」说明行（0.8.7 `global-log-explanation`）。
 *
 * 0.8.7 的目标是「失败时能直接看出涉及哪个仪表盘 / 显示设备 / 控件 / 实体 / 模型」，
 * 所以把这几项从 context 里提出来单独成行，而不是让人在 details 里翻 40 个键。
 */
const EXPLANATION_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['projectName', '仪表盘'],
  ['displayName', '显示设备'],
  ['componentName', '控件'],
  ['entityName', '实体'],
  ['modelType', '模型'],
]

interface LogEntryLike {
  context?: Record<string, unknown>
}

function explanationLines(entry: LogEntryLike): string[] {
  const context = entry.context || {}
  const lines: string[] = []
  const objects = EXPLANATION_FIELDS.filter(([key]) => context[key]).map(([key, label]) => `${label}：${context[key]}`)
  if (objects.length) lines.push(objects.join(' · '))
  for (const [key, label] of [
    ['reason', '失败原因'],
    ['hint', '建议检查'],
  ] as const) {
    const value = context[key]
    if (!value) continue
    // `reason` 在不属于「运行故障」的事件里是解释性说明，用「说明」前缀更准确。
    const prefix = key === 'reason' && context.eventType && context.eventType !== '运行故障' ? '说明' : label
    lines.push(`${prefix}：${value}`)
  }
  return lines
}

/** 「查看关联日志」按钮：只在有 requestId / correlationId 时出现。 */
function appendRelatedButton(
  bodyElement: HTMLElement,
  entry: LogEntryLike,
  onOpenRelated: (query: RelatedQuery) => void,
): void {
  const context = entry.context || {}
  if (!context.requestId && !context.correlationId) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'global-log-related'
  button.textContent = '查看关联日志'
  button.addEventListener('click', () =>
    onOpenRelated({
      requestId: String(context.requestId || ''),
      correlationId: String(context.correlationId || ''),
    }),
  )
  bodyElement.append(button)
}

/** 条目正文的附加信息：涉及对象 / 失败原因 / 关联按钮。抽出来压 renderEntries 的分支数。 */
function appendEntryExtras(
  bodyElement: HTMLElement,
  logEntry: LogEntryLike,
  onOpenRelated: (query: RelatedQuery) => void,
): void {
  for (const line of explanationLines(logEntry)) {
    const explanationElement = document.createElement('p')
    explanationElement.className = 'global-log-explanation'
    explanationElement.textContent = line
    bodyElement.append(explanationElement)
  }
  appendRelatedButton(bodyElement, logEntry, onOpenRelated)
}

/** 日志弹窗底部的状态行（每条信息都可能来自不同来源，集中拼装避免主流程膨胀）。 */
function buildStatusText(
  entryCount: number,
  response: { total?: number; retentionDays?: number } | null | undefined,
  storage: Record<string, unknown>,
): string {
  const num = (value: unknown) => Number(value || 0)
  const bytes = num(storage.maxBytes)
  const sizeLimitText = bytes ? ' / ' + (bytes / 1024 / 1024).toFixed(0) + ' MB 上限' : ''
  const autoRefreshNote = entryCount > 200 ? ' · 查看历史时暂停自动刷新' : ''
  const storageErrorText =
    storage.healthy === false
      ? ' · 日志存储异常：' +
        String(storage.lastError || '写入失败') +
        '（待写 ' +
        num(storage.pendingEvents) +
        '，丢弃 ' +
        num(storage.droppedEvents) +
        '）'
      : ''
  const writeFailureText =
    storage.healthy !== false && (num(storage.writeFailures) > 0 || num(storage.droppedEvents) > 0)
      ? ' · 历史写入失败 ' + num(storage.writeFailures) + ' 次，丢弃 ' + num(storage.droppedEvents) + ' 条'
      : ''
  return (
    '已显示 ' +
    entryCount +
    ' / ' +
    (response?.total ?? entryCount) +
    ' 条 · 自动保留最近 ' +
    (num(storage.retentionDays) || response?.retentionDays || 7) +
    ' 天' +
    sizeLimitText +
    autoRefreshNote +
    storageErrorText +
    writeFailureText
  )
}

function formatContextEntry(contextKey: any, contextValue: any) {
  const eventLabel = contextKey === 'phase' ? (EVENT_LABELS as any)[contextValue] : null
  return (
    ((CONTEXT_LABELS as any)[contextKey] || contextKey) +
    '（' +
    contextKey +
    '）：' +
    (eventLabel ? eventLabel + '（' + contextValue + '）' : contextValue)
  )
}
function formatTimestamp(timestamp: any) {
  const parsedDate = new Date(timestamp)
  return Number.isNaN(parsedDate.getTime())
    ? '时间未知'
    : new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
        .format(parsedDate)
        .replace(/\//g, '-')
}
/** 关联查询：任一字段非空即进入「只看这一次故障」的模式。 */
export type RelatedQuery = { requestId: string; correlationId: string }

export function setupGlobalLog({ api: apiRequest }: any) {
  const globalLogOpenButton = document.querySelector<DomControl>('#global-log-open'),
    globalLogDialogElement = document.querySelector<DomControl>('#global-log-dialog')
  if (!globalLogOpenButton || !globalLogDialogElement || globalLogOpenButton.dataset.globalLogReady === 'true')
    return null
  globalLogOpenButton.dataset.globalLogReady = 'true'
  const globalLogCloseButton = globalLogDialogElement.querySelector<DomControl>('#global-log-close'),
    globalLogCloseFooterButton = globalLogDialogElement.querySelector<DomControl>('#global-log-close-footer'),
    globalLogRefreshButton = globalLogDialogElement.querySelector<DomControl>('#global-log-refresh'),
    globalLogExportButton = globalLogDialogElement.querySelector<DomControl>('#global-log-export'),
    globalLogClearButton = globalLogDialogElement.querySelector<DomControl>('#global-log-clear'),
    globalLogMoreButton = globalLogDialogElement.querySelector<DomControl>('#global-log-more'),
    globalLogLevelSelect = globalLogDialogElement.querySelector<DomControl>('#global-log-level'),
    globalLogCategorySelect = globalLogDialogElement.querySelector<DomControl>('#global-log-category'),
    globalLogSearchInput = globalLogDialogElement.querySelector<DomControl>('#global-log-search'),
    globalLogListElement = globalLogDialogElement.querySelector<DomControl>('#global-log-list'),
    globalLogStatusElement = globalLogDialogElement.querySelector<DomControl>('#global-log-status')
  let entries: any = [],
    isLoading = false,
    refreshTimer: any = null,
    searchTimer: any = null,
    nextOffset: any = null,
    hasPendingRefresh = false,
    /** 当前关联查询（空 = 全部日志）。 */
    relatedQuery: RelatedQuery = { requestId: '', correlationId: '' },
    /** 上一次响应是否处于关联模式（决定「返回全部日志」按钮）。 */
    relatedMode = false
  const PAGE_SIZE = 200

  const openRelated = (query: RelatedQuery): void => {
    relatedQuery = query
    void loadEntries()
  }

  const backToAll = (): void => {
    relatedQuery = { requestId: '', correlationId: '' }
    void loadEntries()
  }
  function renderEntries(entryList: any) {
    if ((globalLogListElement!.replaceChildren(), !entryList.length)) {
      const emptyElement = document.createElement('div')
      ;(emptyElement.className = 'global-log-empty'),
        (emptyElement.textContent = '当前筛选条件下没有日志。'),
        globalLogListElement!.append(emptyElement)
      return
    }
    const logListFragmentNode = document.createDocumentFragment()
    for (const logEntry of entryList) {
      const itemElement = domElement(document, 'article', 'global-log-item ' + (logEntry.level || 'info'))
      const levelIcon = document.createElement('i')
      levelIcon.setAttribute('aria-hidden', 'true')
      const bodyElement = document.createElement('div'),
        messageElement = document.createElement('strong')
      messageElement.textContent = logEntry.message || '未提供说明'
      const metaElement = document.createElement('span'),
        timeText = logEntry.clientTimestamp
          ? '客户端发生 ' + formatTimestamp(logEntry.clientTimestamp) + ' · 接收 ' + formatTimestamp(logEntry.timestamp)
          : formatTimestamp(logEntry.timestamp)
      metaElement.textContent =
        timeText + ' · ' + (logEntry.source || '系统后台') + ' · ' + (logEntry.category || '系统')
      bodyElement.append(messageElement, metaElement)
      appendEntryExtras(bodyElement, logEntry, openRelated)
      if (logEntry.details || Object.keys(logEntry.context || {}).length) {
        const detailsElement = document.createElement('details'),
          summaryElement = document.createElement('summary')
        summaryElement.textContent = '查看详情'
        const detailsPreElement = document.createElement('pre')
        ;(detailsPreElement.textContent = [
          ...Object.entries(logEntry.context || {}).map(([detailKey, detailValue]) =>
            formatContextEntry(detailKey, detailValue),
          ),
          logEntry.details || '',
        ]
          .filter(Boolean)
          .join('\n')),
          detailsElement.append(summaryElement, detailsPreElement),
          bodyElement.append(detailsElement)
      }
      if (Number(logEntry.repeatCount || 1) > 1) {
        const repeatElement = document.createElement('span')
        ;(repeatElement.textContent =
          '重复 ' +
          logEntry.repeatCount +
          ' 次 · 最近' +
          (logEntry.lastClientTimestamp ? '发生' : '接收') +
          ' ' +
          formatTimestamp(logEntry.lastClientTimestamp || logEntry.lastTimestamp || logEntry.timestamp)),
          bodyElement.append(repeatElement)
      }
      const levelBadge = document.createElement('b')
      ;(levelBadge.textContent = (LEVEL_LABELS as any)[logEntry.level] || '信息'),
        itemElement.append(levelIcon, bodyElement, levelBadge),
        logListFragmentNode.append(itemElement)
    }
    globalLogListElement!.append(logListFragmentNode)
  }
  function syncCategoryOptions(categories: any) {
    const currentCategory = globalLogCategorySelect!.value
    globalLogCategorySelect!.replaceChildren(new Option('全部分类', ''))
    for (const category of categories || []) globalLogCategorySelect!.add!(new Option(category, category))
    globalLogCategorySelect!.value = [...globalLogCategorySelect!.options].some(
      (option) => option.value === currentCategory,
    )
      ? currentCategory
      : ''
  }
  function buildQueryParams() {
    const searchParams = new URLSearchParams()
    return (
      globalLogLevelSelect!.value && searchParams.set('level', globalLogLevelSelect!.value),
      globalLogCategorySelect!.value && searchParams.set('category', globalLogCategorySelect!.value),
      globalLogSearchInput!.value.trim() && searchParams.set('search', globalLogSearchInput!.value.trim()),
      relatedQuery.requestId && searchParams.set('requestId', relatedQuery.requestId),
      relatedQuery.correlationId && searchParams.set('correlationId', relatedQuery.correlationId),
      searchParams
    )
  }
  async function loadEntries({ append: append = false } = {}) {
    if (isLoading) {
      append || (hasPendingRefresh = true)
      return
    }
    ;(isLoading = true),
      (globalLogRefreshButton!.disabled = true),
      (globalLogMoreButton!.disabled = true),
      append || ((entries = []), (nextOffset = null), (globalLogMoreButton!.hidden = true)),
      (globalLogStatusElement!.textContent = '正在读取全局日志…')
    try {
      const queryParams = buildQueryParams()
      queryParams.set('limit', String(PAGE_SIZE)), queryParams.set('offset', String((append && nextOffset) || 0))
      const response = await apiRequest('/logs?' + queryParams),
        items = response?.items || []
      ;(entries = append ? [...new Map([...entries, ...items].map((entry) => [entry.id, entry])).values()] : items),
        (nextOffset = response?.hasMore ? response.nextOffset : null),
        (relatedMode = Boolean(response?.related)),
        syncCategoryOptions(response?.categories || []),
        renderEntries(entries)
      const storage = response?.storage || {}
      globalLogStatusElement!.textContent = buildStatusText(entries.length, response, storage)
      globalLogMoreButton!.hidden = nextOffset == null
      // 关联模式给一个显式出口：否则用户只能关掉弹窗才能回到全部日志。
      if (relatedMode) {
        const backButton = document.createElement('button')
        backButton.type = 'button'
        backButton.className = 'global-log-related'
        backButton.textContent = '返回全部日志'
        backButton.addEventListener('click', backToAll)
        globalLogStatusElement!.append(backButton)
      }
    } catch (caughtError: any) {
      ;(globalLogStatusElement!.textContent = caughtError.message || '日志读取失败。'), append || renderEntries([])
    } finally {
      ;(isLoading = false),
        (globalLogRefreshButton!.disabled = false),
        (globalLogMoreButton!.disabled = false),
        hasPendingRefresh && ((hasPendingRefresh = false), loadEntries())
    }
  }
  function stopAutoRefresh() {
    refreshTimer && window.clearInterval(refreshTimer), (refreshTimer = null)
  }
  async function openDialog() {
    globalLogDialogElement!.open || globalLogDialogElement!.showModal!(),
      await loadEntries(),
      stopAutoRefresh(),
      (refreshTimer = window.setInterval(() => {
        entries.length <= PAGE_SIZE &&
          !globalLogListElement!.querySelector<DomControl>('details[open]') &&
          loadEntries()
      }, 10000))
  }
  function closeDialog() {
    stopAutoRefresh(), globalLogDialogElement!.open && globalLogDialogElement!.close!()
  }
  return (
    globalLogOpenButton.addEventListener('click', openDialog),
    globalLogCloseButton!.addEventListener('click', closeDialog),
    globalLogCloseFooterButton!.addEventListener('click', closeDialog),
    globalLogRefreshButton!.addEventListener('click', () => loadEntries()),
    globalLogMoreButton!.addEventListener('click', () =>
      loadEntries({
        append: true,
      }),
    ),
    globalLogLevelSelect!.addEventListener('change', () => loadEntries()),
    globalLogCategorySelect!.addEventListener('change', () => loadEntries()),
    globalLogSearchInput!.addEventListener('input', () => {
      window.clearTimeout(searchTimer), (searchTimer = window.setTimeout(loadEntries, 250))
    }),
    globalLogDialogElement.addEventListener('close', stopAutoRefresh),
    globalLogExportButton!.addEventListener('click', () => {
      const downloadLink = document.createElement('a'),
        exportParams = buildQueryParams()
      ;(downloadLink.href = '/api/v1/logs/export' + (exportParams.size ? '?' + exportParams : '')),
        (downloadLink.download = 'homeos-global-log-' + new Date().toISOString().slice(0, 10) + '.txt'),
        document.body.append(downloadLink),
        downloadLink.click(),
        downloadLink.remove()
    }),
    globalLogClearButton!.addEventListener('click', async () => {
      const { shellConfirm } = await import('@/studio/platform/shell-chrome')
      if (
        !(await shellConfirm({
          title: '清空全局日志',
          message: '确定清空当前全局日志吗？清空后无法恢复。',
          confirmLabel: '清空',
          cancelLabel: '取消',
          tone: 'danger',
        }))
      )
        return
      globalLogClearButton!.disabled = true
      try {
        await apiRequest('/logs', {
          method: 'DELETE',
        }),
          await loadEntries()
      } catch (clearError: any) {
        globalLogStatusElement!.textContent = clearError.message || '日志清空失败。'
      } finally {
        globalLogClearButton!.disabled = false
      }
    }),
    {
      open: openDialog,
      refresh: loadEntries,
    }
  )
}

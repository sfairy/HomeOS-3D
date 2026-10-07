/**
 * 文件：field-groups.util.ts
 * 职责：高级参数字段分组工具。按分区内语义插入组标题，未命中任何组的字段落入末尾「其它」。
 *       提供 buildGroupedFieldEntries（构建分组字段条目）与 groupSearchResultsBySection（按分区聚合搜索结果）。
 * 关键依赖：无外部依赖，纯工具函数
 */

type FieldGroupDef = {
  id: string
  label: string
  /** 字段 key 完整匹配或前缀（以 * 结尾表示前缀） */
  match: string[]
}

/** sectionKey → 有序分组（先匹配先生效） */
const SECTION_FIELD_GROUPS: Record<string, FieldGroupDef[]> = {
  security: [
    {
      id: 'patrol',
      label: '巡检与冷却',
      match: [
        'sensorAlertCooldownSec',
        'emergencyCooldownSec',
        'awayConfirmMin',
        'bathroom*',
        'bedroom*',
        'kitchen*',
        'wholeHouse*',
        'deepNight*',
        'night*',
        'configCacheTtlMs',
      ],
    },
    {
      id: 'away-sim',
      label: '离家模拟',
      match: ['awaySim*'],
    },
    {
      id: 'frigate',
      label: 'Frigate 摄像头',
      match: ['frigate*'],
    },
  ],
  energy: [
    {
      id: 'anomaly',
      label: '学习与异常',
      match: ['learningPeriodDays', 'anomalyCooldownMin', 'budgetAlertCooldownMin'],
    },
  ],
  iaq: [
    {
      id: 'score',
      label: '空气质量 IAQ',
      match: ['iaq*', 'moldAlertCooldownMin'],
    },
  ],
  water: [
    {
      id: 'threshold',
      label: '用水阈值',
      match: ['anomalyCooldownMin', 'mainValveEntityId'],
    },
  ],
  ops: [
    {
      id: 'retention',
      label: '数据清理',
      match: ['retention*'],
    },
    {
      id: 'eventlog-buffer',
      label: 'EventLog 缓冲',
      match: ['eventLogFlush*', 'eventLogMax*'],
    },
    {
      id: 'eventlog-timeline',
      label: 'EventLog 时间线',
      match: ['eventLogTimeline*', 'eventLogOverlay*'],
    },
    {
      id: 'eventlog-policy',
      label: 'EventLog 策略',
      match: ['eventLogTier*', 'eventLogSkip*'],
    },
    {
      id: 'audit-history',
      label: '审计与执行历史',
      match: ['configAudit*', 'sceneExec*', 'scriptExec*', 'orchestrator*'],
    },
  ],
  frontend: [
    {
      id: 'api',
      label: 'API 请求',
      match: ['api*'],
    },
    {
      id: 'entity-cache',
      label: '实体缓存与重建',
      match: [
        'entityCache*',
        'rebuild*',
        'initStates*',
        'initialStates*',
        'largeEntity*',
        'worker*',
        'maxListeners',
        'callDedup*',
        'optimistic*',
        'haDisconnect*',
      ],
    },
    {
      id: 'widget',
      label: 'Widget 轮询',
      match: ['defaultWidget*', 'widgetPoll*', 'maxRemote*'],
    },
  ],
  haConnector: [
    {
      id: 'reconnect',
      label: '重连退避',
      match: ['reconnect*', 'maxReconnect*'],
    },
    {
      id: 'registry',
      label: '实体注册表',
      match: ['entityRegistry*', 'historyCache*'],
    },
    {
      id: 'queue',
      label: '命令队列',
      match: ['commandQueue*'],
    },
    {
      id: 'ingress',
      label: '入口合并',
      match: ['ingress*'],
    },
    {
      id: 'disconnect',
      label: '断连 REST 补同步',
      match: ['disconnect*'],
    },
  ],
  stateStore: [
    {
      id: 'redis',
      label: 'Redis 写入',
      match: ['redis*'],
    },
    {
      id: 'cache',
      label: '缓存与陈旧',
      match: ['maxRecent*', 'restCache*', 'stale*', 'initialStates*'],
    },
  ],
  wsPush: [
    {
      id: 'flush',
      label: '推送节奏',
      match: ['*Flush*', 'stateBatch*', 'haSyncWait*', 'replay*', 'critical*'],
    },
    {
      id: 'strategy',
      label: '推送策略',
      match: ['roomBatch*', 'coldEntity*'],
    },
  ],
  screensaver: [
    {
      id: 'behavior',
      label: '行为',
      match: [
        'defaultMode',
        'enableWeatherMode',
        'instant*',
        'brightness',
        'scale',
      ],
    },
    {
      id: 'visibility',
      label: '元素显隐',
      match: ['show*'],
    },
    {
      id: 'sizing',
      label: '尺寸与位置',
      match: ['*Size*', '*Vw', '*Vh', 'brandTop*', 'contentShift*', 'sepSize*'],
    },
  ],
  pricing: [
    {
      id: 'mode',
      label: '计费模式',
      match: ['pricingMode', 'fixedPrice', 'regionLabel', 'timeOfUseEnabled'],
    },
    {
      id: 'tier',
      label: '年阶梯',
      match: ['tier*'],
    },
    {
      id: 'tou',
      label: '峰谷平',
      match: ['peak*', 'valley*', 'flatPrice'],
    },
  ],
  external: [
    {
      id: 'weather',
      label: '天气 API',
      match: ['openWeather*', 'weatherLat', 'weatherLon', 'weatherFallback*'],
    },
    {
      id: 'weatherAlert',
      label: '天气预警联动',
      match: ['weatherAlert*', 'weatherAlerts*'],
    },
    {
      id: 'calendar',
      label: '日历',
      match: ['calendar*'],
    },
  ],
  other: [
    {
      id: 'retention',
      label: '历史保留',
      match: ['eventlogRetention*', 'haHistory*'],
    },
  ],
  notification: [
    {
      id: 'capacity',
      label: '容量与冷却',
      match: ['maxNotifications', 'offlineCooldown*', 'lowBatteryCooldown*'],
    },
  ],
}

function keyMatches(pattern: string, key: string): boolean {
  if (pattern.endsWith('*') && pattern.startsWith('*') && pattern.length > 2) {
    return key.includes(pattern.slice(1, -1))
  }
  if (pattern.endsWith('*')) return key.startsWith(pattern.slice(0, -1))
  if (pattern.startsWith('*')) return key.endsWith(pattern.slice(1))
  return key === pattern
}

function findGroupId(groups: FieldGroupDef[], key: string): string | null {
  for (const g of groups) {
    if (g.match.some((p) => keyMatches(p, key))) return g.id
  }
  return null
}

type FieldGroupEntry<T extends { key: string }> =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'field'; key: string; field: T }

/** 将字段列表按 SECTION_FIELD_GROUPS 插入组标题 */
export function buildGroupedFieldEntries<T extends { key: string }>(
  sectionKey: string,
  fields: T[],
): FieldGroupEntry<T>[] {
  const groups = SECTION_FIELD_GROUPS[sectionKey]
  if (!groups?.length || !fields.length) {
    return fields.map((field) => ({ kind: 'field' as const, key: field.key, field }))
  }

  const buckets = new Map<string, T[]>()
  const order: string[] = [...groups.map((g) => g.id), '__other']
  for (const id of order) buckets.set(id, [])

  for (const field of fields) {
    const gid = findGroupId(groups, field.key) || '__other'
    buckets.get(gid)!.push(field)
  }

  const labelOf = (id: string) =>
    id === '__other' ? '其它' : groups.find((g) => g.id === id)?.label || id

  const out: FieldGroupEntry<T>[] = []
  for (const id of order) {
    const list = buckets.get(id) || []
    if (!list.length) continue
    out.push({ kind: 'header', key: `hdr-${sectionKey}-${id}`, label: labelOf(id) })
    for (const field of list) {
      out.push({ kind: 'field', key: field.key, field })
    }
  }
  return out
}

/** 搜索结果按分区分组 */
export function groupSearchResultsBySection<
  T extends { section: { key: string; label: string }; field: { key: string } },
>(results: T[]): Array<{ sectionKey: string; sectionLabel: string; items: T[] }> {
  const map = new Map<string, { sectionKey: string; sectionLabel: string; items: T[] }>()
  for (const item of results) {
    const sk = item.section.key
    let bucket = map.get(sk)
    if (!bucket) {
      bucket = { sectionKey: sk, sectionLabel: item.section.label, items: [] }
      map.set(sk, bucket)
    }
    bucket.items.push(item)
  }
  return [...map.values()]
}

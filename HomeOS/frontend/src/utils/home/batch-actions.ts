/**
 * 全屋批量操作工具。
 *
 * 职责：按 domain 收集当前处于开启/打开状态的实体，并提供全屋批量关闭
 * （灯 / 窗帘 / 空调风扇 / 开关）。
 *
 * 依赖：
 * - @/stores/entities.store：实体状态读取与 service 调用
 * - @homeos/shared：getEntityDomain 提取实体 domain
 * - @/stores/layout.store：读取布局配置
 * - @/constants/whole-home-off：全屋关闭默认配置
 * - @/types/entity-store、@/types/whole-home-off：类型定义
 */
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDomain } from '@homeos/shared'
import { useLayoutStore } from '@/stores/layout.store'
import { getWholeHomeOffConfig } from '@/constants/whole-home-off'
import type { HaEntityState } from '@/types/entity-store'
import type { WholeHomeOffConfig } from '@/types/whole-home-off'

/** 全屋关闭可覆盖的配置项子集 */
type WholeHomeOffOptions = Partial<
  Pick<
    WholeHomeOffConfig,
    'lights' | 'covers' | 'climate' | 'switches' | 'excludeEntities' | 'entityIds'
  >
>

/**
 * 判断实体是否应被纳入批量操作（未被排除且在白名单内）。
 * @param id 实体 id
 * @param excludeSet 排除集合
 * @param whitelist 白名单（空表示不限）
 */
function shouldIncludeEntity(id: string, excludeSet: Set<string>, whitelist: string[]) {
  if (excludeSet.has(id)) return false
  if (whitelist.length > 0 && !whitelist.includes(id)) return false
  return true
}

/**
 * 遍历实体 store，收集满足 filterFn 条件的实体 id。
 * 自动跳过 unavailable / unknown 实体，并应用排除与白名单。
 * @param filterFn 过滤函数
 * @param excludeEntities 排除实体列表
 * @param entityIds 白名单（空表示不限）
 * @returns 符合条件的实体 id 列表
 */
function collectOnEntities(
  filterFn: (key: string, e: HaEntityState) => boolean,
  { excludeEntities = [], entityIds = [] }: { excludeEntities?: string[]; entityIds?: string[] } = {},
) {
  const store = useEntitiesStore()
  const excludeSet = new Set(excludeEntities)
  const whitelist = entityIds
  const list: string[] = []
  for (const key in store.entities) {
    const e = store.entities[key]
    if (e?.state === 'unavailable' || e?.state === 'unknown') continue
    if (!shouldIncludeEntity(key, excludeSet, whitelist)) continue
    if (filterFn(key, e)) list.push(key)
  }
  return list
}

/**
 * 解析全屋关闭配置：合并 layout 配置与传入覆盖项。
 * @param overrides 覆盖项
 * @returns 合并后的配置
 */
function resolveWholeHomeOffOptions(overrides: WholeHomeOffOptions = {}) {
  let cfg = getWholeHomeOffConfig({})
  try {
    cfg = getWholeHomeOffConfig(useLayoutStore().layoutConfig)
  } catch {
    /* store 尚未就绪 */
  }
  return {
    lights: overrides.lights ?? cfg.lights,
    covers: overrides.covers ?? cfg.covers,
    climate: overrides.climate ?? cfg.climate,
    switches: overrides.switches ?? cfg.switches,
    excludeEntities: overrides.excludeEntities ?? cfg.excludeEntities,
    entityIds: overrides.entityIds ?? cfg.entityIds,
  }
}

/**
 * 获取所有处于开启状态的灯实体 id。
 * @param options 配置覆盖项
 */
function getAllLightsOn(options: WholeHomeOffOptions = {}) {
  const opts = resolveWholeHomeOffOptions(options)
  return collectOnEntities((key, e) => key.startsWith('light.') && e.state === 'on', opts)
}

/**
 * 获取所有处于打开状态的窗帘实体 id。
 * @param options 配置覆盖项
 */
function getAllCoversOpen(options: WholeHomeOffOptions = {}) {
  const opts = resolveWholeHomeOffOptions(options)
  return collectOnEntities((key, e) => key.startsWith('cover.') && e.state === 'open', opts)
}

/**
 * 获取所有非关闭状态的空调/风扇实体 id。
 * @param options 配置覆盖项
 */
function getAllClimateOn(options: WholeHomeOffOptions = {}) {
  const opts = resolveWholeHomeOffOptions(options)
  return collectOnEntities(
    (key, e) => (key.startsWith('climate.') || key.startsWith('fan.')) && e.state !== 'off',
    opts,
  )
}

/**
 * 获取所有处于开启状态的开关实体 id。
 * @param options 配置覆盖项
 */
function getAllSwitchesOn(options: WholeHomeOffOptions = {}) {
  const opts = resolveWholeHomeOffOptions(options)
  return collectOnEntities((key, e) => key.startsWith('switch.') && e.state === 'on', opts)
}

/**
 * 全屋批量关闭：灯 / 窗帘 / 空调风扇 / 开关（读取 layout.wholeHomeOff，可传参覆盖）。
 * 各 service 调用以 quiet 模式执行，互不阻断；最后汇总成功/失败数。
 * @param overrides 配置覆盖项
 * @returns { total, ok, failed } 总数、成功数、失败数
 */
export async function turnOffWholeHome(overrides: WholeHomeOffOptions = {}) {
  const store = useEntitiesStore()
  const opts = resolveWholeHomeOffOptions(overrides)
  const tasks: Promise<unknown>[] = []

  if (opts.lights) {
    for (const id of getAllLightsOn(opts)) {
      tasks.push(store.callService('light', 'turn_off', id, undefined, false, { quiet: true }))
    }
  }
  if (opts.covers) {
    for (const id of getAllCoversOpen(opts)) {
      tasks.push(store.callService('cover', 'close_cover', id, undefined, false, { quiet: true }))
    }
  }
  if (opts.climate) {
    for (const id of getAllClimateOn(opts)) {
      const domain = getEntityDomain(id)
      // climate 设为 off 模式；fan 直接关闭
      const service = domain === 'climate' ? 'set_hvac_mode' : 'turn_off'
      const data = domain === 'climate' ? { hvac_mode: 'off' } : undefined
      tasks.push(store.callService(domain, service, id, data, false, { quiet: true }))
    }
  }
  if (opts.switches) {
    for (const id of getAllSwitchesOn(opts)) {
      tasks.push(store.callService('switch', 'turn_off', id, undefined, false, { quiet: true }))
    }
  }

  const results = await Promise.allSettled(tasks)
  const failed = results.filter((r) => r.status === 'rejected').length
  const ok = results.length - failed
  return { total: results.length, ok, failed }
}
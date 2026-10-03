/**
 * @file entity-store-optimistic.util.ts
 * @module frontend/src/stores
 * 实体 store 乐观更新（Optimistic UI）：domain/service 预测纯函数 + 有状态应用/回滚。
 * 由 utils/entity/optimistic.util.ts 的 predictOptimistic 与 entity-store-support.ts 的
 * createEntityOptimisticState 合并为完整模块（从 entity-store-support.ts 拆回）。
 */
import { toRaw } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import type { EntityOptimisticDeps, HaEntityState, OptimisticPrediction } from '@/types/entity-store'

/**
 * 根据 domain / service 预测实体的目标状态（乐观更新）。
 *
 * 处理逻辑：
 * - toggle：取反当前 state（on ↔ off）。
 * - 各域按 service 分别预测 state 与 attributes：
 *   - light：turn_on 时同步预测 brightness / color_temp / rgb_color 等。
 *   - climate：turn_on 时根据 hvac_modes 与当前 hvac_mode 预测目标模式。
 *   - cover / valve：open / close / set_position 预测 state 与 current_position。
 *   - media_player：play / pause / stop / volume_set / volume_mute 等预测。
 *   - 其他域（switch / fan / lock / vacuum / number / select 等）按各自语义预测。
 * - 无法预测时返回 null。
 *
 * @param domain 实体域。
 * @param service HA service 名。
 * @param entityId 实体 ID。
 * @param serviceData service 参数。
 * @param current 当前实体状态（用于 toggle 与 climate 模式推断）。
 * @returns 预测结果（含 state 与 / 或 attributes）；无法预测时返回 null。
 */
export function predictOptimistic(
  domain: string,
  service: string,
  entityId: string,
  serviceData: Record<string, unknown> | null | undefined,
  current: HaEntityState | null | undefined,
): OptimisticPrediction | null {
  const sd = serviceData || {}
  const attrs: Record<string, unknown> = {}
  let state: string | undefined

  if (service === 'toggle') {
    // 仅在当前状态明确为 on/off 时取反；unknown/unavailable/null 等未知状态不预测，避免产生假状态
    const cur = current?.state
    if (cur !== 'on' && cur !== 'off') return null
    state = cur === 'on' ? 'off' : 'on'
    return { state }
  }

  switch (domain) {
    case 'light':
      if (service === 'turn_off') state = 'off'
      else if (service === 'turn_on') {
        state = 'on'
        if (sd.brightness_pct != null)
          attrs.brightness = Math.round(Number(sd.brightness_pct) * 2.55)
        if (sd.brightness != null) attrs.brightness = sd.brightness
        if (sd.color_temp_kelvin != null) attrs.color_temp_kelvin = sd.color_temp_kelvin
        if (sd.color_temp != null) {
          attrs.color_temp = sd.color_temp
          attrs.color_temp_kelvin = Math.round(1000000 / Number(sd.color_temp))
        }
        if (sd.rgb_color) attrs.rgb_color = sd.rgb_color
      } else return null
      break
    case 'scene':
      if (service === 'turn_on' || service === 'turn_off') state = service === 'turn_on' ? 'on' : 'off'
      else return null
      break
    case 'switch':
    case 'input_boolean':
    case 'siren':
    case 'remote':
      if (service === 'turn_off') state = 'off'
      else if (service === 'turn_on') state = 'on'
      else return null
      break
    case 'fan':
      if (service === 'turn_off') state = 'off'
      else if (service === 'turn_on') {
        state = 'on'
        if (sd.percentage != null) attrs.percentage = sd.percentage
        if (sd.preset_mode != null) attrs.preset_mode = sd.preset_mode
      } else if (service === 'set_percentage' && sd.percentage != null) {
        state = Number(sd.percentage) > 0 ? 'on' : 'off'
        attrs.percentage = sd.percentage
      } else if (service === 'set_preset_mode' && sd.preset_mode != null) {
        attrs.preset_mode = sd.preset_mode
      } else if (service === 'set_timer') {
        if (sd.timer_option != null) attrs.timer_option = sd.timer_option
        else if (sd.timer != null) attrs.timer_option = sd.timer
        else return null
      } else return null
      break
    case 'humidifier':
      if (service === 'turn_off') state = 'off'
      else if (service === 'turn_on') state = 'on'
      else if (service === 'set_humidity' && sd.humidity != null) attrs.humidity = sd.humidity
      else return null
      break
    case 'water_heater':
      if (service === 'turn_off') state = 'off'
      else if (service === 'turn_on') state = 'on'
      else if (service === 'set_temperature' && sd.temperature != null)
        attrs.temperature = sd.temperature
      else if (service === 'set_operation_mode' && sd.operation_mode)
        state = String(sd.operation_mode)
      else return null
      break
    case 'cover':
      if (service === 'close_cover') state = 'closed'
      else if (service === 'open_cover') state = 'open'
      else if (service === 'set_cover_position' && sd.position != null)
        attrs.current_position = sd.position
      else return null
      break
    case 'valve':
      if (service === 'close_valve') state = 'closed'
      else if (service === 'open_valve') state = 'open'
      else if (service === 'set_position' && sd.position != null)
        attrs.current_position = sd.position
      else return null
      break
    case 'lock':
      if (service === 'lock') state = 'locked'
      else if (service === 'unlock') state = 'unlocked'
      else return null
      break
    case 'media_player':
      if (service === 'media_play') state = 'playing'
      else if (service === 'media_pause') state = 'paused'
      else if (service === 'media_stop' || service === 'turn_off')
        state = service === 'turn_off' ? 'off' : 'idle'
      else if (service === 'volume_set' && sd.volume_level != null) {
        attrs.volume_level = sd.volume_level
      } else if (service === 'volume_mute' && sd.is_volume_muted != null) {
        attrs.is_volume_muted = sd.is_volume_muted
      } else return null
      break
    case 'climate':
      if (service === 'turn_off') state = 'off'
      else if (service === 'turn_on') {
        const modes = current?.attributes?.hvac_modes
        const preferred = current?.attributes?.hvac_mode
        state =
          preferred && preferred !== 'off'
            ? String(preferred)
            : (Array.isArray(modes) ? modes.find((m) => m && m !== 'off') : null) || 'cool'
      } else if (service === 'set_hvac_mode' && sd.hvac_mode) state = String(sd.hvac_mode)
      else if (service === 'set_fan_mode' && sd.fan_mode) attrs.fan_mode = sd.fan_mode
      else if (service === 'set_temperature') {
        if (sd.temperature != null) attrs.temperature = sd.temperature
        if (sd.target_temp_low != null) attrs.target_temp_low = sd.target_temp_low
        if (sd.target_temp_high != null) attrs.target_temp_high = sd.target_temp_high
        if (sd.temperature == null && sd.target_temp_low == null && sd.target_temp_high == null)
          return null
      } else if (service === 'set_swing_mode' && sd.swing_mode) attrs.swing_mode = sd.swing_mode
      else if (service === 'set_preset_mode' && sd.preset_mode) attrs.preset_mode = sd.preset_mode
      else return null
      break
    case 'vacuum':
      if (service === 'start') state = 'cleaning'
      else if (service === 'return_to_base') state = 'returning'
      else if (service === 'stop' || service === 'pause') state = 'paused'
      else if (service === 'set_fan_speed' && sd.fan_speed) attrs.fan_speed = sd.fan_speed
      else return null
      break
    case 'number':
      if (service === 'set_value' && sd.value != null) state = String(sd.value)
      else return null
      break
    case 'input_number':
      if (service === 'set_value' && sd.value != null) state = String(sd.value)
      else return null
      break
    case 'select':
    case 'input_select':
      if (service === 'select_option' && sd.option) state = String(sd.option)
      else return null
      break
    default:
      if (service === 'turn_off') state = 'off'
      else if (service === 'turn_on') state = 'on'
      else return null
  }

  const result: OptimisticPrediction = {}
  if (state !== undefined) result.state = state
  if (Object.keys(attrs).length) result.attributes = attrs
  return Object.keys(result).length ? result : null
}

// ── entity-store-optimistic.util ──
/** OptimisticEntry：类型定义，字段语义见声明。 */
export interface OptimisticEntry {
  backup: HaEntityState | null
  timer: ReturnType<typeof setTimeout>
  /** 乐观预测期望（state/attributes 并集）：用于 WS 推送确认时判断是否与预测一致（B4） */
  expected?: OptimisticPrediction
}

/**
 * 实体 store 乐观更新（Optimistic UI）
 */
export function createEntityOptimisticState({
  entities,
  optimisticTtlMs,
  patchDerivedChanges,
  patchProjectionsFromChanges,
  emitStateListeners,
  bumpEntityStateRevision,
}: EntityOptimisticDeps) {
  const optimisticState = new Map<string, OptimisticEntry>()

  function applyOptimistic(entityId: string, predicted: OptimisticPrediction): void {
    const cur = entities[entityId] || null
    const existing = optimisticState.get(entityId)
    // 乐观备份对 attributes 做浅拷贝，避免与主缓存共享引用被后续合并污染
    const rawCur = cur ? toRaw(cur) : null
    const backup = existing
      ? existing.backup
      : rawCur
        ? { ...rawCur, attributes: { ...(rawCur.attributes || {}) } }
        : null
    if (existing?.timer) clearTimeout(existing.timer)

    // 累计期望目标（state/attributes 并集）：连续多次乐观调用（如先开灯再调亮度）时
    // 期望为各次预测的并集，任一服务端推送达到最终目标即视为确认
    const expected: OptimisticPrediction = {
      state: predicted.state !== undefined ? predicted.state : existing?.expected?.state,
      attributes: {
        ...(existing?.expected?.attributes || {}),
        ...(predicted.attributes || {}),
      },
    }

    const merged: HaEntityState = cur
      ? {
          ...cur,
          ...(predicted.state !== undefined ? { state: predicted.state } : {}),
          attributes: { ...(cur.attributes || {}), ...(predicted.attributes || {}) },
          _optimistic: true,
        }
      : {
          entity_id: entityId,
          state: predicted.state ?? 'unknown',
          attributes: predicted.attributes || {},
          _optimistic: true,
        }

    entities[entityId] = merged
    patchDerivedChanges([{ entity_id: entityId, oldEntity: cur, newEntity: merged }])
    patchProjectionsFromChanges([{ entity_id: entityId }], entities)
    emitStateListeners(entityId, merged, cur)
    bumpEntityStateRevision(entityId)

    // TTL 到期仍未收到服务端（WS）确认：回滚到最后一次确认的服务端状态，
    // 与字段说明「超时后等待服务端确认」一致，避免长期展示未确认的预测态
    const timer = setTimeout(() => {
      const c = entities[entityId]
        if (c && c._optimistic) {
          const prev: HaEntityState = { ...toRaw(c) }
          if (backup) {
            entities[entityId] = backup
            patchDerivedChanges([{ entity_id: entityId, oldEntity: prev, newEntity: backup }])
            patchProjectionsFromChanges([{ entity_id: entityId }], entities)
            emitStateListeners(entityId, backup, prev)
          } else {
            // 与 rollbackOptimistic 语义统一：无备份（乐观新建实体）时删除实体，
            // 而非仅剥离乐观标记残留幽灵实体，避免派生索引与实体表不一致
            delete entities[entityId]
            patchDerivedChanges([{ entity_id: entityId, oldEntity: prev, newEntity: null }])
            emitStateListeners(entityId, null, prev)
          }
          bumpEntityStateRevision(entityId)
          useChromeStore().notify('未生效，已恢复', 'warning')
        }
      optimisticState.delete(entityId)
    }, optimisticTtlMs())
    optimisticState.set(entityId, { backup, timer, expected })
  }

  function clearOptimistic(entityId: string): void {
    const e = optimisticState.get(entityId)
    if (!e) return
    if (e.timer) clearTimeout(e.timer)
    optimisticState.delete(entityId)
  }

  function rollbackOptimistic(entityId: string): void {
    const e = optimisticState.get(entityId)
    if (!e) return
    if (e.timer) clearTimeout(e.timer)
    optimisticState.delete(entityId)
    const cur = entities[entityId]
    if (cur && cur._optimistic) {
      const optimisticSnapshot: HaEntityState = { ...toRaw(cur) }
      if (e.backup) {
        entities[entityId] = e.backup
        patchDerivedChanges([
          { entity_id: entityId, oldEntity: optimisticSnapshot, newEntity: e.backup },
        ])
        patchProjectionsFromChanges([{ entity_id: entityId }], entities)
        emitStateListeners(entityId, e.backup, optimisticSnapshot)
      } else {
        delete entities[entityId]
        patchDerivedChanges([
          { entity_id: entityId, oldEntity: optimisticSnapshot, newEntity: null },
        ])
        emitStateListeners(entityId, null, optimisticSnapshot)
      }
      bumpEntityStateRevision(entityId)
    }
  }

  /** 回滚全部未确认乐观态（队列丢弃 / 背压重同步时调用） */
  function rollbackAllOptimistic(): number {
    const ids = [...optimisticState.keys()]
    for (const id of ids) rollbackOptimistic(id)
    return ids.length
  }

  return {
    applyOptimistic,
    clearOptimistic,
    rollbackOptimistic,
    rollbackAllOptimistic,
    optimisticState,
  }
}

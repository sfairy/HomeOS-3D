/**
 * 安防布防/撤防结果的纯函数解读（无外部依赖，便于独立回归测试）。
 *
 * 与 `panel-arm.util.ts` 分离的原因：后者会 import API / 触感反馈模块，
 * 在 Node 的纯函数测试里无法解析 `@/` 别名。这里只保留「把后端结果翻译成
 * 用户可读结论」的逻辑。
 */

/** 布防/撤防 API 响应结果 */
export interface SecurityArmResult {
  success?: boolean
  mode?: string
  /** 是否跳过（如当前已是目标模式） */
  skipped?: boolean
  /** 模式已提交但联动有失败（撤防 fail-open） */
  degraded?: boolean
  /** 模式是否已落库；`false` 表示只改了内存，重启会回退到上一次成功落库的模式 */
  persisted?: boolean
  actions?: { executed?: number; failed?: number }
  /** 实际执行成功的联动条数 */
  appliedCount?: number
  /** 布防失败后被回滚的联动条数 */
  compensated?: number
  failedItems?: Array<{ entity_id?: string; message?: string }>
  /** 补偿动作自身失败的条目（二次告警，不能吞） */
  compensationFailures?: Array<{ entity_id?: string; message?: string }>
  /** 已经执行且无法撤销的联动（scene / script / button 等） */
  irreversibleItems?: Array<{ entity_id?: string; service?: string }>
}

/**
 * 把「已执行 / 未执行 / 已补偿」压成一行给安防页显示。
 *
 * 布防失败时用户最需要的不是「失败」两个字，而是「哪些设备被改过、有没有改回来」。
 */
export function describeSecurityArmItems(data?: SecurityArmResult): string {
  if (!data) return ''
  const parts: string[] = []
  const applied = Number(data.appliedCount ?? data.actions?.executed ?? 0)
  const failed = Number(data.actions?.failed ?? 0)
  if (applied > 0) parts.push(`已执行 ${applied} 条`)
  if (failed > 0) parts.push(`未执行 ${failed} 条`)
  const compensated = Number(data.compensated ?? 0)
  if (compensated > 0) parts.push(`已补偿 ${compensated} 条`)
  const failedNames = (data.failedItems || [])
    .map((item) => item.entity_id || item.message || '')
    .filter(Boolean)
    .slice(0, 3)
  if (failedNames.length) parts.push(`失败设备：${failedNames.join('、')}`)
  const irreversible = (data.irreversibleItems || [])
    .map((item) => item.entity_id || '')
    .filter(Boolean)
    .slice(0, 3)
  if (irreversible.length) parts.push(`不可撤销：${irreversible.join('、')}`)
  if ((data.compensationFailures || []).length) parts.push('补偿未完成，请检查 HA')
  return parts.join('｜')
}

/** 给 UI 层的布防/撤防结果解读 */
export type SecurityArmUiOutcome =
  | { kind: 'failed'; message: string }
  | { kind: 'partial'; message: string }
  | { kind: 'skipped' }
  | { kind: 'ok' }

/**
 * 解读布防/撤防 API 结果，供总览页与浮动 widget 共用提示文案。
 *
 * - 布防 fail-closed：`success===false` → failed
 * - 撤防 fail-open：模式已是 disarmed 但联动失败 → partial（警告，非错误）
 * - `degraded` 且 success → partial
 * - `persisted===false`：模式已生效但没落库 → 仍按已生效提示，不谎报失败
 */
export function interpretSecurityArmResult(
  requestedMode: string,
  modeLabel: string,
  data?: SecurityArmResult,
): SecurityArmUiOutcome {
  const failed = data?.actions?.failed ?? 0
  const committedDisarm = data?.mode === 'disarmed' && requestedMode === 'disarmed'
  const persistWarning = '（未能写入本机存储，重启后可能回退）'

  if (data?.success === false && !committedDisarm) {
    const detail = describeSecurityArmItems(data)
    return {
      kind: 'failed',
      message:
        (failed > 0
          ? `${modeLabel}未生效：${failed} 条联动失败，布防已取消`
          : `${modeLabel}未生效`) + (detail ? `（${detail}）` : ''),
    }
  }

  if (data?.skipped) return { kind: 'skipped' }

  if (data?.degraded || (committedDisarm && failed > 0)) {
    const detail = describeSecurityArmItems(data)
    return {
      kind: 'partial',
      message:
        (requestedMode === 'disarmed'
          ? failed > 0
            ? `已撤防，但 ${failed} 条联动失败`
            : '已撤防，但部分联动未完成'
          : failed > 0
            ? `${modeLabel}已生效，但 ${failed} 条联动失败`
            : `${modeLabel}已生效，但部分联动未完成`) +
        (detail ? `（${detail}）` : '') +
        (data?.persisted === false ? persistWarning : ''),
    }
  }

  // 模式已生效但没落库：不能当完全成功（重启会回退），也不该谎报失败。
  if (data?.persisted === false) {
    return {
      kind: 'partial',
      message:
        requestedMode === 'disarmed' ? `已撤防${persistWarning}` : `${modeLabel}已生效${persistWarning}`,
    }
  }

  return { kind: 'ok' }
}

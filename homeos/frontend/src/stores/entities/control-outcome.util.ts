/**
 * 控制响应的语义归约（纯函数，无依赖，便于单测）。
 *
 * 三条控制入口（`/services/call`、`/ha/services/call`、`/modules/interaction3d/control`）
 * 现在共用后端同一套判据：`ok` 表示「可以按成功展示」，`pending` / `skipped` / `verified`
 * 各自独立。前端必须按这套字段判定，而不是「HTTP 200 就是成功」——
 * 后者在幂等键命中（首次请求仍在下发）与实体被跳过时都会误报成功。
 *
 * 放在独立模块的理由：这段逻辑是 P0 契约，必须能被 `node --test` 直接导入验证，
 * 而 `entity-store-actions.ts` 依赖 Pinia / Vue / chrome store，无法单独加载。
 */

/** 控制响应的关键字段（三条入口共用同一份语义）。 */
export interface ControlPayload {
  ok?: boolean
  skipped?: boolean
  pending?: boolean
  replayed?: boolean
  queued?: boolean
  verified?: boolean | null
  verification?: { reason?: string; observedState?: string | null }
  data?: { skipped?: boolean }
}

export interface ControlOutcome {
  skipped: boolean
  verifyFailed: boolean
  /** 是否应回滚乐观态：被跳过 / 明确不符 / 后端判不可成功（pending 例外）。 */
  shouldRollback: boolean
}

/**
 * 把控制响应归约成三个判定。
 *
 * ``ok === false`` 是后端统一判据（「不能按成功展示」）；以前各入口自己拍，``/ha`` 恒为
 * 成功，幂等键命中仍在 inflight 时前端会以为已生效。``pending`` 例外：首次请求还在下发，
 * 乐观态应当保留并等待推送，所以不触发回滚。
 */
export function describeControlOutcome(payload: ControlPayload | null): ControlOutcome {
  const skipped = !!(payload?.skipped || payload?.data?.skipped)
  const verifyFailed = payload?.verified === false
  const pending = !!payload?.pending
  const rejected = payload?.ok === false
  // ``pending`` 一律不回滚：这条命令是「首次请求仍在下发」，不是失败也不是跳过。
  // 后端早期在 pending 里也带 ``skipped: true``（已修正），但旧 bundle 与第三方发射方
  // 仍可能出现该组合 —— 这里做纵深防御，否则「连点两次」会先恢复再跳变。
  return { skipped, verifyFailed, shouldRollback: !pending && (skipped || verifyFailed || rejected) }
}

export interface ControlNotice {
  message: string
  level: 'info' | 'warning'
}

interface ControlNoticeRule extends ControlNotice {
  match: (payload: ControlPayload, outcome: ControlOutcome) => boolean
}

/**
 * 控制结果 → 一条用户提示（优先级从高到低，命中第一条即返回）。
 *
 * 用列表而不是 if/else 链：顺序即优先级，加一条提示不需要再动判定结构。
 * 「没有可说的」返回 ``null``（例如 verified=null 的未知态，提示只会变成噪声）。
 */
const CONTROL_NOTICES: ReadonlyArray<ControlNoticeRule> = [
  {
    // 首次请求仍在下发中：结果未知，不能报「已生效」。
    match: (payload) => !!payload.pending,
    message: '相同指令正在下发中，请稍后确认设备状态',
    level: 'info',
  },
  {
    // verified:false 只代表「响应明确显示状态不符」；null（未知）不提示，避免噪声。
    match: (_payload, outcome) => outcome.verifyFailed,
    message: '指令已下发，但设备状态与预期不符',
    level: 'warning',
  },
  { match: (_payload, outcome) => outcome.skipped, message: '重复命令已跳过', level: 'info' },
  { match: (payload) => !!payload.queued, message: '命令已通过重连队列送达', level: 'info' },
  { match: (payload) => payload.ok === false, message: '指令未生效，已恢复设备状态', level: 'warning' },
]

/** 取该控制结果对应的提示；没有可说的返回 ``null``。 */
export function resolveControlNotice(payload: ControlPayload, outcome: ControlOutcome): ControlNotice | null {
  const rule = CONTROL_NOTICES.find((entry) => entry.match(payload, outcome))
  return rule ? { message: rule.message, level: rule.level } : null
}

/**
 * 门面板的状态机文案（0.9.0 `cover-panel.js` 的 `doorOpener` 分支）。
 *
 * ## 为什么门面板不能复用窗帘的文案
 *
 * 窗帘报 `open / closed / opening / closing` 四态，文案是「已开启 / 已关闭 / 正在开启 / 正在关闭」。
 * 门机多出两个窗帘没有的信息维度：
 *
 * 1. **指令是否被受理**（「已发送 · 等待门磁回报」）—— 门机常不回报位置，用户必须知道
 *    「发了但还没确认」和「发了却没人应答」是两件事；
 * 2. **开度是否已知**（「门已打开 · 开度未知」）—— 门磁只能给开/关，给不出 73%。
 *
 * 所以门面板的文案是**状态 × 确认 × 可用性**的组合，不是单一状态映射。
 * 把它写成一个纯函数，组合规则才能逐条断言。
 */

/** 面板按钮的可用性。 */
export type DoorPanelControls = {
  canOpen: boolean
  canClose: boolean
  /** 点动型：只能触发，不能区分开/关。 */
  canPulse: boolean
  canStop: boolean
}

/** 面板状态输入的三个维度。 */
export type DoorPanelInput = {
  /** 门磁/开门器给出的开合（`null` = 未匹配）。 */
  doorOpen: boolean | null
  /** 是否有确定开度（门磁只给开关，没有百分比）。 */
  positionKnown: boolean
  /** 开门器实体是否可用。 */
  openerAvailable: boolean
  /** 门机开关实体本身是否可用（0.9.0 另起一档：标题后追加「 · 开关不可用」）。 */
  switchAvailable?: boolean
  /** 门磁读数（三态）：与 `doorOpen` 不一致时提示「请核对门或设备回报」。 */
  contactOpen?: boolean | null
  /** 点动型开关是否仍在等复位。 */
  waitingForReset: boolean
  /** 是否有在途指令（已下发、还没收到回报）。 */
  awaitingReport: boolean
  /** 配置的是点动型还是保持型。 */
  momentary: boolean
  /** 目标开度（0–100），只在有在途指令且保持型时有意义。 */
  targetPosition?: number | null
}

/** 面板主标题文案。 */
export function doorPanelLabel(input: DoorPanelInput): string {
  // 1) 在途指令优先：用户刚点了按钮，最想知道「到底发出去没有」。
  if (input.awaitingReport) return input.doorOpen === null ? '已发送 · 门状态未知' : '已发送 · 等待门磁回报'
  // 2) 门机不可用：这时谈开合没有意义，先把「点不动」的原因说清楚。
  if (!input.openerAvailable)
    return input.doorOpen === null
      ? '门状态未知'
      : input.doorOpen
        ? '门已打开 · 开门器不可用'
        : '门已关闭 · 开门器不可用'
  // 3) 未匹配：门磁没给可识别状态。
  if (input.doorOpen === null) return '门状态未确认'
  // 4) 已匹配但开度未知：只有门磁、没有位置回报的常见情形。
  if (input.doorOpen && !input.positionKnown) return '门已打开 · 开度未知'
  return input.doorOpen ? '门已打开' : '门已关闭'
}

/** 0.9.0：开关实体掉线时追加的后缀（与「开门器不可用」是两档）。 */
export const DOOR_SWITCH_UNAVAILABLE_SUFFIX = ' · 开关不可用'

/**
 * 面板最终标题：`doorPanelLabel` + 可选的「开关不可用」后缀。
 *
 * 分成两级是为了让「门没配好」与「HA 实体掉了」在文案上可区分 —— 前者要重新配置，
 * 后者等设备恢复即可，合成一句会让用户去改本来没问题的配置。
 */
export function doorPanelTitle(input: DoorPanelInput): string {
  const label = doorPanelLabel(input)
  return input.switchAvailable === false ? label + DOOR_SWITCH_UNAVAILABLE_SUFFIX : label
}

/** 主按钮文案（保持型给「开门 / 关门」，点动型给「触发门机」）。 */
export function doorPanelPrimaryAction(input: DoorPanelInput): string {
  if (input.momentary) return '触发门机'
  if (input.awaitingReport) return '正在发送'
  return input.doorOpen === true ? '关门' : '开门'
}

/** 副按钮文案：停止只在有在途指令或门在动时出现。 */
export function doorPanelSecondaryAction(input: DoorPanelInput): string {
  return input.awaitingReport ? '等待门磁回报' : '停止'
}

/** 目标开度的展示文案（只在保持型 + 有目标时给）。 */
export function doorPanelTargetLabel(input: DoorPanelInput): string {
  if (input.momentary || !Number.isFinite(input.targetPosition ?? NaN)) return ''
  return '目标 ' + Math.round(input.targetPosition as number) + '%'
}

/** 按钮可用性。 */
export function doorPanelControls(input: DoorPanelInput): DoorPanelControls {
  // 点动型在等复位期间一律禁用：再发一次会反向。
  const ready = input.openerAvailable && !(input.momentary && input.waitingForReset)
  if (input.momentary) return { canOpen: ready, canClose: false, canPulse: ready, canStop: false }
  return {
    // 已经在目标态就别再给同一个按钮（点了也没反馈）。
    canOpen: ready && input.doorOpen !== true,
    canClose: ready && input.doorOpen !== false,
    canPulse: false,
    // 静止且在目标态的「停止」是空操作；门在动（开度未知或未匹配）时才可能有用。
    canStop: input.openerAvailable && (input.awaitingReport || input.doorOpen === null),
  }
}

/** 门面板的「开门器 vs 门磁」一致性提示（0.9.0 `cover-panel.js`）。
 *
 * 两个读数都**明确**且互相矛盾时才算不一致：
 * - 任一侧是 `null`（没门磁 / 门磁没匹配上）→ 不提示，那是「未确认」，不是「矛盾」；
 * - 点动型在等复位时也不提示 —— 那期间门磁本来就会短暂滞后。
 */
export function doorContactMismatchNotice(
  openerOpen: boolean | null,
  contactOpen: boolean | null,
  waitingForReset = false,
): string {
  if (waitingForReset) return ''
  if (openerOpen === null || contactOpen === null) return ''
  return openerOpen === contactOpen ? '' : '开门器与门磁状态不一致，请核对门或设备回报。'
}

/** 不可用原因（面板角标）。空串 = 可用。 */
export function doorPanelUnavailableReason(input: DoorPanelInput): string {
  // 0.9.0 的两档原因：这台门没配好（无开门器） / 点动开关还在复位。
  // 开关实体本身掉线时的「 · 开关不可用」由面板在标题后追加，不走这里。
  if (!input.openerAvailable) return '开门器不可用'
  if (input.momentary && input.waitingForReset) return '等待开关复位'
  return ''
}

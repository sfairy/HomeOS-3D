/**
 * 交互控制类请求的超时预算，以及"滑条拖动 → 提交"的防抖反馈。
 *
 * 这个模块只关心**时间**，不碰 DOM：
 * - `interaction3dControlTimeout` 给一次 HA 服务调用算一个合理的等待上限；
 * - `createRangeFeedback` 让滑条在拖动过程中先本地预览、停手后再真正下发，
 *   避免每移动一像素就发一次命令（HA 侧会排队，设备反而跟不上）。
 */

/** 一次控制请求所需的毫秒预算（前端用它决定"按钮转圈多久后报超时"）。 */
type ControlTarget = {
  domain?: string;
  service?: string;
  data?: Record<string, any>;
};

/** 默认超时：12 秒（0.7.8 `0x2ee0`），慢设备由各面板自己的回执逻辑兜底。 */
const DEFAULT_CONTROL_TIMEOUT = 12_000;
/** 慢服务超时：120 秒（0.7.8 `0x1d4c0`，AI 生图 / 语音提问 / 固件安装）。 */
const SLOW_CONTROL_TIMEOUT = 120_000;
/** 学习指令时单条指令的默认等待（秒）。 */
const DEFAULT_LEARN_WAIT_SECONDS = 60;
/** 学习指令一次最多算 64 条，避免异常输入算出天文数字。 */
const MAX_LEARN_COMMANDS = 64;
/**
 * 学习指令的固定开销（秒）：建连 + 回读状态。
 *
 * 前端取 20 秒（0.7.8 `+0x14`），比后端 `_remote_learning_timeout` 的 15 秒多留 5 秒，
 * 避免「前端先报超时、后端其实还在等」。两边不要往一起对齐。
 */
const LEARN_OVERHEAD_SECONDS = 20;

function isSlowService(domain?: string, service?: string) {
  return (
    domain === "ai_task" ||
    (domain === "assist_satellite" && service === "ask_question") ||
    (domain === "update" && service === "install")
  );
}

/**
 * 计算一次交互控制请求的超时（毫秒）。
 *
 * 红外 / 射频学习是唯一"耗时随参数变化"的服务：用户可能一次录多条指令，
 * 射频还要正反两个相位。算法与后端 `_remote_learning_timeout` 保持一致，
 * 否则会出现"前端已经报超时，后端还在等"的错位。
 */
export function interaction3dControlTimeout(target: ControlTarget = {}): number {
  const { domain, service, data = {} } = target;
  if (domain === "remote" && service === "learn_command") {
    const wait =
      typeof data.timeout === "number" && Number.isFinite(data.timeout) && data.timeout > 0
        ? Math.min(60, data.timeout)
        : DEFAULT_LEARN_WAIT_SECONDS;
    const commands = Array.isArray(data.command)
      ? Math.max(1, Math.min(MAX_LEARN_COMMANDS, data.command.length))
      : 1;
    const phases = data.command_type === "rf" ? 2 : 1;
    return (wait * commands * phases + LEARN_OVERHEAD_SECONDS) * 1000;
  }
  return isSlowService(domain, service) ? SLOW_CONTROL_TIMEOUT : DEFAULT_CONTROL_TIMEOUT;
}

type RangeFeedbackOptions = {
  /** 超时后回调：一般用来刷新一次状态，把滑条拉回设备的真实值。 */
  onChange?: () => void;
  /** 超时触发：调用方通常在这里提示"设备未响应"。 */
  onTimeout?: (key: string) => void;
  /** 从提交到"认定设备已跟上"的等待（毫秒）。 */
  timeout?: number;
};

type RangeEntry = {
  value: number;
  committed: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/**
 * 滑条的本地预览状态。
 *
 * 关键语义：**已提交但设备还没回显**时，滑条不能立刻跳回旧值 —— 否则用户会看到
 * 数值"弹回去"再跳回来。`read()` 在设备回显接近提交值时清掉挂起状态，
 * 超过 `timeout` 仍没回显则回落到设备值并通知调用方。
 */
export function createRangeFeedback({
  onChange = () => {},
  onTimeout = () => {},
  timeout = 10_000,
}: RangeFeedbackOptions = {}) {
  const entries = new Map<string, RangeEntry>();

  function clear(key: string, only?: RangeEntry) {
    const entry = entries.get(key);
    if (!entry || (only && entry !== only)) return;
    if (entry.timer) clearTimeout(entry.timer);
    entries.delete(key);
  }

  return {
    /** 拖动中：只记本地值，不发命令。 */
    preview(key: string, value: any) {
      clear(key);
      entries.set(key, { value: Number(value), committed: false });
    },
    /** 停手：记录提交值并开始等设备回显。 */
    commit(key: string, value: any) {
      clear(key);
      const entry: RangeEntry = { value: Number(value), committed: true };
      entries.set(key, entry);
      entry.timer = setTimeout(() => {
        if (entries.get(key) !== entry) return;
        clear(key);
        onTimeout(key);
        onChange();
      }, timeout);
      return entry;
    },
    /**
     * 读取滑条应显示的值：
     * - 设备值已追上提交值 → 清掉挂起状态，用设备值；
     * - 仍在等待 → 用本地提交值（避免回弹）；
     * - 没有挂起状态 → 直接用设备值。
     */
    read(key: string, deviceValue: any, tolerance = 0.001): any {
      const entry = entries.get(key);
      if (
        entry?.committed &&
        Number.isFinite(deviceValue) &&
        Math.abs(deviceValue - entry.value) <= tolerance
      ) {
        clear(key);
        return deviceValue;
      }
      return entry?.value ?? deviceValue;
    },
    /** 取消某个 key 的挂起状态（可选只取消某一条记录）。 */
    cancel(key: string, entry?: RangeEntry) {
      clear(key, entry);
    },
    /** 取消"未提交"的预览值；已提交的继续等回显。 */
    cancelPreview(key: string) {
      if (!entries.get(key)?.committed) clear(key);
    },
    /** 全部清空（面板销毁 / 切换设备时调用）。 */
    reset() {
      for (const key of entries.keys()) clear(key);
    },
  };
}

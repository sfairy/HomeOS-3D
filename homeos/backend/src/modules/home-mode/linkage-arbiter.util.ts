/**
 * 家庭模式联动仲裁器（HomeModeLinkageArbiter）。
 *
 * 职责：在多源激活（手动 / 语音 / Agent / 安防 / 天气 / 日历 / 在场 / 能源 / 触发器）
 *  之间仲裁优先级，避免天气红警、能源预算等低优先级联动无声覆盖用户手动模式。
 *  - 手动源（manual / voice / agent）获得 manualLock TTL，期间拒绝非人工源激活。
 *  - 非手动源获得 claim TTL，优先级低于当前占用者时拒绝。
 *  由 HomeModeService 持有实例，在 activate / deactivate 时调用 tryAcquire / release。
 */

/** 数值越大优先级越高；未列出的 source 视为低优先级 */
const HOME_MODE_LINKAGE_PRIORITY: Record<string, number> = {
  manual: 100,
  voice: 95,
  agent: 90,
  security: 80,
  weather_linkage: 70,
  calendar: 60,
  presence: 55,
  everyone_left: 55,
  energy_linkage: 40,
  advisor: 30,
  trigger: 25,
  time: 20,
  automation: 20,
  entity: 20,
  deactivate: 10,
};

const DEFAULT_CLAIM_TTL_MS = 15 * 60_000;
const DEFAULT_MANUAL_LOCK_MS = 30 * 60_000;

type LinkageClaim = {
  source: string;
  priority: number;
  until: number;
  userLocked: boolean;
};

type ArbiterDecision = { ok: true } | { ok: false; reason: string };

/**
 * HomeModeLinkageArbiter：类声明。
 * - 所属文件：backend/src/modules/home-mode/linkage-arbiter.util.ts；
 * - 主要用途：封装域内职责的可复用类结构；
 * - 构造参数见 constructor 依赖注入列表；
 */
export class HomeModeLinkageArbiter {
  private claim: LinkageClaim | null = null;

  getClaim(): LinkageClaim | null {
    this.prune();
    return this.claim;
  }

  /** 停用模式或显式释放时调用 */
  release(): void {
    this.claim = null;
  }

  /**
   * 尝试占用激活权。
   * - 手动锁定期内拒绝非人工源（manual/voice/agent）
   * - 优先级低于当前占用者则拒绝
   */
  tryAcquire(
    source: string | undefined,
    opts?: { claimTtlMs?: number; manualLockMs?: number; now?: number },
  ): ArbiterDecision {
    const now = opts?.now ?? Date.now();
    this.prune(now);
    const src = String(source || 'trigger').trim() || 'trigger';
    const priority = HOME_MODE_LINKAGE_PRIORITY[src] ?? 15;

    if (this.claim?.userLocked && !isUserDrivenSource(src)) {
      return { ok: false, reason: `用户手动锁定中（来源 ${this.claim.source}）` };
    }
    if (this.claim && priority < this.claim.priority) {
      return {
        ok: false,
        reason: `联动优先级不足（${src}<${this.claim.source}）`,
      };
    }

    const manualLockMs = opts?.manualLockMs ?? DEFAULT_MANUAL_LOCK_MS;
    const claimTtlMs = opts?.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;
    const userLocked = isUserDrivenSource(src);
    const ttl = userLocked ? Math.max(claimTtlMs, manualLockMs) : claimTtlMs;
    this.claim = {
      source: src,
      priority,
      until: now + ttl,
      userLocked,
    };
    return { ok: true };
  }

  private prune(now = Date.now()) {
    if (this.claim && this.claim.until <= now) this.claim = null;
  }
}

/** 判断来源是否为用户主动操作（manual / voice / agent），用于 manualLock TTL 判定 */
function isUserDrivenSource(source: string): boolean {
  return source === 'manual' || source === 'voice' || source === 'agent';
}

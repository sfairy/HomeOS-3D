/**
 * 分类切换（light / environment / devices / vacuum / security）的性能采样。
 *
 * 只在一次分类过渡期间统计，过渡结束把「帧数 / 最大帧耗时 / 最大帧间隔 / 首帧延迟 /
 * 慢帧数 / 各渲染通道帧数」聚合成一次 `category-transition-profile` 上报；
 * 任何一项超过阈值就降级成 `category-transition-slow`，方便在日志里直接筛出卡顿户型。
 *
 * 判定阈值（0.8.4 原值）：
 * - `max(stageGapMaxMs, renderGapMaxMs, applyMs) >= 50` → 慢
 * - `renderMaxMs >= 34` 或 `stageMaxMs >= 34` → 慢
 */

/** 一次采样的累计值；键名同时是上报负载的字段名。 */
export type CategoryTransitionCounts = {
  fromCategory: number;
  toCategory: number;
  applyMs: number;
  stageFrames: number;
  stageMaxMs: number;
  stageGapMaxMs: number;
  renderFrames: number;
  renderMaxMs: number;
  renderGapMaxMs: number;
  firstRenderMs: number;
  slowRenderFrames: number;
  drawMax: number;
  motionFrames: number;
  effectFrames: number;
  snapshotFrames: number;
  cameraFrames: number;
};

type CategoryTransitionSession = {
  started: number;
  lastStage: number | null;
  lastRender: number | null;
  counts: CategoryTransitionCounts;
};

export type CategoryTransitionDiagnostics = {
  /** 开始一次过渡；若上一次还没收尾，先按 `endReason=1`（被取代）上报。 */
  begin: (fromCategory: number, toCategory: number) => void;
  /** 分类状态已应用：记录 from→to 的纯应用耗时。 */
  applied: () => void;
  /** 取本帧开始时间戳；没有采样会话时返回 null（调用方直接透传即可）。 */
  startFrame: () => number | null;
  /** 本帧的舞台更新结束：`final` 为真表示这是过渡的最后一帧（收尾并上报）。 */
  stage: (startedAtMs: number | null, final: boolean) => void;
  /** 本帧的 GL 渲染结束；`path` 0=直绘 1=运动 2=特效。 */
  render: (
    startedAtMs: number | null,
    options?: { calls?: number; path?: number; cameraMoving?: boolean; snapshot?: boolean },
  ) => void;
  /** 放弃当前采样（例如页面不可见），不上报。 */
  cancel: () => void;
  dispose: () => void;
};

/** 慢帧阈值：单帧超过这个耗时算「慢帧」。 */
const SLOW_RENDER_MS = 34;
/** 过渡总耗时 / 间隔的慢判定阈值。 */
const SLOW_TRANSITION_MS = 50;
/** 上报前把耗时截到 0.1ms，避免负载里出现浮点噪声。 */
const roundMs = (milliseconds: number) => Math.round(Math.max(0, milliseconds) * 10) / 10;

export function createCategoryTransitionDiagnostics({
  report: report,
  now: now = () => performance.now(),
  schedule: schedule = (onAnimationFrame: any) => requestAnimationFrame(onAnimationFrame),
  cancel: cancel = (animationFrameHandle: any) => cancelAnimationFrame(animationFrameHandle),
}: {
  report?: (code: string, payload: Record<string, any>) => void;
  now?: () => number;
  schedule?: (callback: any) => any;
  cancel?: (handle: any) => void;
} = {}): CategoryTransitionDiagnostics {
  let session: CategoryTransitionSession | null = null,
    frameHandle: any = null,
    isDisposed = false;
  /**
   * 收尾并上报。
   *
   * @param endReason 0=自然结束（最后一帧）/ 1=被新的过渡取代
   */
  function flush(endReason = 0) {
    (frameHandle !== null && cancel(frameHandle), (frameHandle = null));
    const endedSession = session;
    if (((session = null), !endedSession)) return;
    const payload = {
        ...endedSession.counts,
        durationMs: roundMs(now() - endedSession.started),
        endReason: endReason,
      },
      isSlow =
        Math.max(payload.stageGapMaxMs, payload.renderGapMaxMs, payload.applyMs) >= SLOW_TRANSITION_MS ||
        payload.renderMaxMs >= SLOW_RENDER_MS ||
        payload.stageMaxMs >= SLOW_RENDER_MS;
    try {
      report?.(
        isSlow ? "category-transition-slow" : "category-transition-profile",
        payload as unknown as Record<string, any>,
      );
    } catch { /* 上报 / 观测类调用是 best-effort：观测通道失败不应中断业务主流程 */ }
  }
  return {
    begin(fromCategory, toCategory) {
      if (isDisposed) return;
      flush(1);
      session = {
        started: now(),
        lastStage: null,
        lastRender: null,
        counts: {
          fromCategory: fromCategory,
          toCategory: toCategory,
          applyMs: 0,
          stageFrames: 0,
          stageMaxMs: 0,
          stageGapMaxMs: 0,
          renderFrames: 0,
          renderMaxMs: 0,
          renderGapMaxMs: 0,
          firstRenderMs: 0,
          slowRenderFrames: 0,
          drawMax: 0,
          motionFrames: 0,
          effectFrames: 0,
          snapshotFrames: 0,
          cameraFrames: 0,
        },
      };
    },
    applied() {
      session && (session.counts.applyMs = roundMs(now() - session.started));
    },
    startFrame() {
      return session ? now() : null;
    },
    stage(startedAtMs, final) {
      if (!session || startedAtMs === null) return;
      const counts = session.counts;
      (counts.stageFrames++,
        (counts.stageMaxMs = Math.max(counts.stageMaxMs, roundMs(now() - startedAtMs))),
        session.lastStage !== null &&
          (counts.stageGapMaxMs = Math.max(
            counts.stageGapMaxMs,
            roundMs(startedAtMs - session.lastStage),
          )),
        (session.lastStage = startedAtMs),
        final && frameHandle !== null && (cancel(frameHandle), (frameHandle = null)),
        // 过渡还没结束、但当前帧没有再排请求时，用 rAF 兜底收尾，避免采样一直挂着。
        !final &&
          frameHandle === null &&
          (frameHandle = schedule(() => {
            ((frameHandle = null), flush());
          })));
    },
    render(startedAtMs, { calls = 0, path = 0, cameraMoving = false, snapshot = false } = {}) {
      if (!session || startedAtMs === null) return;
      const counts = session.counts,
        renderMs = roundMs(now() - startedAtMs);
      (counts.renderFrames ||
        (counts.firstRenderMs = roundMs(startedAtMs - session.started)),
        counts.renderFrames++,
        (counts.renderMaxMs = Math.max(counts.renderMaxMs, renderMs)),
        session.lastRender !== null &&
          (counts.renderGapMaxMs = Math.max(
            counts.renderGapMaxMs,
            roundMs(startedAtMs - session.lastRender),
          )),
        (session.lastRender = startedAtMs),
        (counts.slowRenderFrames += renderMs >= SLOW_RENDER_MS ? 1 : 0),
        (counts.drawMax = Math.max(counts.drawMax, Number.isFinite(calls) ? calls : 0)),
        (counts.motionFrames += path === 1 ? 1 : 0),
        (counts.effectFrames += path === 2 ? 1 : 0),
        (counts.snapshotFrames += snapshot ? 1 : 0),
        (counts.cameraFrames += cameraMoving ? 1 : 0));
    },
    cancel() {
      ((session = null), frameHandle !== null && cancel(frameHandle), (frameHandle = null));
    },
    dispose() {
      (this.cancel(), (isDisposed = true));
    },
  };
}

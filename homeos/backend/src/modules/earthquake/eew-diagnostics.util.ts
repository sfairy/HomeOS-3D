/**
 * 职责：
 *  - EEW 诊断环形缓冲器；
 * 关键依赖：
 *  - shared/redis；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * EEW 诊断状态：各源轮询时间与最近过滤原因 ring buffer。
 */
type EewSourcePollStatus = {
  id: 'wolfx' | 'sc_eew' | 'cenc_eew' | 'usgs';
  label: string;
  lastPollAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  /** wolfx: WS 连接；其余: 是否启用轮询 */
  active: boolean;
};

type EewFilterRecord = {
  at: number;
  source: string;
  reason: string;
  eventId?: string;
};

const FILTER_RING_MAX = 30;

/**
 * EewDiagnosticsBuffer：类声明。
 * - 所属文件：backend/src/modules/earthquake/eew-diagnostics.util.ts；
 * - 主要用途：封装域内职责的可复用类结构；
 * - 构造参数见 constructor 依赖注入列表；
 */
export class EewDiagnosticsBuffer {
  private readonly filters: EewFilterRecord[] = [];
  private readonly sources: Record<
    EewSourcePollStatus['id'],
    Omit<EewSourcePollStatus, 'id' | 'label' | 'active'>
  > = {
    wolfx: { lastPollAt: null, lastSuccessAt: null, lastError: null },
    sc_eew: { lastPollAt: null, lastSuccessAt: null, lastError: null },
    cenc_eew: { lastPollAt: null, lastSuccessAt: null, lastError: null },
    usgs: { lastPollAt: null, lastSuccessAt: null, lastError: null },
  };

  recordFilter(entry: Omit<EewFilterRecord, 'at'> & { at?: number }) {
    this.filters.push({
      at: entry.at ?? Date.now(),
      source: entry.source,
      reason: entry.reason,
      eventId: entry.eventId,
    });
    while (this.filters.length > FILTER_RING_MAX) this.filters.shift();
  }

  recordPoll(
    id: EewSourcePollStatus['id'],
    result: { ok: boolean; error?: string; touchedSuccess?: boolean },
  ) {
    const row = this.sources[id];
    const now = Date.now();
    row.lastPollAt = now;
    if (result.ok) {
      if (result.touchedSuccess !== false) row.lastSuccessAt = now;
      row.lastError = null;
    } else {
      row.lastError = result.error || 'unknown';
    }
  }

  touchWolfxActivity(connected: boolean) {
    const now = Date.now();
    this.sources.wolfx.lastPollAt = now;
    if (connected) {
      this.sources.wolfx.lastSuccessAt = now;
      this.sources.wolfx.lastError = null;
    }
  }

  /** 用 WS 客户端真实时间戳回填 Wolfx（即使尚未收到 EEW 报文） */
  syncWolfxFromConnection(status: {
    connected: boolean;
    connectedAt?: number | null;
    lastActivityAt?: number | null;
    state?: string;
  }) {
    const row = this.sources.wolfx;
    if (status.connectedAt) row.lastSuccessAt = status.connectedAt;
    if (status.lastActivityAt) {
      row.lastPollAt = status.lastActivityAt;
      if (status.connected) row.lastSuccessAt = status.lastActivityAt;
    }
    if (status.connected) {
      row.lastError = null;
      if (!row.lastSuccessAt) row.lastSuccessAt = Date.now();
      if (!row.lastPollAt) row.lastPollAt = row.lastSuccessAt;
    } else if (status.state && status.state !== 'open') {
      if (!row.lastError) row.lastError = `WS ${status.state}`;
    }
  }

  snapshot(opts: {
    wolfxConnected: boolean;
    scActive: boolean;
    cencActive: boolean;
    usgsActive: boolean;
  }): { sources: EewSourcePollStatus[]; recentFilters: EewFilterRecord[] } {
    const labels: Record<EewSourcePollStatus['id'], string> = {
      wolfx: 'Wolfx WebSocket',
      sc_eew: 'SC EEW 速报',
      cenc_eew: 'CENC 台网 EEW',
      usgs: 'USGS 兜底',
    };
    const activeMap: Record<EewSourcePollStatus['id'], boolean> = {
      wolfx: opts.wolfxConnected,
      sc_eew: opts.scActive,
      cenc_eew: opts.cencActive,
      usgs: opts.usgsActive,
    };
    const sources: EewSourcePollStatus[] = (
      Object.keys(this.sources) as EewSourcePollStatus['id'][]
    ).map((id) => ({
      id,
      label: labels[id],
      active: activeMap[id],
      ...this.sources[id],
    }));
    return {
      sources,
      recentFilters: [...this.filters].reverse(),
    };
  }
}

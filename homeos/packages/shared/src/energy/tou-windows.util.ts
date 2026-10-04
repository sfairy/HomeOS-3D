/**
 * @file tou-windows.util.ts
 * @module @homeos/shared/energy
 * @brief 分时电价（峰 / 谷）时段窗口交叉校验与半开区间重叠判定。
 *
 * 职责：
 *  - validateTouWindows：校验峰段 1 / 峰段 2 / 谷段三个窗口的合法性与两两互不重叠（含跨日谷段）；
 *  - clockRangesOverlap：通用半开区间重叠判定（供调用方对任意两个时钟窗口做预检）。
 *
 * 关键依赖：
 *  - home/mode-time.util#normalizeHomeModeTimeAt：将 "8:00" / "08:00" 等写法统一为 "HH:MM"。
 *
 * 约定：
 *  - 窗口采用半开区间 [start, end)；起止相同视为无效（需返回报错）；
 *  - 谷段允许跨日（如 23:00–07:00），内部拆为 [23:00, 24:00) + [00:00, 07:00) 两段做重叠判定；
 *  - 峰段 2 start/end 均为空时视为未配置，不参与校验；任一侧非空则要求双侧完整。
 */
import { normalizeHomeModeTimeAt } from '../home/mode-time.util';

/** 峰谷时段窗口字段（峰段 2 可省略） */
export type TouWindowFields = {
  /** 峰段 1 开始（HH:MM） */
  peakStart1?: string;
  /** 峰段 1 结束（HH:MM） */
  peakEnd1?: string;
  /** 峰段 2 开始（HH:MM，可省略表示仅一个峰段） */
  peakStart2?: string;
  /** 峰段 2 结束（HH:MM，可省略） */
  peakEnd2?: string;
  /** 谷段开始（HH:MM） */
  valleyStart?: string;
  /** 谷段结束（HH:MM） */
  valleyEnd?: string;
};

/** 时钟字符串 → 当日分钟数（0-1439）；非法格式返回 null */
function clockToMinutes(raw: string): number | null {
  const n = normalizeHomeModeTimeAt(raw);
  if (!n) return null;
  const [h, m] = n.split(':').map(Number);
  return h * 60 + m;
}

/** 半开区间 [start, end) 拆为分钟段列表；跨日拆两段（start → 1440 与 0 → end）；起止相同返回空数组 */
function rangeToSegments(startMin: number, endMin: number): Array<[number, number]> {
  if (startMin === endMin) return [];
  if (endMin > startMin) return [[startMin, endMin]];
  return [
    [startMin, 1440],
    [0, endMin],
  ];
}

/** 两个段列表是否存在重叠（半开区间判定：a0 < b1 && b0 < a1） */
function segmentsOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      if (a0 < b1 && b0 < a1) return true;
    }
  }
  return false;
}

/**
 * 判断两个时钟区间 [aStart, aEnd) 与 [bStart, bEnd) 是否重叠。
 * 自动处理跨日区间；任一侧格式非法时视为不重叠。
 *
 * @param aStart A 段开始（HH:MM）
 * @param aEnd   A 段结束
 * @param bStart B 段开始
 * @param bEnd   B 段结束
 * @returns true 表示两个区间存在重叠
 */
export function clockRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const a0 = clockToMinutes(aStart);
  const a1 = clockToMinutes(aEnd);
  const b0 = clockToMinutes(bStart);
  const b1 = clockToMinutes(bEnd);
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  return segmentsOverlap(rangeToSegments(a0, a1), rangeToSegments(b0, b1));
}

/**
 * @returns 人类可读错误列表；空数组表示通过。
 */
export function validateTouWindows(input: TouWindowFields): string[] {
  const errors: string[] = [];
  const windows: Array<{ start?: string; end?: string; label: string }> = [
    { start: input.peakStart1, end: input.peakEnd1, label: '峰段1' },
    { start: input.peakStart2, end: input.peakEnd2, label: '峰段2' },
    { start: input.valleyStart, end: input.valleyEnd, label: '谷段' },
  ];
  const parsed: Array<{ label: string; start: string; end: string }> = [];
  for (const w of windows) {
    const startRaw = String(w.start || '').trim();
    const endRaw = String(w.end || '').trim();
    if (!startRaw && !endRaw) continue;
    const ns = normalizeHomeModeTimeAt(startRaw);
    const ne = normalizeHomeModeTimeAt(endRaw);
    if (!ns || !ne) {
      errors.push(`${w.label}须为 HH:MM（如 08:00）`);
      continue;
    }
    if (ns === ne) {
      errors.push(`${w.label}起止不能相同`);
      continue;
    }
    parsed.push({ label: w.label, start: ns, end: ne });
  }
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      if (clockRangesOverlap(parsed[i].start, parsed[i].end, parsed[j].start, parsed[j].end)) {
        errors.push(`${parsed[i].label}与${parsed[j].label}时段重叠`);
      }
    }
  }
  return errors;
}

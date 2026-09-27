/**
 * 人体存在（presence）的页面可见性、路径校验与触发计时。
 */

// 状态条目归一（变更对象 / 状态对象两种形态）、「按 ID 切域」与交互页面清单都只有一份实现
import {
  INTERACTION_PAGE_OPTIONS as PRESENCE_PAGES,
  resolveStateEntry,
  stateTextOf
} from "../core/static-helpers.js";

type Point2 = { x: number; y: number; z?: number };
type Point3 = { x: number; y: number; z: number };

type PresenceBinding = {
  id: string;
  entityId?: string;
  displayPages?: string[] | "all";
  triggerMode?: string;
  triggerValue?: unknown;
  triggerThreshold?: number;
  displayDuration?: number;
  [key: string]: unknown;
};

type StateObject = {
  available?: boolean;
  state?: unknown;
  attributes?: { friendly_name?: unknown; [key: string]: unknown };
  lastChanged?: unknown;
  last_changed?: unknown;
  [key: string]: unknown;
};

type TriggerRecord = {
  key: string;
  on?: boolean;
  started?: number;
  duration?: number;
  value?: string;
  available?: boolean;
  timestamp?: number | null;
};

type PathSegment = {
  a: Point3;
  b: Point3;
  start: number;
  length: number;
};

type ClosedPath = {
  length: number;
  segments: PathSegment[];
};

/**
 * 判断人体存在绑定是否应该在指定页面上显示。
 */
export function presenceVisibleOnPage(presenceBinding: PresenceBinding, pageId: string) {
  // 默认只在前三个页面显示：全楼层总览、灯光、安防 —— 这是人体存在最常用的场景。
  const displayPages = presenceBinding.displayPages ?? ["overview", "light", "security"];
  return (
    (PRESENCE_PAGES as Array<[string, string]>).some(([pageKey]) => pageKey === pageId) &&
    (displayPages === "all" || (Array.isArray(displayPages) && displayPages.includes(pageId)))
  );
}
/**
 * 校验人体存在的巡游路径是否可用（闭合折线，首尾自动相连）。
 */
export function validPresenceRoute(route: Point2[] | null | undefined) {
  if (
    !Array.isArray(route) ||
    route.length < 3 ||
    route.length > 128 ||
    route.some(
      point =>
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        Math.abs(point.x) > 1000000 ||
        Math.abs(point.y) > 1000000
    )
  ) {
    return false;
  }
  const firstPoint = route[0];
  // 用 "x,y" 字符串集合判重：重复点会让折线出现零长度段，采样时朝向会跳变。
  if (
    new Set(route.map(candidatePoint => candidatePoint.x + "," + candidatePoint.y)).size !==
    route.length
  ) {
    return false;
  } else {
    // 只检查中间点（首尾不参与）：任一点与前一点、后一点构成的叉积不为 0，
    return route.slice(1, -1).some((middlePoint, pointIndex) => {
      const nextPoint = route[pointIndex + 2];
      return (
        Math.abs(
          (middlePoint.x - firstPoint.x) * (nextPoint.y - firstPoint.y) -
            (middlePoint.y - firstPoint.y) * (nextPoint.x - firstPoint.x)
        ) > 0.000001
      );
    });
  }
}
/**
 * 判断拖动中的点是否已经吸附到路径起点附近。
 */
export function snapsToPresenceStart(
  routePoints: Point2[],
  probePoint: Point2 | null | undefined,
  screenScale: number,
  tolerancePx = 16
) {
  return (
    validPresenceRoute(routePoints) &&
    !!probePoint &&
    // 世界距离 × 缩放 = 屏幕像素距离，因此吸附手感与缩放级别无关。
    Math.hypot(probePoint.x - routePoints[0].x, probePoint.y - routePoints[0].y) *
      Math.abs(screenScale) <=
      tolerancePx
  );
}
/**
 * 判断存在传感器当前是否「有人」。
 */
function presenceIsActive(entityState: unknown) {
  const resolvedState = resolveStateEntry(entityState) as StateObject | null;
  return resolvedState?.available !== false && resolvedState?.state === "on";
}
/** 触发方式的候选列表（配置界面直接渲染这份数组）。 */
export const PRESENCE_TRIGGER_MODES = [
  ["auto", "自动识别"],
  ["threshold", "数值大于阈值"],
  ["equals", "变为指定值"],
  ["change", "状态值变化"]
] as const;
/**
 * 判断该触发方式是否为「一次性显示后自动消失」：equals / change 是瞬时事件，靠
 */
export function presenceTriggerIsTimed(triggerBinding: PresenceBinding) {
  return (
    ["equals", "change"].includes(triggerBinding.triggerMode || "") ||
    ((!triggerBinding.triggerMode || triggerBinding.triggerMode === "auto") &&
      !!triggerBinding.entityId?.startsWith("event."))
  );
}
/**
 * 创建人体存在的触发状态跟踪器。
 */
export function createPresenceTriggers(nowProvider: () => number = () => Date.now()) {
  const triggersByBindingId = new Map<string, TriggerRecord>();
  return {
    /**
     * 用最新的绑定列表与实体状态刷新触发记录。
     */
    sync(bindings: PresenceBinding[], states: Record<string, unknown>) {
      const presentIds = new Set(bindings.map(bindingEntry => bindingEntry.id));
      for (const staleId of triggersByBindingId.keys()) {
        if (!presentIds.has(staleId)) {
          triggersByBindingId.delete(staleId);
        }
      }
      for (const binding of bindings) {
        const state = resolveStateEntry(states[binding.entityId || ""]) as StateObject | null;
        // 保留原样大小写：下面要拿 `stateText` 跟用户填的 triggerValue 逐字比对。
        const stateText = typeof state?.state == "string" ? state.state.trim() : "";
        // 可用性三重判断：未标记不可用、state 非空、且不是 unknown / unavailable。
        const isAvailable =
          state?.available !== false &&
          !!stateText &&
          !["unknown", "unavailable"].includes(stateTextOf(state));
        let triggerMode = binding.triggerMode || "auto";
        if (triggerMode === "auto") {
          // 自动识别：event.* 按事件处理；名字里带「人数」语义且值是数字的按阈值处理；
          const looksLikePeopleCount =
            /person_count|people_count|occupancy_count|human_count|人数|人员数量|人体数量/i.test(
              binding.entityId + " " + (state?.attributes?.friendly_name || "")
            );
          triggerMode = binding.entityId?.startsWith("event.")
            ? "event"
            : looksLikePeopleCount && Number.isFinite(Number(stateText))
              ? "threshold"
              : "state";
        }
        // 配置签名：实体或触发参数一改，之前的记录就不能再用来比较，必须丢掉重来。
        const configKey = JSON.stringify([
          binding.entityId,
          binding.triggerMode || "auto",
          binding.triggerValue ?? "on",
          binding.triggerThreshold ?? 0
        ]);
        let previousRecord = triggersByBindingId.get(binding.id);
        if (previousRecord?.key !== configKey) {
          previousRecord = undefined;
        }
        // 事件时间取 HA 的 last_changed；不允许超过本地当前时间（时钟漂移兜底）。
        const changedAtMs = Date.parse(String(state?.lastChanged || state?.last_changed || ""));
        const timestampMs = Number.isFinite(changedAtMs)
          ? Math.min(changedAtMs, nowProvider())
          : null;
        // 瞬时类触发默认显示 30 秒；常驻类（state / threshold）默认 0，表示不自动消失。
        const durationSeconds = ["equals", "change", "event"].includes(triggerMode)
          ? (binding.displayDuration || 0) > 0
            ? binding.displayDuration!
            : 30
          : (binding.displayDuration ?? 0);
        if (triggerMode === "event") {
          // event 实体的 state 本身就是触发时间戳（ISO 8601），解析成功即视为刚触发。
          const eventTimestampMs = /^\d{4}-\d{2}-\d{2}T/.test(stateText)
            ? Date.parse(stateText)
            : NaN;
          triggersByBindingId.set(binding.id, {
            key: configKey,
            on: isAvailable && Number.isFinite(eventTimestampMs),
            started: eventTimestampMs,
            duration: durationSeconds
          });
          continue;
        }
        if (triggerMode === "equals" || triggerMode === "change") {
          // 触发条件：值发生了变化（equals 还要求变成指定值），
          const changedForMode =
            isAvailable && !!previousRecord?.available && stateText !== previousRecord.value;
          const isNewerTimestamp =
            timestampMs === null ||
            previousRecord?.timestamp == null ||
            timestampMs > previousRecord.timestamp;
          const shouldTrigger =
            changedForMode &&
            isNewerTimestamp &&
            (triggerMode === "change" || stateText === String(binding.triggerValue ?? "on").trim());
          triggersByBindingId.set(binding.id, {
            key: configKey,
            value: stateText,
            available: isAvailable,
            timestamp: timestampMs,
            duration: durationSeconds,
            on: isAvailable && (shouldTrigger || !!previousRecord?.on),
            started: shouldTrigger
              ? (timestampMs ?? nowProvider())
              : (previousRecord?.started ?? nowProvider())
          });
          continue;
        }
        const isOn =
          isAvailable &&
          (triggerMode === "threshold"
            ? Number.isFinite(Number(stateText)) &&
              Number(stateText) >
                (binding.triggerMode === "threshold" ? (binding.triggerThreshold ?? 0) : 0)
            : presenceIsActive(state));
        const valueChanged = previousRecord?.value !== stateText;
        // 起始时刻只在「从关到开」或「开着时值发生变化」时重置，其余情况沿用旧值，
        const startedMs =
          !previousRecord || (isOn && (!previousRecord.on || valueChanged))
            ? (timestampMs ?? nowProvider())
            : previousRecord.started;
        triggersByBindingId.set(binding.id, {
          key: configKey,
          value: stateText,
          on: isOn,
          timestamp: timestampMs,
          started: startedMs,
          duration: durationSeconds
        });
      }
    },
    /**
     * 查询某个绑定当前是否应该显示。
     */
    visible(bindingId: string) {
      const record = triggersByBindingId.get(bindingId);
      return (
        !!record?.on &&
        nowProvider() >= (record.started || 0) &&
        (!record.duration || nowProvider() - (record.started || 0) < record.duration * 1000)
      );
    }
  };
}
/**
 * 把闭合折线预处理成可快速采样的分段表。
 */
export function closedPath(points: Point3[]) {
  const segments: PathSegment[] = [];
  let totalLength = 0;
  for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex++) {
    const fromPoint = points[edgeIndex];
    const toPoint = points[(edgeIndex + 1) % points.length];
    const segmentLength = Math.hypot(
      toPoint.x - fromPoint.x,
      toPoint.y - fromPoint.y,
      toPoint.z - fromPoint.z
    );
    if (segmentLength > 1e-8) {
      segments.push({
        a: fromPoint,
        b: toPoint,
        start: totalLength,
        length: segmentLength
      });
      totalLength += segmentLength;
    }
  }
  return {
    length: totalLength,
    segments: segments
  };
}
/**
 * 沿闭合路径取指定距离处的点与朝向。
 */
export function sampleClosedPath(path: ClosedPath, distance: number) {
  if (!(path.length > 0)) {
    return null;
  }
  // 取模两次是为了处理负数：JS 的 % 会保留负号，需要再加一轮总长拉回正区间。
  const wrappedDistance = ((distance % path.length) + path.length) % path.length;
  // 分段按 start 升序，返回第一个覆盖该距离的段；由于浮点误差可能落在末尾之外，
  const segment =
    path.segments.find(
      (candidateSegment: PathSegment) =>
        wrappedDistance < candidateSegment.start + candidateSegment.length
    ) || path.segments.at(-1);
  if (!segment) {
    return null;
  }
  const segmentRatio = (wrappedDistance - segment.start) / segment.length;
  // 朝向用 atan2(dx, dz)：与 3D 场景中「模型正面朝 +Z」的约定一致。
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * segmentRatio,
    y: segment.a.y + (segment.b.y - segment.a.y) * segmentRatio,
    z: segment.a.z + (segment.b.z - segment.a.z) * segmentRatio,
    heading: Math.atan2(segment.b.x - segment.a.x, segment.b.z - segment.a.z)
  };
}

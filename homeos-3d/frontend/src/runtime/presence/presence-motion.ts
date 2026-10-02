const PRESENCE_PAGES = [
  ["overview", "ALL（全部楼层）"],
  ["light", "灯光"],
  ["environment", "环境"],
  ["devices", "设备"],
  ["vacuum", "扫地机"],
  ["security", "安防"],
];
export function presenceVisibleOnPage(presenceBinding, pageId) {
  const displayPages = presenceBinding.displayPages ?? ["overview", "light", "security"];
  return (
    PRESENCE_PAGES.some(([pageKey]) => pageKey === pageId) &&
    (displayPages === "all" || (Array.isArray(displayPages) && displayPages.includes(pageId)))
  );
}
export function validPresenceRoute(route) {
  if (
    !Array.isArray(route) ||
    route.length < 3 ||
    route.length > 128 ||
    route.some(
      (point) =>
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        Math.abs(point.x) > 1000000 ||
        Math.abs(point.y) > 1000000,
    )
  )
    return false;
  const firstPoint = route[0];
  return new Set(route.map((candidatePoint) => candidatePoint.x + "," + candidatePoint.y)).size !==
    route.length
    ? false
    : route.slice(1, -1).some((middlePoint, pointIndex) => {
        const nextPoint = route[pointIndex + 2];
        return (
          Math.abs(
            (middlePoint.x - firstPoint.x) * (nextPoint.y - firstPoint.y) -
              (middlePoint.y - firstPoint.y) * (nextPoint.x - firstPoint.x),
          ) > 0.000001
        );
      });
}
export function snapsToPresenceStart(routePoints, probePoint, screenScale, tolerancePx = 16) {
  return (
    validPresenceRoute(routePoints) &&
    !!probePoint &&
    Math.hypot(probePoint.x - routePoints[0].x, probePoint.y - routePoints[0].y) *
      Math.abs(screenScale) <=
      tolerancePx
  );
}
function presenceIsActive(entityState) {
  const resolvedState = entityState?.newState || entityState;
  return resolvedState?.available !== false && resolvedState?.state === "on";
}
export const PRESENCE_TRIGGER_MODES = [
  ["auto", "自动识别"],
  ["threshold", "数值大于阈值"],
  ["equals", "变为指定值"],
  ["change", "状态值变化"],
];
export function presenceTriggerIsTimed(triggerBinding) {
  return (
    ["equals", "change"].includes(triggerBinding.triggerMode) ||
    ((!triggerBinding.triggerMode || triggerBinding.triggerMode === "auto") &&
      triggerBinding.entityId?.startsWith("event."))
  );
}
export function createPresenceTriggers(nowProvider = () => Date.now()) {
  const triggersByBindingId = new Map();
  return {
    sync(bindings, states) {
      const presentIdSet = new Set(bindings.map((bindingEntry) => bindingEntry.id));
      for (const staleId of triggersByBindingId.keys())
        presentIdSet.has(staleId) || triggersByBindingId.delete(staleId);
      for (const binding of bindings) {
        const state = states[binding.entityId]?.newState || states[binding.entityId],
          stateText = typeof state?.state == "string" ? state.state.trim() : "",
          isAvailable =
            state?.available !== false &&
            !!stateText &&
            !["unknown", "unavailable"].includes(stateText.toLowerCase());
        let triggerMode = binding.triggerMode || "auto";
        if (triggerMode === "auto") {
          const hasPeopleCountPattern =
            /person_count|people_count|occupancy_count|human_count|人数|人员数量|人体数量/i.test(
              binding.entityId + " " + (state?.attributes?.friendly_name || ""),
            );
          triggerMode = binding.entityId?.startsWith("event.")
            ? "event"
            : hasPeopleCountPattern && Number.isFinite(Number(stateText))
              ? "threshold"
              : "state";
        }
        const configKey = JSON.stringify([
          binding.entityId,
          binding.triggerMode || "auto",
          binding.triggerValue ?? "on",
          binding.triggerThreshold ?? 0,
        ]);
        let previousRecord = triggersByBindingId.get(binding.id);
        previousRecord?.key !== configKey && (previousRecord = null);
        const changedAtMs = Date.parse(state?.lastChanged || state?.last_changed || ""),
          timestampMs = Number.isFinite(changedAtMs) ? Math.min(changedAtMs, nowProvider()) : null,
          durationSeconds = ["equals", "change", "event"].includes(triggerMode)
            ? binding.displayDuration > 0
              ? binding.displayDuration
              : 30
            : (binding.displayDuration ?? 0);
        if (triggerMode === "event") {
          const eventTimestampMs = /^\d{4}-\d{2}-\d{2}T/.test(stateText)
            ? Date.parse(stateText)
            : NaN;
          triggersByBindingId.set(binding.id, {
            key: configKey,
            on: isAvailable && Number.isFinite(eventTimestampMs),
            started: eventTimestampMs,
            duration: durationSeconds,
          });
          continue;
        }
        if (triggerMode === "equals" || triggerMode === "change") {
          const changedForMode =
              isAvailable && previousRecord?.available && stateText !== previousRecord.value,
            isNewerTimestamp =
              timestampMs === null ||
              previousRecord?.timestamp == null ||
              timestampMs > previousRecord.timestamp,
            shouldTrigger =
              changedForMode &&
              isNewerTimestamp &&
              (triggerMode === "change" ||
                stateText === String(binding.triggerValue ?? "on").trim());
          triggersByBindingId.set(binding.id, {
            key: configKey,
            value: stateText,
            available: isAvailable,
            timestamp: timestampMs,
            duration: durationSeconds,
            on: isAvailable && (shouldTrigger || !!previousRecord?.on),
            started: shouldTrigger
              ? (timestampMs ?? nowProvider())
              : (previousRecord?.started ?? nowProvider()),
          });
          continue;
        }
        const isOn =
            isAvailable &&
            (triggerMode === "threshold"
              ? Number.isFinite(Number(stateText)) &&
                Number(stateText) >
                  (binding.triggerMode === "threshold" ? (binding.triggerThreshold ?? 0) : 0)
              : presenceIsActive(state)),
          isValueChanged = previousRecord?.value !== stateText,
          startedMs =
            !previousRecord || (isOn && (!previousRecord.on || isValueChanged))
              ? (timestampMs ?? nowProvider())
              : previousRecord.started;
        triggersByBindingId.set(binding.id, {
          key: configKey,
          value: stateText,
          on: isOn,
          timestamp: timestampMs,
          started: startedMs,
          duration: durationSeconds,
        });
      }
    },
    visible(bindingId) {
      const record = triggersByBindingId.get(bindingId);
      return (
        !!record?.on &&
        nowProvider() >= record.started &&
        (!record.duration || nowProvider() - record.started < record.duration * 1000)
      );
    },
  };
}
export function closedPath(points) {
  const segments = [];
  let totalLength = 0;
  for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex++) {
    const fromPoint = points[edgeIndex],
      toPoint = points[(edgeIndex + 1) % points.length],
      segmentLength = Math.hypot(
        toPoint.x - fromPoint.x,
        toPoint.y - fromPoint.y,
        toPoint.z - fromPoint.z,
      );
    segmentLength > 1e-8 &&
      (segments.push({
        a: fromPoint,
        b: toPoint,
        start: totalLength,
        length: segmentLength,
      }),
      (totalLength += segmentLength));
  }
  return {
    length: totalLength,
    segments: segments,
  };
}
export function sampleClosedPath(path, distance) {
  if (!(path.length > 0)) return null;
  const wrappedDistance = ((distance % path.length) + path.length) % path.length,
    segment =
      path.segments.find(
        (candidateSegment) => wrappedDistance < candidateSegment.start + candidateSegment.length,
      ) || path.segments.at(-1),
    segmentRatio = (wrappedDistance - segment.start) / segment.length;
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * segmentRatio,
    y: segment.a.y + (segment.b.y - segment.a.y) * segmentRatio,
    z: segment.a.z + (segment.b.z - segment.a.z) * segmentRatio,
    heading: Math.atan2(segment.b.x - segment.a.x, segment.b.z - segment.a.z),
  };
}

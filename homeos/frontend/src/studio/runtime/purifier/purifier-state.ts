const readEntityState = (source: any, lookupId: any) => {
  const entry = source instanceof Map ? source.get(lookupId) : source?.[lookupId];
  return entry?.newState || entry;
};
export function purifierState(item: any, states: Record<string, any> = {}) {
  const entityId = item.airflowEntityId || item.entityId,
    airflowState = readEntityState(states, entityId),
    mainState = readEntityState(states, item.entityId),
    isAvailable = !!(
      airflowState &&
      airflowState.available !== false &&
      ["on", "off"].includes(airflowState.state)
    ),
    percentage = mainState?.attributes?.percentage,
    finite =
      mainState?.available !== false &&
      ["on", "off"].includes(mainState?.state) &&
      (typeof percentage == "number" ||
        (typeof percentage == "string" && percentage.trim() !== "")) &&
      Number.isFinite(Number(percentage)),
    max = finite ? Math.max(0, Math.min(1, Number(percentage) / 100)) : 0.5,
    isRunning =
      isAvailable && airflowState.state === "on" && (!!item.airflowEntityId || !finite || max > 0);
  return {
    available: isAvailable,
    on: isAvailable && airflowState.state === "on",
    running: isRunning,
    strength: max,
    visualMode: isRunning ? "other" : "off",
    label: entityId
      ? isAvailable
        ? isRunning
          ? "净化中"
          : "已停止"
        : "状态未知"
      : "各功能独立控制",
  };
}

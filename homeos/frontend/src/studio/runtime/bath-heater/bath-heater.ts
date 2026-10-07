export const bathEffects = {
    fan: "运行出风",
    light: "照明",
  };
const bathRawState = (stateSource: any, entityId: any) => {
    const stateEntry =
      stateSource instanceof Map ? stateSource.get(entityId) : stateSource?.[entityId];
    return stateEntry?.newState || stateEntry;
  };
const normalizeStateText = (stateText: any) =>
    String(stateText ?? "")
      .trim()
      .toLowerCase(),
  isEntityAvailable = (entityState: any) =>
    entityState &&
    entityState.available !== false &&
    !["", "unknown", "unavailable"].includes(normalizeStateText(entityState.state)),
  isInactiveState = (rawStateText: any) =>
    ["off", "idle", "standby", "unknown", "unavailable", "待机", "关闭", "停止"].includes(
      normalizeStateText(rawStateText),
    ),
  isLightMode = (modeText: any) =>
    ["light", "light_only", "lighting", "照明", "仅照明", "灯光"].includes(
      normalizeStateText(modeText),
    ),
  resolveEffectChannel = (effectName: any) =>
    ["heat", "fan", "exhaust"].includes(effectName) ? "fan" : effectName === "light" ? "light" : "";
export function bathHeaterState(heaterConfig: any, entityStates: Record<string, any> = {}) {
  const bathRawState2 = bathRawState(entityStates, heaterConfig.entityId),
    list = heaterConfig.bathEffects || [],
    set = new Set(),
    configuredChannelsSet = new Set(
      list.map((bathEffect: any) => resolveEffectChannel(bathEffect.effect)),
    ),
    isPrimaryEntityActive =
      isEntityAvailable(bathRawState2) && !isInactiveState(bathRawState2.state);
  let hasAvailableEntity = false;
  if (isEntityAvailable(bathRawState2)) {
    hasAvailableEntity = true;
    const hvacAction = bathRawState2.attributes?.hvac_action,
      some = [bathRawState2.state, bathRawState2.attributes?.preset_mode, hvacAction].some(
        isLightMode,
      );
    isPrimaryEntityActive &&
      (some && !configuredChannelsSet.has("light") && set.add("light"),
      !some && !isInactiveState(hvacAction) && !configuredChannelsSet.has("fan") && set.add("fan"));
  }
  for (const effectConfig of list) {
    const bathRawState3 = bathRawState(entityStates, effectConfig.entityId);
    if (!isEntityAvailable(bathRawState3)) continue;
    const state = effectConfig.attribute
      ? bathRawState3.attributes?.[effectConfig.attribute]
      : bathRawState3.state;
    if (state == null || ["unknown", "unavailable"].includes(state)) continue;
    hasAvailableEntity = true;
    const effectChannel = resolveEffectChannel(effectConfig.effect);
    String(state) === effectConfig.value && effectChannel && set.add(effectChannel);
  }
  const filter = (heaterConfig.extraControls || [])
    .filter(
      (extraControlConfig: any) =>
        !["button", "input_button", "event"].includes(extraControlConfig.entityId.split(".")[0]),
    )
    .map((controlConfig: any) => bathRawState(entityStates, controlConfig.entityId))
    .filter(isEntityAvailable);
  hasAvailableEntity ||= filter.length > 0;
  const some2 =
      set.size > 0 ||
      isPrimaryEntityActive ||
      filter.some((controlStateEntry: any) => controlStateEntry.state === "on"),
    activeChannels = Object.keys(bathEffects).filter((channelKey) => set.has(channelKey));
  return {
    available: hasAvailableEntity,
    on: some2,
    active: activeChannels,
    running: set.has("fan"),
    visualMode: some2 ? "other" : "off",
    label: activeChannels.length
      ? activeChannels.map((activeChannelKey) => (bathEffects as any)[activeChannelKey]).join(" · ")
      : hasAvailableEntity
        ? some2
          ? "已开启"
          : "已关闭"
        : "状态未知",
  };
}

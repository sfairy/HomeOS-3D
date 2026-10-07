import { bathHeaterState as bathHeaterState2 } from "./bath-heater";
export function bathEffectEditor({
  item: item,
  entities: entities,
  states: readStates,
  host: hostElement,
  node: createNode,
  select: createSelect,
  update: update,
  redraw: redraw,
}: any) {
  hostElement.append(
    createNode(
      "p",
      "i3d-note",
      "有主实体时默认自动跟随。DIY 选择代表浴霸运行的开关，开启就出风，关闭就停止。照明在附加功能中控制。",
    ),
  );
  const set = new Set((item.extraControls || []).map((control: any) => control.entityId)),
    filter = entities.filter(
      (candidateEntity: any) =>
        set.has(candidateEntity.entityId) &&
        /^(switch|fan|binary_sensor|input_boolean)\./.test(candidateEntity.entityId),
    ),
    list = item.bathEffects || [],
    isEffectControl = (effectControl: any) => ["heat", "fan", "exhaust"].includes(effectControl.effect),
    effectControls = list.filter(isEffectControl),
    some =
      effectControls.length === 1 &&
      !effectControls[0].attribute &&
      effectControls[0].value === "on" &&
      filter.some((entity: any) => entity.entityId === effectControls[0].entityId),
    options = [
      ["", item.entityId ? "主实体（自动）" : "请选择开关或运行状态"],
      ...filter.map((optionEntity: any) => [
        optionEntity.entityId,
        optionEntity.name || optionEntity.entityId,
      ]),
    ];
  effectControls.length && !some && options.push(["legacy", "保留原有运行绑定"]);
  const element = createSelect(
    hostElement,
    "出风跟随",
    options,
    effectControls.length ? (some ? effectControls[0].entityId : "legacy") : "",
    (selectedEntityId: any) => {
      selectedEntityId !== "legacy" &&
        ((item.bathEffects = [
          ...list.filter((effect: any) => !isEffectControl(effect)),
          ...(selectedEntityId
            ? [
                {
                  effect: "fan",
                  entityId: selectedEntityId,
                  attribute: "",
                  value: "on",
                },
              ]
            : []),
        ]),
        update(),
        redraw());
    },
  );
  ((element.disabled = !effectControls.length && list.length >= 12),
    element.disabled && (element.title = "原有绑定已达到数量上限"),
    !item.entityId &&
      !filter.length &&
      hostElement.append(
        createNode("p", "i3d-note", "先在附加功能中选好浴霸的运行开关，再来选择。"),
      ));
  const statusNoteElement = createNode("p", "i3d-note"),
    refreshStatus = () => {
      const heaterState = bathHeaterState2(item, readStates());
      statusNoteElement.textContent =
        "出风状态：" +
        (heaterState.available ? (heaterState.running ? "出风中" : "已停止") : "状态未知");
    };
  return (hostElement.append(statusNoteElement), refreshStatus(), refreshStatus);
}

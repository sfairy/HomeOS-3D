import { resolveXiaomiDeviceProfile } from "./renderer/device-profiles.js?v=20260821-electric-bed-sync-v4";
export const RELATED_ENTITY_MODE_SELECTED = "selected",
  RELATED_POPUP_LABELS = Object.freeze({
    "water-heater": "热水器",
    "air-purifier": "空气净化器",
    "bath-heater": "浴霸",
    "air-conditioner": "空调",
    vacuum: "扫地机器人",
  }),
  RELATED_POPUP_SELECTION_LIMITS = Object.freeze({
    "water-heater": 12,
    "air-purifier": 12,
    "bath-heater": 12,
    "air-conditioner": 12,
    vacuum: 12,
  });
export function relatedPopupSelectionLimit(arg1) {
  const value1 = typeof arg1 == "string" ? arg1 : arg1?.deviceType;
  return Number(RELATED_POPUP_SELECTION_LIMITS[value1] || 0);
}
const E = Object.freeze({
    "water-heater": new Set([
      "light",
      "switch",
      "input_boolean",
      "fan",
      "select",
      "input_select",
      "number",
      "input_number",
      "button",
      "sensor",
      "binary_sensor",
    ]),
    "air-purifier": new Set([
      "light",
      "switch",
      "input_boolean",
      "select",
      "input_select",
      "number",
      "input_number",
      "button",
      "sensor",
      "binary_sensor",
    ]),
    "bath-heater": new Set([
      "light",
      "switch",
      "input_boolean",
      "fan",
      "select",
      "input_select",
      "number",
      "input_number",
      "button",
      "sensor",
      "binary_sensor",
    ]),
    "air-conditioner": new Set([
      "light",
      "switch",
      "input_boolean",
      "fan",
      "select",
      "input_select",
      "number",
      "input_number",
      "button",
      "sensor",
      "binary_sensor",
    ]),
    vacuum: new Set([
      "light",
      "switch",
      "input_boolean",
      "select",
      "input_select",
      "number",
      "input_number",
      "button",
      "sensor",
      "binary_sensor",
    ]),
  }),
  w = new Map([
    ["light", 0],
    ["switch", 1],
    ["input_boolean", 1],
    ["fan", 2],
    ["select", 3],
    ["input_select", 3],
    ["number", 4],
    ["input_number", 4],
    ["sensor", 5],
    ["binary_sensor", 6],
    ["button", 7],
  ]);
export const RELATED_ENTITY_DOMAIN_LABELS = Object.freeze({
  light: "灯光",
  switch: "开关",
  input_boolean: "开关",
  fan: "风扇",
  select: "选项",
  input_select: "选项",
  number: "数值",
  input_number: "数值",
  button: "按钮",
  sensor: "数据",
  binary_sensor: "状态",
});
function c(arg2) {
  return String(arg2?.domain || arg2?.entityId || "").split(".", 1)[0];
}
export function relatedEntityIsAvailable(arg3) {
  return (
    !!arg3?.entityId && !arg3.disabledBy && arg3.status !== "missing" && arg3.status !== "disabled"
  );
}
function S(arg4, arg5) {
  return arg5 ? [...(arg4?.values?.() || [])].filter((arg6) => arg6.deviceId === arg5) : [];
}
function _(arg7, arg8) {
  return arg7.find((arg9) => c(arg9) === arg8 && relatedEntityIsAvailable(arg9)) || null;
}
function T(arg10) {
  return _(arg10, "vacuum");
}
function L(arg11) {
  return _(arg11, "water_heater");
}
export function relatedPopupContext(
  arg12,
  arg13 = new Map(),
  arg14 = new Map(),
  arg15 = new Map(),
) {
  const value2 = [
      "icon-button-effect",
      "icon-button",
      "device-button",
      "air-conditioner",
      "water-heater",
      "air-purifier",
      "vacuum-control",
    ].includes(arg12?.type),
    value3 = Object.values(arg12?.actions || {}).some(
      (arg16) =>
        arg16?.type === "more-info" &&
        !["entity", "custom"].includes(String(arg16?.data?.popupSource || "current")),
    );
  if (!value2 && !value3) return null;
  const value4 = String(arg12?.bindings?.entity?.entityId || ""),
    value5 = arg13.get(value4) || null;
  if (!value4 || !value5) return null;
  const value6 = S(arg13, value5.deviceId),
    value7 = resolveXiaomiDeviceProfile(value4, arg13, arg14, arg15),
    value8 = String(arg12?.properties?.deviceType || ""),
    value9 = c(value5),
    value10 = value7?.roles?.climate || value7?.roles?.fan || "",
    value11 = !!(value10 && value4 === value10),
    value12 = value9 === "water_heater" ? value5 : L(value6),
    value13 = value9 === "vacuum" ? value5 : T(value6);
  let text1 = "",
    value14 = value4;
  return (
    arg12?.type === "water-heater" || value12
      ? ((text1 = "water-heater"), (value14 = value12?.entityId || value4))
      : arg12?.type === "air-purifier" ||
          value8 === "air-purifier" ||
          value7?.deviceType === "air-purifier"
        ? ((text1 = "air-purifier"), (value14 = value7?.roles?.fan || value4))
        : arg12?.type === "vacuum-control" || value13
          ? ((text1 = "vacuum"), (value14 = value13?.entityId || value4))
          : value8 === "bath-heater" || (value7?.deviceType === "bath-heater" && value11)
            ? ((text1 = "bath-heater"),
              (value14 = value7?.roles?.climate || value7?.roles?.fan || value4))
            : (value8 === "air-conditioner" ||
                value7?.deviceType === "air-conditioner" ||
                value9 === "climate") &&
              ((text1 = "air-conditioner"), (value14 = value7?.roles?.climate || value4)),
    !text1 || !value5.deviceId
      ? null
      : {
          deviceType: text1,
          deviceLabel: RELATED_POPUP_LABELS[text1],
          configuredEntityId: value4,
          primaryEntityId: value14,
          deviceId: value5.deviceId,
          source: value5,
          primary: arg13.get(value14) || value5,
          profile: value7,
          siblings: value6,
        }
  );
}
export function selectedRelatedEntityIds(arg17) {
  const value15 = arg17?.properties?.relatedEntities;
  return value15?.mode !== RELATED_ENTITY_MODE_SELECTED || !Array.isArray(value15.entityIds)
    ? null
    : [...new Set(value15.entityIds.map((arg18) => String(arg18 || "").trim()).filter(Boolean))];
}
export function relatedPopupCandidates(
  arg19,
  arg20 = new Map(),
  arg21 = new Map(),
  arg22 = new Map(),
) {
  const value16 = relatedPopupContext(arg19, arg20, arg21, arg22);
  if (!value16) return [];
  const value17 = E[value16.deviceType] || new Set(),
    set1 = new Set(selectedRelatedEntityIds(arg19) || []);
  return value16.siblings
    .filter(
      (arg23) =>
        arg23.entityId !== value16.primaryEntityId &&
        value17.has(c(arg23)) &&
        (relatedEntityIsAvailable(arg23) || set1.has(arg23.entityId)),
    )
    .sort((arg24, arg25) => {
      const value18 = relatedEntityIsAvailable(arg24) ? 0 : 1,
        value19 = relatedEntityIsAvailable(arg25) ? 0 : 1;
      return (
        value18 - value19 ||
        (w.get(c(arg24)) ?? 99) - (w.get(c(arg25)) ?? 99) ||
        String(arg24.entityId || "").localeCompare(String(arg25.entityId || ""))
      );
    });
}
export function legacyRelatedEntityIds(
  arg26,
  arg27 = new Map(),
  arg28 = new Map(),
  arg29 = new Map(),
) {
  const value20 = relatedPopupContext(arg26, arg27, arg28, arg29);
  if (!value20) return [];
  const value21 = relatedPopupCandidates(arg26, arg27, arg28, arg29);
  if (value20.deviceType === "water-heater")
    return value21
      .filter(
        (arg30) =>
          ["switch", "select", "number", "button"].includes(c(arg30)) &&
          relatedEntityIsAvailable(arg30),
      )
      .map((arg31) => arg31.entityId);
  if (value20.deviceType === "air-purifier") {
    const value22 = value20.profile?.roles || {};
    return [
      ...new Set(
        [
          "pm25",
          "pm10",
          "filterLife",
          "filterLeftTime",
          "hcho",
          "temperature",
          "humidity",
          "airQuality",
        ]
          .map((arg32) => value22[arg32])
          .filter(Boolean),
      ),
    ];
  }
  if (value20.deviceType === "bath-heater") {
    const value23 =
      value20.profile?.roles?.light ||
      value21.find((arg33) => c(arg33) === "light" && relatedEntityIsAvailable(arg33))?.entityId;
    return value23 ? [value23] : [];
  }
  if (value20.deviceType === "vacuum") {
    const value24 = value21.find(
      (arg34) =>
        c(arg34) === "select" &&
        (/cleaning_mode/i.test(String(arg34.entityId || "")) ||
          arg34.translationKey === "cleaning_mode"),
    );
    return value24?.entityId ? [value24.entityId] : [];
  }
  return [];
}
export function relatedEntityLabel(arg35, arg36) {
  let value25 = String(arg36?.name || arg36?.originalName || "")
    .replace(/\s+/g, " ")
    .trim();
  const value26 = [
    ...new Set(
      [
        arg35?.source?.originalName,
        arg35?.source?.name,
        arg35?.primary?.originalName,
        arg35?.primary?.name,
      ]
        .map((arg37) =>
          String(arg37 || "")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean),
    ),
  ].sort((arg38, arg39) => arg39.length - arg38.length);
  for (const value27 of value26)
    for (; value25 !== value27 && value25.startsWith(value27 + " ");)
      value25 = value25.slice(value27.length).trim();
  return (
    value25 || (String(arg36?.entityId || "").split(".", 2)[1] || "关联功能").replace(/_/g, " ")
  );
}
export function relatedEntityNeedsConfirmation(arg40) {
  if (c(arg40) !== "button") return false;
  const value28 = [arg40?.entityId, arg40?.name, arg40?.originalName, arg40?.translationKey]
    .map((arg41) => String(arg41 || ""))
    .join(" ");
  return /清空|清除|删除|重置|恢复出厂|格式化|解绑|empty|clear|delete|remove|reset|factory|wipe|format|unbind|purge/i.test(
    value28,
  );
}
export function relatedEntityOptions(arg42, arg43) {
  const value29 = arg43?.attributes || {},
    value30 =
      [
        value29.options,
        value29.option_list,
        arg42?.options,
        arg42?.attributes?.options,
        arg42?.capabilities?.options,
      ].find((arg44) => Array.isArray(arg44)) || [],
    value31 = String(arg43?.state || "").trim(),
    value32 = value30.map((arg45) => String(arg45 ?? "").trim()).filter(Boolean);
  return (
    value31 && !["unknown", "unavailable"].includes(value31.toLowerCase()) && value32.push(value31),
    [...new Set(value32)]
  );
}
export function relatedEntitySelectService(arg46) {
  const value33 = typeof arg46 == "string" ? arg46 : c(arg46);
  return ["select", "input_select"].includes(value33)
    ? {
        domain: value33,
        service: "select_option",
      }
    : null;
}
export function selectedRelatedEntities(
  arg47,
  arg48 = new Map(),
  arg49 = new Map(),
  arg50 = new Map(),
) {
  const value34 = selectedRelatedEntityIds(arg47);
  if (value34 === null) return null;
  const value35 = relatedPopupContext(arg47, arg48, arg49, arg50),
    value36 = relatedPopupSelectionLimit(value35),
    map1 = new Map(
      relatedPopupCandidates(arg47, arg48, arg49, arg50).map((arg51) => [arg51.entityId, arg51]),
    ),
    value37 = value34.map((arg52) => map1.get(arg52)).filter(Boolean);
  return value36 > 0 ? value37.slice(0, value36) : value37;
}
export function manualRelatedEntityConfig(arg53 = []) {
  return {
    mode: RELATED_ENTITY_MODE_SELECTED,
    entityIds: [...new Set(arg53.map((arg54) => String(arg54 || "").trim()).filter(Boolean))],
  };
}

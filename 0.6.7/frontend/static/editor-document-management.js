import { clone, newId, slugify } from "./editor-utils.js?v=20260831-editor-utils-v1";
const s = "ha-bridge:editor:selected-project";
export function rememberEditorProject(arg1, arg2 = () => globalThis.sessionStorage) {
  try {
    arg2()?.setItem(s, arg1);
  } catch {}
}
export function restoredEditorProject(arg3, arg4 = null, arg5 = () => globalThis.sessionStorage) {
  if (arg3.some((arg6) => arg6.id === arg4)) return arg4;
  let value1;
  try {
    value1 = arg5()?.getItem(s);
  } catch {}
  return arg3.find((arg7) => arg7.id === value1)?.id ?? arg3[0]?.id ?? null;
}
export function uniquePagePath(arg8, arg9, arg10 = "") {
  const value2 = slugify(arg9),
    set1 = new Set((arg8 || []).map((arg11) => arg11.path).filter((arg12) => arg12 !== arg10));
  let value3 = value2,
    value4 = 2;
  for (; set1.has(value3);) value3 = value2 + "-" + value4++;
  return value3;
}
export function clonePageWithFreshIds(arg13, arg14, arg15 = []) {
  const value5 = clone(arg13);
  ((value5.id = newId("page")),
    (value5.name = arg14),
    (value5.path = uniquePagePath(arg15, arg14)));
  const fn1 = (arg16) => {
    for (const value6 of arg16 || []) ((value6.id = newId("component")), fn1(value6.children));
  };
  return (fn1(value5.components), value5);
}
export function findCustomPopup(arg17, arg18) {
  return (arg17?.customPopups || []).find((arg19) => arg19.id === arg18) || null;
}
export function popupModuleTypeLabel(arg20) {
  return (
    {
      light: "灯光",
      climate: "空调 / 浴霸",
      "air-purifier": "空气净化器",
      "water-heater": "热水器",
      "media-player": "媒体",
      "electric-bed": "电动床",
      switch: "开关 / 按钮",
      cover: "窗帘",
      camera: "摄像头",
      "line-chart": "折线图",
      generic: "通用设备",
      "capability-device": "通用设备",
    }[arg20] || "通用设备"
  );
}
const p = ["auto", "air-conditioner", "bath-heater"];
export function normalizedPopupClimateDeviceType(arg21) {
  return p.includes(arg21) ? arg21 : "auto";
}
export function popupModuleEntityRecommended(arg22, arg23) {
  const value7 = arg22?.domain || String(arg22?.entityId || "").split(".")[0];
  return arg23 === "light"
    ? value7 === "light"
    : arg23 === "climate"
      ? ["climate", "fan"].includes(value7)
      : arg23 === "air-purifier"
        ? value7 === "fan"
        : arg23 === "water-heater"
          ? value7 === "water_heater"
          : arg23 === "media-player"
            ? value7 === "media_player"
            : arg23 === "electric-bed"
              ? ["number", "select", "button", "switch"].includes(value7)
              : arg23 === "switch"
                ? ["switch", "input_boolean", "button"].includes(value7)
                : arg23 === "cover"
                  ? value7 === "cover"
                  : arg23 === "camera"
                    ? value7 === "camera"
                    : arg23 === "line-chart"
                      ? value7 === "sensor"
                      : true;
}
export function reorderedPopupModules(arg24, arg25, arg26 = null, arg27 = false) {
  const list1 = [...(arg24 || [])],
    value8 = list1.findIndex((arg28) => arg28.id === arg25);
  if (value8 < 0 || arg25 === arg26) return list1;
  const [value9] = list1.splice(value8, 1);
  if (!arg26) return (list1.push(value9), list1);
  const value10 = list1.findIndex((arg29) => arg29.id === arg26);
  return value10 < 0
    ? (list1.splice(value8, 0, value9), list1)
    : (list1.splice(value10 + (arg27 ? 1 : 0), 0, value9), list1);
}
export function popupModuleDropPosition(arg30, arg31) {
  const value11 = arg30.getBoundingClientRect(),
    value12 = arg31.clientY - value11.top,
    value13 = Math.min(48, value11.height * 0.22);
  return value12 <= value13
    ? {
        placeAfter: false,
        edge: "top",
      }
    : value12 >= value11.height - value13
      ? {
          placeAfter: true,
          edge: "bottom",
        }
      : arg31.clientX < value11.left + value11.width / 2
        ? {
            placeAfter: false,
            edge: "left",
          }
        : {
            placeAfter: true,
            edge: "right",
          };
}
export function greatestCommonDivisor(arg32, arg33) {
  let value14 = Math.abs(Math.trunc(arg32)),
    value15 = Math.abs(Math.trunc(arg33));
  for (; value15;) [value14, value15] = [value15, value14 % value15];
  return value14 || 1;
}

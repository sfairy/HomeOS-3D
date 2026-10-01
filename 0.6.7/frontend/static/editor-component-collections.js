import { newId } from "./editor-utils.js?v=20260831-editor-utils-v1";
export function componentLabel(arg1) {
  const value1 =
      arg1.type === "image"
        ? "图片"
        : arg1.type === "time"
          ? "时间"
          : arg1.type === "date"
            ? "日期"
            : arg1.type === "weather"
              ? "天气"
              : arg1.type === "percentage-bar"
                ? "百分比柱状图"
                : arg1.type === "line-chart"
                  ? "折线图"
                  : arg1.type === "flow-line"
                    ? "流水线条"
                    : arg1.type === "panel-frame"
                      ? "底图框"
                      : arg1.type === "navigation-button"
                        ? "导航按钮"
                        : arg1.type === "scene-mode"
                          ? "情景模式"
                          : arg1.type === "title-button"
                            ? "标题按钮"
                            : arg1.type === "light-statistics"
                              ? "数量统计"
                              : arg1.type === "icon-button"
                                ? "图标按钮"
                                : arg1.type === "device-button"
                                  ? "设备按钮"
                                  : arg1.type === "presence-sensor"
                                    ? "传感器"
                                    : arg1.type === "air-conditioner"
                                      ? "空调"
                                      : arg1.type === "vacuum-map"
                                        ? "扫地机器人实时地图"
                                        : arg1.type === "camera"
                                          ? "摄像头实时预览"
                                          : arg1.type === "icon-button-effect"
                                            ? "图标按钮（效果）"
                                            : arg1.type === "group"
                                              ? "组合"
                                              : arg1.type,
    value2 = arg1.properties?.instanceName,
    value3 =
      arg1.type === "light-statistics"
        ? /^(?:灯光统计|开灯统计)(_副本\d*)?$/.exec(String(value2 || ""))
        : null,
    value4 =
      arg1.type === "light-statistics" && value2 === "图片"
        ? value1
        : value3
          ? "" + value1 + (value3[1] || "")
          : (arg1.type === "vacuum-map" && value2 === "扫地机地图") ||
              (arg1.type === "camera" && value2 === "摄像头画面")
            ? value1
            : value2;
  return arg1.properties?.label || value4 || arg1.properties?.title || value1;
}
export function nextTemplateInstanceName(arg2, arg3) {
  const set1 = new Set((arg2 || []).map((arg4) => componentLabel(arg4)));
  if (!set1.has(arg3)) return arg3;
  let value5 = arg3 + "_副本",
    value6 = 2;
  for (; set1.has(value5);) ((value5 = arg3 + "_副本" + value6), (value6 += 1));
  return value5;
}
export function groupNameForCollection(arg5, arg6 = "组合") {
  const set2 = new Set((arg5 || []).map((arg7) => componentLabel(arg7)));
  if (!set2.has(arg6)) return arg6;
  let value7 = 2;
  for (; set2.has(arg6 + " " + value7);) value7 += 1;
  return arg6 + " " + value7;
}
export function refreshComponentIds(arg8, arg9 = null) {
  arg8.id = arg9 || newId("component");
  for (const value8 of arg8.children || []) refreshComponentIds(value8);
  return arg8;
}
export function copiedComponentLabel(arg10, arg11) {
  const value9 =
      String(componentLabel(arg10) || "控件")
        .trim()
        .replace(/_副本\d*$/, "") || "控件",
    set3 = new Set((arg11 || []).map((arg12) => String(componentLabel(arg12)).trim()));
  let value10 = value9 + "_副本",
    value11 = 2;
  for (; set3.has(value10);) ((value10 = value9 + "_副本" + value11), (value11 += 1));
  return value10;
}
export function applyCollectionLayerOrder(arg13) {
  for (let value12 = 0; value12 < (arg13 || []).length; value12 += 1) {
    const value13 = arg13[value12];
    value13.position = {
      ...(value13.position || {}),
      zIndex: arg13.length - value12,
    };
  }
}
export function syncSharedComponentReferenceOrder(arg14) {
  const value14 = (arg14.sharedComponents || []).map((arg15) => arg15.id);
  for (const value15 of arg14.pages || []) {
    const set4 = new Set(value15.sharedComponentIds || []);
    value15.sharedComponentIds = value14.filter((arg16) => set4.has(arg16));
  }
}
export function ensureSharedComponentReference(arg17, arg18, arg19) {
  const value16 = (arg17?.pages || []).find((arg20) => arg20.path === arg19),
    value17 = (arg17?.sharedComponents || []).some((arg21) => arg21.id === arg18);
  if (!value16 || !value17) return false;
  const value18 = value16.sharedComponentIds || [];
  return value18.includes(arg18)
    ? false
    : ((value16.sharedComponentIds = [arg18, ...value18.filter((arg22) => arg22 !== arg18)]), true);
}

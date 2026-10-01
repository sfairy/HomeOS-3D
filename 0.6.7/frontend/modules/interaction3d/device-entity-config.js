const d = {
    switch: ["toggle"],
    input_boolean: ["toggle"],
    light: ["toggle"],
    select: ["select"],
    input_select: ["select"],
    number: ["number"],
    input_number: ["number"],
    button: ["press"],
    input_button: ["press"],
    climate: ["climate"],
    fan: ["fan"],
    cover: ["cover"],
    media_player: ["media_player"],
    sensor: [],
    binary_sensor: [],
  },
  o = new Map();
export function registerDeviceCapabilityAdapter(arg1, arg2) {
  return !arg1 || !arg2 || typeof arg2 != "object"
    ? () => {}
    : (o.set(String(arg1), arg2), () => o.delete(String(arg1)));
}
export function deviceCapabilityAdapter(arg3) {
  return o.get(String(arg3 || "")) || null;
}
const u = new Set(["control", "state", "status"]),
  p = (arg4) => String(arg4 || "").split(".")[0];
export function entityCapabilities(arg5, arg6 = null) {
  const value1 = arg5?.entityId || arg5?.entity_id || "",
    value2 = arg5?.domain || p(value1),
    value3 = arg6?.newState || arg6 || {},
    value4 = value3.attributes || arg5?.attributes || {},
    value5 = deviceCapabilityAdapter(value2),
    list1 = [...(value5?.capabilities || d[value2] || [])],
    value6 = value4.supported_features;
  return {
    entityId: value1,
    domain: value2,
    deviceId: arg5?.deviceId || arg5?.device_id || "",
    disabledBy: arg5?.disabledBy || arg5?.disabled_by || null,
    enabled: arg5?.enabled !== false,
    status: arg5?.status || arg5?.syncStatus || "",
    name: arg5?.name || arg5?.friendlyName || value4.friendly_name || value1,
    available:
      value3.available !== false &&
      !["unknown", "unavailable"].includes(String(value3.state || "").toLowerCase()),
    capabilities: list1,
    writable: list1.length > 0,
    readable: true,
    attributes: value4,
    supportedFeatures: Number.isInteger(value6) ? value6 : 0,
    adapter: value5?.name || null,
  };
}
export function deviceEntityCatalog(arg7 = [], arg8 = "", arg9 = new Map()) {
  return arg8
    ? arg7
        .filter((arg10) => (arg10.deviceId || arg10.device_id) === arg8)
        .map((arg11) =>
          entityCapabilities(
            arg11,
            arg9 instanceof Map ? arg9.get(arg11.entityId) : (arg9 || {})[arg11.entityId],
          ),
        )
        .filter((arg12) => arg12.entityId)
        .sort(
          (arg13, arg14) =>
            arg13.domain.localeCompare(arg14.domain) ||
            arg13.name.localeCompare(arg14.name) ||
            arg13.entityId.localeCompare(arg14.entityId),
        )
    : [];
}
export function normalizeDeviceEntitySelection(arg15 = [], arg16 = []) {
  const map1 = new Map(arg16.map((arg17) => [arg17.entityId, arg17])),
    set1 = new Set();
  return arg15
    .filter((arg18) => {
      const value7 = arg18?.entityId + ":" + arg18?.role;
      return !u.has(arg18?.role) || set1.has(value7) || !map1.has(arg18.entityId)
        ? false
        : (set1.add(value7), true);
    })
    .map((arg19) => {
      const value8 = map1.get(arg19.entityId),
        value9 = arg19.role === "control" && !value8.writable ? "state" : arg19.role;
      return {
        entityId: value8.entityId,
        role: value9,
        capabilities: [...value8.capabilities],
      };
    });
}
export function deviceEntityRoleLabel(arg20) {
  return (
    {
      control: "弹窗控制",
      state: "只读状态",
      status: "状态判断",
    }[arg20] || "不显示"
  );
}

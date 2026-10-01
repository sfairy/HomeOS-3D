const g = {
    cpu_total_load: ["CPU 使用率", "system"],
    cpu_user_load: ["CPU 用户使用率", "system"],
    cpu_system_load: ["CPU 系统使用率", "system"],
    cpu_other_load: ["CPU 其他使用率", "system"],
    cpu_1min_load: ["平均负载 · 1 分钟", "system"],
    cpu_15min_load: ["平均负载 · 15 分钟", "system"],
    memory_real_usage: ["内存使用率", "system"],
    temperature: ["系统温度", "system"],
    cpu_temperature: ["CPU 温度", "system"],
    cpu_5min_load: ["平均负载 · 5 分钟", "system"],
    memory_available_real: ["可用内存", "system"],
    memory_total_real: ["总内存", "system"],
    uptime: ["上次启动", "system", "timestamp"],
    network_up: ["上传", "network"],
    network_down: ["下载", "network"],
    volume_percentage_used: ["使用率", "storage"],
    volume_size_used: ["已用空间", "storage"],
    volume_size_total: ["总容量", "storage"],
    volume_status: ["状态", "storage", "status"],
    volume_disk_temp_avg: ["平均磁盘温度", "storage"],
    disk_temp: ["温度", "storage"],
    disk_smart_status: ["S.M.A.R.T.", "health", "status"],
    status: ["安全状态", "health", "problem"],
    disk_exceed_bad_sector_thr: ["坏道告警", "health", "problem"],
    disk_below_remain_life_thr: ["寿命告警", "health", "problem"],
  },
  M = (arg1) => !arg1.disabledBy && !["disabled", "missing"].includes(arg1.status),
  _ = (arg2) => (["fnos", "synology_dsm"].includes(arg2) ? arg2 : null),
  w = Object.keys(g).sort((arg3, arg4) => arg4.length - arg3.length);
function O(arg5) {
  const value1 = arg5.uniqueId || "";
  if (arg5.platform === "synology_dsm") {
    const value3 = value1.match(/^(.+)_[^:]+:([^:]+)$/),
      value4 = value3 && w.find((arg6) => value3[2] === arg6 || value3[2].startsWith(arg6 + "_"));
    return {
      key: arg5.translationKey || value4,
      host: value4 ? value3[1] : null,
    };
  }
  const value2 = w.find((arg7) => value1.endsWith("_" + arg7));
  return {
    key: arg5.translationKey || value2,
    prefix: value2 ? value1.slice(0, -value2.length - 1) : null,
  };
}
const $ = (arg8) =>
    g[arg8.key] || [
      arg8.name || arg8.originalName || arg8.entityId,
      "system",
      arg8.entityId.startsWith("binary_sensor.") ? "status" : "number",
    ],
  x = (arg9) =>
    Object.hasOwn(g, arg9.key) &&
    (g[arg9.key][1] === "system" ||
      arg9.key === "status" ||
      (arg9.platform === "synology_dsm" && g[arg9.key][1] === "network"));
export function nasProfiles(arg10 = [], arg11 = []) {
  const map1 = new Map(arg11.filter(M).map((arg12) => [arg12.deviceId, arg12])),
    map2 = new Map(
      [...map1.values()].map((arg13) => [
        arg13.deviceId,
        new Set((arg13.registryMetadata?.integrations || []).filter(_)),
      ]),
    );
  for (const value7 of arg10)
    value7.status !== "missing" &&
      _(value7.platform) &&
      map2.get(value7.deviceId)?.add(value7.platform);
  const fn1 = (arg14) => [...(map2.get(arg14.deviceId) || [])],
    map3 = new Map(),
    map4 = new Map();
  for (const value8 of map1.values()) {
    if (!value8.registryMetadata || value8.registryMetadata.entryType === "service") continue;
    const value9 = fn1(value8);
    if (value9.length !== 1) continue;
    const value10 = value9[0],
      set1 = new Set();
    let value11 = value8,
      value12 = true;
    for (
      ;
      value11.registryMetadata?.viaDeviceId &&
      !(value10 === "fnos" && value11.registryMetadata.viaDeviceId === value11.deviceId);
    ) {
      if (set1.has(value11.deviceId)) {
        value12 = false;
        break;
      }
      set1.add(value11.deviceId);
      const value14 = map1.get(value11.registryMetadata.viaDeviceId),
        value15 = value11.registryMetadata.configEntryIds || [],
        value16 = value14?.registryMetadata?.configEntryIds || [];
      if (
        !value14?.registryMetadata ||
        value14.registryMetadata.entryType === "service" ||
        fn1(value14).length !== 1 ||
        fn1(value14)[0] !== value10 ||
        (value15.length && value16.length && !value15.some((arg15) => value16.includes(arg15)))
      ) {
        value12 = false;
        break;
      }
      value11 = value14;
    }
    if (!value12) continue;
    const value13 = value10 + ":" + value11.deviceId;
    (map3.has(value13) ||
      map3.set(value13, {
        device: value11,
        platform: value10,
        identities: new Set(),
        metrics: [],
        registry: true,
      }),
      map4.set(value10 + ":" + value8.deviceId, map3.get(value13)));
  }
  const value5 = arg10
    .filter(
      (arg16) =>
        /^(sensor|binary_sensor)\./.test(arg16.entityId) &&
        _(arg16.platform) &&
        map1.has(arg16.deviceId) &&
        arg16.status !== "missing",
    )
    .map((arg17) => ({
      ...arg17,
      ...O(arg17),
    }))
    .filter((arg18) => $(arg18)[2] !== "problem" || arg18.entityId.startsWith("binary_sensor."));
  for (const value17 of value5.filter(
    (arg19) => !map1.get(arg19.deviceId).registryMetadata && x(arg19),
  )) {
    const value18 = value17.platform + ":" + value17.deviceId;
    map3.has(value18) ||
      map3.set(value18, {
        device: map1.get(value17.deviceId),
        platform: value17.platform,
        identities: new Set(),
        metrics: [],
      });
    const value19 = map3.get(value18),
      value20 = value17.host || value17.prefix;
    value20 && value19.identities.add(value20);
  }
  const list1 = [...map3.values()];
  for (const value21 of value5.filter(M)) {
    let value22 = map4.get(value21.platform + ":" + value21.deviceId);
    if (map1.get(value21.deviceId).registryMetadata) {
      value22 && value22.metrics.push(value21);
      continue;
    }
    if (!Object.hasOwn(g, value21.key)) continue;
    const value23 = list1.filter((arg20) => !arg20.registry && arg20.platform === value21.platform);
    if (
      ((value22 = value23.find((arg21) => arg21.device.deviceId === value21.deviceId)), !value22)
    ) {
      const value24 = value23.filter((arg22) =>
        [...arg22.identities].some((arg23) =>
          value21.host
            ? value21.host === arg23
            : value21.prefix &&
              (value21.prefix === arg23 || value21.prefix.startsWith(arg23 + "_")),
        ),
      );
      if (value24.length === 1) value22 = value24[0];
      else {
        if (!value24.length) {
          const value25 = map1.get(value21.deviceId)?.name,
            value26 = value23.filter(
              (arg24) =>
                !(arg24.identities.size && (value21.host || value21.prefix)) &&
                arg24.device.name &&
                value25?.startsWith(arg24.device.name + " ("),
            );
          value26.length === 1 && (value22 = value26[0]);
        }
      }
    }
    value22 && value22.metrics.push(value21);
  }
  const value6 = Object.keys(g),
    fn2 = (arg25) => (value6.includes(arg25.key) ? value6.indexOf(arg25.key) : value6.length);
  return list1
    .filter((arg26) => arg26.registry || arg26.metrics.length)
    .map((arg27) => {
      arg27.metrics.sort(
        (arg28, arg29) => fn2(arg28) - fn2(arg29) || arg28.entityId.localeCompare(arg29.entityId),
      );
      const value27 = arg27.metrics.slice(),
        value28 = value27.find(x) || value27[0];
      return {
        deviceId: arg27.device.deviceId,
        name: arg27.device.name || value28?.name || "NAS",
        platform: arg27.platform,
        primaryEntityId: value28?.entityId || "",
        metrics: value27.map((arg30) => {
          const value29 = $(arg30),
            value30 = map1.get(arg30.deviceId),
            value31 =
              arg30.deviceId === arg27.device.deviceId
                ? ""
                : value30?.name?.match(/\(([^)]+)\)$/)?.[1] || value30?.name || "";
          return {
            entityId: arg30.entityId,
            label: "" + (value31 ? value31 + " · " : "") + value29[0],
            group: value29[1],
            kind: value29[2] || "number",
          };
        }),
      };
    })
    .sort((arg31, arg32) => arg31.name.localeCompare(arg32.name));
}
export function reconcileNasSource(arg33, arg34) {
  if (!arg33 || !arg34 || arg33.deviceId !== arg34.deviceId) return false;
  const map5 = new Map(
      (arg33.metrics || []).map((arg35, arg36) => [
        arg35.entityId,
        {
          metric: arg35,
          index: arg36,
        },
      ]),
    ),
    value32 = [...(arg34.metrics || [])].sort(
      (arg37, arg38) =>
        (map5.get(arg37.entityId)?.index ?? Infinity) -
          (map5.get(arg38.entityId)?.index ?? Infinity) ||
        arg37.entityId.localeCompare(arg38.entityId),
    ),
    set2 = new Set(arg33.visibleMetrics || (arg33.metrics || []).map((arg39) => arg39.entityId)),
    value33 = value32.filter((arg40) => set2.has(arg40.entityId)).map((arg41) => arg41.entityId);
  return arg33.name !== arg34.name ||
    arg33.platform !== arg34.platform ||
    arg33.primaryEntityId !== (arg34.primaryEntityId || "") ||
    JSON.stringify(arg33.metrics || []) !== JSON.stringify(value32) ||
    JSON.stringify(arg33.visibleMetrics || []) !== JSON.stringify(value33)
    ? ((arg33.name = arg34.name),
      (arg33.platform = arg34.platform),
      (arg33.primaryEntityId = arg34.primaryEntityId || ""),
      (arg33.metrics = value32),
      (arg33.visibleMetrics = value33),
      true)
    : false;
}
export function reconcileNasDocument(arg42, arg43) {
  let value34 = false;
  const fn3 = (arg44) => {
    for (const value35 of arg44 || []) {
      if (value35.type === "interaction3d") {
        for (const value36 of value35.properties?.devices?.nas || [])
          reconcileNasSource(value36.statusSource, arg43.get(value36.statusSource?.deviceId)) &&
            (value34 = true);
      }
      fn3(value35.children);
    }
  };
  fn3(arg42?.sharedComponents);
  for (const value37 of arg42?.pages || []) fn3(value37.components);
  return value34;
}

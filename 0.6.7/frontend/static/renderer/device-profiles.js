const R = new Set(["xiaomi_miot", "xiaomi_home"]);
function p(...arg1) {
  return arg1
    .flat()
    .map((arg2) => String(arg2 || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function k(arg3) {
  return (
    !!arg3?.entityId && !arg3.disabledBy && arg3.status !== "missing" && arg3.status !== "disabled"
  );
}
function A(arg4, arg5) {
  const value1 = String(arg4?.domain || arg4?.entityId || "").split(".", 1)[0],
    value2 = p(
      arg4?.entityId,
      arg4?.name,
      arg4?.originalName,
      arg4?.translationKey,
      arg4?.uniqueId,
    ),
    value3 = String(arg4?.originalName || "")
      .trim()
      .toLowerCase();
  if (arg5 === "climate")
    return value1 === "climate"
      ? 100 + (/ptc.?bath|bath.?heater|浴霸|风暖/.test(value2) ? 40 : 0)
      : -1;
  if (arg5 === "cover") return value1 === "cover" ? 100 : -1;
  if (arg5 === "fan")
    return value1 === "fan" ? 100 + (/air.?purifier|airp|空气净化/.test(value2) ? 20 : 0) : -1;
  if (arg5 === "light") {
    if (value1 !== "light") return -1;
    let value4 = 100;
    return (
      String(arg4.translationKey || "").toLowerCase() === "light" && (value4 += 80),
      ["灯", "灯光", "照明"].includes(value3) && (value4 += 70),
      /(?:^|[_\s-])s_?2(?:[_\s-]|$)/.test(value2) && (value4 += 25),
      /indicator|ambient|night.?light|指示灯|氛围灯|夜灯/.test(value2) && (value4 -= 140),
      value4
    );
  }
  return arg5 === "power"
    ? ["switch", "input_boolean"].includes(value1)
      ? 100 + (/(?:^|[_\s-])(on|power|heating)(?:[_\s-]|$)|开关|取暖|加热/.test(value2) ? 35 : 0)
      : -1
    : arg5 === "mode"
      ? value1 !== "select"
        ? -1
        : 100 + (/mode|preset|模式|档位/.test(value2) ? 35 : 0)
      : arg5 === "temperature"
        ? ["sensor", "number"].includes(value1)
          ? /temperature|target.?temp|温度/.test(value2)
            ? 130
            : 20
          : -1
        : arg5 === "humidity"
          ? value1 === "sensor" && /humidity|湿度/.test(value2)
            ? 130
            : -1
          : arg5 === "pm25"
            ? value1 === "sensor" && /pm.?2[._ ]?5|pm25|particulate|颗粒物/.test(value2)
              ? 140
              : -1
            : arg5 === "hcho"
              ? value1 !== "sensor" ||
                !/hcho|formaldehyde|甲醛/.test(value2) ||
                /original|raw|tag|serial|(?:^|[_\s-])sn(?:[_\s-]|$)|原始|标签|流水号|编号/.test(
                  value2,
                )
                ? -1
                : /density|concentration|密度|浓度/.test(value2)
                  ? 190
                  : 160
              : arg5 === "pm10"
                ? value1 === "sensor" && /pm.?10|粉尘/.test(value2)
                  ? 150
                  : -1
                : arg5 === "filterLeftTime"
                  ? value1 !== "sensor" || /used|elapsed|已使用/.test(value2)
                    ? -1
                    : /filter.*(?:left|remaining).*(?:time|hour)|(?:left|remaining).*(?:time|hour).*filter|滤芯.*(?:剩余时间|剩余时长)/.test(
                          value2,
                        )
                      ? 180
                      : -1
                  : arg5 === "filterLife"
                    ? value1 !== "sensor" ||
                      /serial|factory|product|tag|date|(?:^|[_\s-])sn(?:[_\s-]|$)|used|time|hour|流水号|工厂|生产|标签|类型码|已使用|剩余时间|剩余时长/.test(
                        value2,
                      )
                      ? -1
                      : /filter.*(?:life|level)|(?:life|level).*filter|滤芯.*寿命|剩余寿命/.test(
                            value2,
                          )
                        ? 180
                        : /滤芯/.test(value2)
                          ? 135
                          : -1
                    : arg5 === "airQuality" &&
                        value1 === "sensor" &&
                        /air.?quality|aqi|空气质量/.test(value2)
                      ? 130
                      : -1;
}
function D(arg6, arg7) {
  return (
    arg6
      .map((arg8) => ({
        entity: arg8,
        score: A(arg8, arg7),
      }))
      .filter((arg9) => arg9.score >= 0)
      .sort(
        (arg10, arg11) =>
          arg11.score - arg10.score ||
          String(arg10.entity.entityId || "").length - String(arg11.entity.entityId || "").length ||
          String(arg10.entity.entityId || "").localeCompare(String(arg11.entity.entityId || "")),
      )[0]?.entity || null
  );
}
function y(arg12, arg13) {
  return (
    arg12
      .filter((arg14) => {
        const value5 = String(arg14?.domain || arg14?.entityId || "").split(".", 1)[0],
          value6 = p(
            arg14?.entityId,
            arg14?.name,
            arg14?.originalName,
            arg14?.translationKey,
            arg14?.uniqueId,
          );
        return arg13 === "backrest"
          ? value5 === "number" && /backrest|靠背/.test(value6)
          : arg13 === "leg"
            ? value5 === "number" && /leg|腿部|腿/.test(value6)
            : arg13 === "waist"
              ? value5 === "number" && /waist|腰部|腰/.test(value6)
              : arg13 === "mode"
                ? value5 === "select" &&
                  /mode|模式/.test(value6) &&
                  !/memory|记忆|姿势/.test(value6)
                : arg13 === "memory"
                  ? ["button", "select"].includes(value5) && /memory|记忆|姿势/.test(value6)
                  : false;
      })
      .sort((arg15, arg16) =>
        String(arg15.entityId || "").localeCompare(String(arg16.entityId || "")),
      )[0] || null
  );
}
export function xiaomiIntegration(arg17) {
  const value7 = String(arg17?.platform || "")
    .trim()
    .toLowerCase();
  return R.has(value7) ? value7 : "";
}
export function resolveXiaomiDeviceProfile(
  arg18,
  arg19 = new Map(),
  arg20 = new Map(),
  arg21 = new Map(),
) {
  const value8 = arg19?.get?.(arg18) || null,
    value9 = xiaomiIntegration(value8);
  if (!value8 || !value9) return null;
  const value10 = String(value8.deviceId || ""),
    value11 = (value10 && arg20?.get?.(value10)) || null,
    value12 = [...(arg19?.values?.() || [])].filter(
      (arg22) =>
        k(arg22) &&
        (value10 ? arg22.deviceId === value10 : arg22.entityId === arg18) &&
        xiaomiIntegration(arg22) === value9,
    );
  !value12.some((arg23) => arg23.entityId === value8.entityId) && k(value8) && value12.push(value8);
  const value13 = arg21?.get?.(arg18),
    value14 = value13?.newState || value13 || {},
    value15 = p(
      value9,
      value11?.name,
      value11?.manufacturer,
      value11?.model,
      value14?.attributes?.friendly_name,
      value12.flatMap((arg24) => [
        arg24.entityId,
        arg24.name,
        arg24.originalName,
        arg24.translationKey,
        arg24.uniqueId,
      ]),
    ),
    value16 = Object.fromEntries(
      [
        "climate",
        "cover",
        "fan",
        "light",
        "power",
        "mode",
        "temperature",
        "humidity",
        "pm25",
        "hcho",
        "pm10",
        "filterLife",
        "filterLeftTime",
        "airQuality",
      ]
        .map((arg25) => [arg25, D(value12, arg25)?.entityId || ""])
        .filter(([, arg26]) => arg26),
    ),
    object1 = {
      backrest: y(value12, "backrest")?.entityId || "",
      leg: y(value12, "leg")?.entityId || "",
      waist: y(value12, "waist")?.entityId || "",
      mode: y(value12, "mode")?.entityId || "",
    },
    value17 = value12
      .filter(
        (arg27) => String(arg27?.domain || arg27?.entityId || "").split(".", 1)[0] === "select",
      )
      .sort((arg28, arg29) =>
        String(arg28.entityId || "").localeCompare(String(arg29.entityId || "")),
      );
  if (value17.length) {
    const fn1 = (arg30) => {
        const value32 = p(
            arg30.entityId,
            arg30.name,
            arg30.originalName,
            arg30.translationKey,
            arg30.uniqueId,
          ),
          value33 = arg21?.get?.(arg30.entityId)?.attributes?.options,
          value34 = /mode|模式|工作模式|operation|function/.test(value32) ? 320 : 0,
          value35 = /memory|记忆|姿势/.test(value32) ? -520 : 0;
        return value34 + value35 + Math.min(80, Number(value33?.length || 0) * 8);
      },
      value30 = value17.filter(
        (arg31) =>
          !/memory|记忆|姿势/.test(
            p(arg31.entityId, arg31.name, arg31.originalName, arg31.translationKey, arg31.uniqueId),
          ),
      ),
      value31 = (value30.length ? value30 : value17).sort(
        (arg32, arg33) =>
          fn1(arg33) - fn1(arg32) ||
          String(arg32.entityId || "").localeCompare(String(arg33.entityId || "")),
      );
    object1.mode = value31[0]?.entityId || object1.mode;
  }
  const value18 = value12
      .filter((arg34) => {
        const value36 = String(arg34?.domain || arg34?.entityId || "").split(".", 1)[0],
          value37 = p(
            arg34?.entityId,
            arg34?.name,
            arg34?.originalName,
            arg34?.translationKey,
            arg34?.uniqueId,
          );
        return ["button", "select"].includes(value36) && /memory|记忆|姿势/.test(value37);
      })
      .sort((arg35, arg36) =>
        String(arg35.entityId || "").localeCompare(String(arg36.entityId || "")),
      ),
    value19 = value12
      .filter(
        (arg37) => String(arg37?.domain || arg37?.entityId || "").split(".", 1)[0] === "button",
      )
      .sort((arg38, arg39) =>
        String(arg38.entityId || "").localeCompare(String(arg39.entityId || "")),
      ),
    value20 = value12
      .filter(
        (arg40) =>
          String(arg40?.domain || arg40?.entityId || "").split(".", 1)[0] === "select" &&
          arg40.entityId !== object1.mode,
      )
      .sort((arg41, arg42) =>
        String(arg41.entityId || "").localeCompare(String(arg42.entityId || "")),
      ),
    value21 = value19.length ? value19 : value20,
    value22 = value18.length ? value18 : value21;
  ((object1.memory1 = value22[0]?.entityId || ""), (object1.memory2 = value22[1]?.entityId || ""));
  const value23 = /electric.?bed|smart.?bed|bed\.\d+|milan|电动床|智能床/.test(value15),
    value24 = !!(object1.backrest && object1.leg && object1.waist && object1.mode),
    value25 = String(value8.domain || value8.entityId || "").split(".", 1)[0],
    value26 = /bath.?heater|ptc.?bath|(?:^|[._-])bhf(?:[._-]|$)|浴霸|风暖|暖风机/.test(value15),
    value27 = /air.?condition|aircondition|aircon|空调/.test(value15),
    value28 = /air.?purifier|(?:^|[._-])airp(?:[._-]|$)|空气净化/.test(value15);
  let text1 = "generic";
  value23 || value24
    ? (text1 = "electric-bed")
    : value26 && (value16.climate || value16.fan)
      ? (text1 = "bath-heater")
      : value27 && value16.climate
        ? (text1 = "air-conditioner")
        : value16.cover
          ? (text1 = "cover")
          : value28 && value16.fan
            ? (text1 = "air-purifier")
            : value16.climate
              ? (text1 = value25 === "climate" ? "air-conditioner" : "generic")
              : value16.fan
                ? (text1 = "fan")
                : value16.light && value25 === "light"
                  ? (text1 = "light")
                  : value16.power &&
                    ["switch", "input_boolean"].includes(value25) &&
                    (text1 = "switch");
  const value29 =
    value16.cover && /airer|clothes.?rack|laundry.?rack|晾衣机|晾衣架/.test(value15)
      ? "airer"
      : value16.cover && /dream|vertical|novo\.curtain|梦幻|竖帘|垂直帘/.test(value15)
        ? "dream"
        : value16.cover
          ? "standard"
          : "";
  return {
    integration: value9,
    integrationLabel: value9 === "xiaomi_home" ? "Xiaomi Home" : "Xiaomi Miot",
    deviceId: value10,
    deviceName: String(value11?.name || value14?.attributes?.friendly_name || value8.name || arg18),
    manufacturer: String(value11?.manufacturer || ""),
    model: String(value11?.model || ""),
    deviceType: text1,
    coverKind: value29,
    roles: {
      primary:
        value16.climate || value16.cover || value16.fan || value16.light || value16.power || arg18,
      ...value16,
      ...(text1 === "electric-bed" ? object1 : {}),
    },
    entityIds: value12.map((arg43) => arg43.entityId),
    confidence: text1 === "generic" ? "standard-fallback" : "xiaomi-profile",
  };
}
export function applyXiaomiDeviceProfile(arg44, arg45) {
  if (!arg44 || !arg45) return arg44;
  const object2 = {
    ...(arg44.properties || {}),
  };
  return (
    (!object2.deviceType || object2.deviceType === "auto") &&
      ["air-conditioner", "bath-heater"].includes(arg45.deviceType) &&
      (object2.deviceType = arg45.deviceType),
    (!object2.coverKind || object2.coverKind === "auto") &&
      arg45.coverKind &&
      (object2.coverKind = arg45.coverKind),
    {
      ...arg44,
      properties: object2,
    }
  );
}

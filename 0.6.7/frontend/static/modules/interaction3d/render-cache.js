export const RENDER_CACHE_VERSION = "i3d-light-delta-20260916-warm-refine-v6";
export function stableCacheJSON(arg1) {
  return JSON.stringify(arg1, (arg2, arg3) =>
    arg3 && typeof arg3 == "object" && !Array.isArray(arg3)
      ? Object.fromEntries(
          Object.keys(arg3)
            .sort()
            .map((arg4) => [arg4, arg3[arg4]]),
        )
      : arg3,
  );
}
export function sha256(arg5) {
  const value1 = new TextEncoder().encode(arg5),
    value2 = value1.length,
    uint8Array1 = new Uint8Array(Math.ceil((value2 + 9) / 64) * 64);
  (uint8Array1.set(value1), (uint8Array1[value2] = 128));
  const dataView1 = new DataView(uint8Array1.buffer);
  (dataView1.setUint32(uint8Array1.length - 8, Math.floor(value2 / 536870912)),
    dataView1.setUint32(uint8Array1.length - 4, value2 * 8));
  const list1 = [],
    list2 = [],
    list3 = [];
  for (let value4 = 2; list1.length < 64; value4++)
    list1.some((arg6) => value4 % arg6 === 0) ||
      (list1.push(value4),
      list2.push(((Math.cbrt(value4) % 1) * 4294967296) >>> 0),
      list3.length < 8 && list3.push(((Math.sqrt(value4) % 1) * 4294967296) >>> 0));
  const fn1 = (arg7, arg8) => (arg7 >>> arg8) | (arg7 << (32 - arg8)),
    uint32Array1 = new Uint32Array(64),
    value3 = list3;
  for (let value5 = 0; value5 < uint8Array1.length; value5 += 64) {
    for (let value14 = 0; value14 < 16; value14++)
      uint32Array1[value14] = dataView1.getUint32(value5 + value14 * 4);
    for (let value15 = 16; value15 < 64; value15++) {
      const value16 = uint32Array1[value15 - 15],
        value17 = uint32Array1[value15 - 2];
      uint32Array1[value15] =
        uint32Array1[value15 - 16] +
        (fn1(value16, 7) ^ fn1(value16, 18) ^ (value16 >>> 3)) +
        uint32Array1[value15 - 7] +
        (fn1(value17, 17) ^ fn1(value17, 19) ^ (value17 >>> 10));
    }
    let [value6, value7, value8, value9, value10, value11, value12, value13] = value3;
    for (let value18 = 0; value18 < 64; value18++) {
      const value19 =
          (value13 +
            (fn1(value10, 6) ^ fn1(value10, 11) ^ fn1(value10, 25)) +
            ((value10 & value11) ^ (~value10 & value12)) +
            list2[value18] +
            uint32Array1[value18]) >>>
          0,
        value20 =
          ((fn1(value6, 2) ^ fn1(value6, 13) ^ fn1(value6, 22)) +
            ((value6 & value7) ^ (value6 & value8) ^ (value7 & value8))) >>>
          0;
      ((value13 = value12),
        (value12 = value11),
        (value11 = value10),
        (value10 = (value9 + value19) >>> 0),
        (value9 = value8),
        (value8 = value7),
        (value7 = value6),
        (value6 = (value19 + value20) >>> 0));
    }
    [value6, value7, value8, value9, value10, value11, value12, value13].forEach((arg9, arg10) => {
      value3[arg10] = (value3[arg10] + arg9) >>> 0;
    });
  }
  return value3.map((arg11) => arg11.toString(16).padStart(8, "0")).join("");
}
export function lightLayerKey(arg12, arg13) {
  return sha256(
    stableCacheJSON({
      version: RENDER_CACHE_VERSION,
      base: arg12,
      lamp: arg13.item,
      floor: arg13.floor.id,
    }),
  );
}
export function cacheSceneDescriptor(arg14) {
  const fn2 = (arg15, arg16) =>
    Object.fromEntries(Object.entries(arg15 || {}).filter(([arg17]) => !arg16.includes(arg17)));
  return arg14.map((arg18) => ({
    ...arg18,
    name: undefined,
    scene: {
      ...arg18.scene,
      settings: fn2(arg18.scene.settings, [
        "cameraView",
        "cameraMode",
        "cameraFocalLength",
        "cameraTopRotation",
        "fixedCameraView",
        "planViewRotation",
        "livePreviewEnabled",
        "previewPanelRatio",
        "detailsPanelWidthRatio",
      ]),
      lightGroups: arg18.scene.lightGroups?.map((arg19) => fn2(arg19, ["enabled", "name"])),
      items: arg18.scene.items.map((arg20) =>
        ["downlight", "ceilinglight", "striplight"].includes(arg20.type)
          ? fn2(arg20, ["lightBrightness", "lightTemperature", "lightColorRgb"])
          : arg20,
      ),
    },
  }));
}
export function createRenderCache({
  sceneId: arg21,
  projectId: arg22,
  fetcher: arg23 = globalThis.fetch,
  decode: arg24 = (arg32) => createImageBitmap(arg32),
  maxBytes: arg25 = 32 * 1024 * 1024,
  timeoutMs: arg26 = 1800,
  now: arg27 = Date.now,
  report: arg28 = () => {},
  makeCanvas: arg29 = () => document.createElement("canvas"),
  maxDecodedBytes: arg30 = 32 * 1024 * 1024,
  maxDecodedFrames: arg31 = 3,
} = {}) {
  const map1 = new Map(),
    set1 = new Set(),
    map2 = new Map(),
    map3 = new Map(),
    map4 = new Map();
  let value21 = 0,
    value22 = 0,
    value23 = 0,
    value24 = false,
    value25 = false,
    value26 = 0;
  const object1 = {
      memoryHits: 0,
      serverHits: 0,
      misses: 0,
      generated: 0,
      uploads: 0,
      errors: 0,
      decodedHits: 0,
    },
    fn3 = () =>
      arg28({
        ...object1,
        memoryBytes: value22,
        pendingBytes: value23,
        decodedBytes: value21,
        decodedFrames: map3.size,
      });
  function fn4(arg33) {
    (arg33.refs--, !arg33.retained && arg33.refs === 0 && arg33.image.close());
  }
  function fn5(arg34) {
    const value27 = map3.get(arg34);
    value27 &&
      (map3.delete(arg34),
      (value21 -= value27.bytes),
      (value27.retained = false),
      value27.refs || value27.image.close());
  }
  function fn6(arg35, arg36, arg37, arg38) {
    fn5(arg35);
    const object3 = {
      image: arg36,
      width: arg37,
      height: arg38,
      bytes: arg37 * arg38 * 4,
      refs: 1,
      retained: true,
    };
    for (map3.set(arg35, object3), value21 += object3.bytes; value21 > arg30 || map3.size > arg31;)
      fn5(map3.keys().next().value);
    return object3;
  }
  function fn7(arg39) {
    arg39.refs++;
    let value28 = false;
    return {
      image: arg39.image,
      width: arg39.width,
      height: arg39.height,
      close() {
        value28 || ((value28 = true), fn4(arg39));
      },
    };
  }
  const fn8 = (arg40) =>
    "/api/v1/modules/interaction3d/scenes/" +
    encodeURIComponent(arg21) +
    "/render-cache/" +
    arg40 +
    "?projectId=" +
    encodeURIComponent(arg22 || "");
  function fn9(arg41, arg42) {
    for (
      map1.has(arg41) && (value22 -= map1.get(arg41).size),
        map1.delete(arg41),
        arg42.size <= arg25 && (map1.set(arg41, arg42), (value22 += arg42.size));
      value22 > arg25 || map1.size > 64;
    ) {
      const value29 = map1.keys().next().value;
      ((value22 -= map1.get(value29).size), map1.delete(value29));
    }
  }
  async function fn10(arg43, arg44 = {}, arg45 = () => true) {
    if (value25 || arg27() < value26) return null;
    const abortController1 = new AbortController();
    set1.add(abortController1);
    const value30 = setTimeout(() => abortController1.abort(), arg26),
      value31 = arg44.method
        ? null
        : setInterval(() => {
            arg45() || abortController1.abort("stale");
          }, 50);
    try {
      const value32 = await arg23(fn8(arg43), {
          ...arg44,
          credentials: "same-origin",
          signal: abortController1.signal,
        }),
        value33 =
          !arg44.method &&
          value32.status === 404 &&
          !value32.headers?.get("content-type")?.includes("application/json");
      if (!value32.ok && !value33) throw new Error("cache unavailable");
      return !arg44.method && (value32.status === 204 || value33)
        ? null
        : arg44.method
          ? value32
          : value32.ok
            ? await value32.blob()
            : null;
    } catch {
      return (!value25 && arg45() && (object1.errors++, (value26 = arg27() + 15000)), null);
    } finally {
      (clearTimeout(value30), clearInterval(value31), set1.delete(abortController1));
    }
  }
  async function fn11() {
    if (!(value24 || value25)) {
      value24 = true;
      try {
        for (; map2.size && !value25;) {
          const [value34, value35] = map2.entries().next().value;
          (map2.delete(value34),
            (value23 -= value35.size),
            (
              await fn10(value34, {
                method: "PUT",
                headers: {
                  "Content-Type": "image/png",
                },
                body: value35,
              })
            )?.ok && object1.uploads++,
            fn3());
        }
      } finally {
        value24 = false;
      }
    }
  }
  const fn12 = (arg46, arg47, arg48) => {
      const list4 = [];
      for (let value36 = 0; value36 < arg48; value36 += 1024)
        for (let value37 = 0; value37 < arg47; value37 += 1024)
          list4.push({
            x: value37,
            y: value36,
            width: Math.min(1024, arg47 - value37),
            height: Math.min(1024, arg48 - value36),
            key: sha256(arg46 + ":tile-v1:" + arg47 + ":" + arg48 + ":" + value37 + ":" + value36),
          });
      return list4;
    },
    object2 = {
      stats: object1,
      get closed() {
        return value25;
      },
      async acquire(arg49, arg50, arg51, arg52 = () => true) {
        if (value25 || !arg49 || !arg52()) return null;
        const value38 = arg49 + ":" + arg50 + ":" + arg51,
          value39 = map3.get(value38);
        if (value39)
          return (
            map3.delete(value38),
            map3.set(value38, value39),
            object1.decodedHits++,
            fn3(),
            fn7(value39)
          );
        let value40 = map4.get(value38);
        value40 ||
          ((value40 = {
            waiters: new Set(),
            entry: null,
          }),
          map4.set(value38, value40));
        const fn13 = () => !value25 && arg52();
        (value40.waiters.add(fn13),
          value40.promise ||
            (value40.promise = object2
              .read(arg49, arg50, arg51, () => [...value40.waiters].some((arg53) => arg53()))
              .then((arg54) =>
                arg54
                  ? value25 || ![...value40.waiters].some((arg55) => arg55())
                    ? (arg54.close(), null)
                    : ((value40.entry = fn6(value38, arg54, arg50, arg51)), fn3(), value40.entry)
                  : null,
              )));
        try {
          const value41 = await value40.promise;
          return value41 && fn13() ? fn7(value41) : null;
        } finally {
          (value40.waiters.delete(fn13),
            value40.waiters.size || (map4.delete(value38), value40.entry && fn4(value40.entry)));
        }
      },
      async read(arg56, arg57, arg58, arg59 = () => true) {
        if (value25 || !arg56 || !arg59()) return null;
        if (arg57 * arg58 > 2097152) {
          const value45 = arg29();
          ((value45.width = arg57), (value45.height = arg58));
          let value46 = false;
          try {
            const value47 = value45.getContext("2d");
            if (!value47) return null;
            for (const value48 of fn12(arg56, arg57, arg58)) {
              const value49 = await object2.read(value48.key, value48.width, value48.height, arg59);
              if (!value49) return null;
              try {
                if (value25 || !arg59()) return null;
                value47.drawImage(value49, value48.x, value48.y);
              } finally {
                value49.close();
              }
            }
            return (
              (value45.close = () => {
                value45.width = value45.height = 0;
              }),
              (value46 = true),
              value45
            );
          } finally {
            value46 || (value45.width = value45.height = 0);
          }
        }
        let value42 = map1.get(arg56),
          value43 = value42 ? "memoryHits" : "serverHits";
        if ((value42 || (value42 = await fn10(arg56, {}, arg59)), value25 || !arg59())) return null;
        if (!value42 || value42.size > 10 * 1024 * 1024 || value42.type !== "image/png")
          return (object1.misses++, fn3(), null);
        let value44;
        try {
          if (
            ((value44 = await arg24(value42)),
            value25 || !arg59() || value44.width !== arg57 || value44.height !== arg58)
          )
            throw new Error("stale image");
          return (fn9(arg56, value42), object1[value43]++, fn3(), value44);
        } catch {
          return (
            value44?.close?.(),
            map1.has(arg56) && ((value22 -= map1.get(arg56).size), map1.delete(arg56)),
            object1.misses++,
            fn3(),
            null
          );
        }
      },
      async write(arg60, arg61, arg62 = () => true) {
        if (value25 || !arg60 || !arg62()) return;
        if (arg61.width * arg61.height > 2097152) {
          const value51 = arg29();
          try {
            for (const value52 of fn12(arg60, arg61.width, arg61.height)) {
              if (value25 || !arg62()) return;
              ((value51.width = value52.width), (value51.height = value52.height));
              const value53 = value51.getContext("2d");
              if (!value53) return;
              (value53.drawImage(
                arg61,
                value52.x,
                value52.y,
                value52.width,
                value52.height,
                0,
                0,
                value52.width,
                value52.height,
              ),
                await object2.write(value52.key, value51, arg62));
            }
          } finally {
            value51.width = value51.height = 0;
          }
          return;
        }
        let value50;
        try {
          value50 = await new Promise((arg63) => arg61.toBlob(arg63, "image/png"));
        } catch {
          (object1.errors++, fn3());
          return;
        }
        value25 ||
          !arg62() ||
          !value50 ||
          value50.size > 10 * 1024 * 1024 ||
          (fn9(arg60, value50),
          object1.generated++,
          value23 + value50.size <= 16 * 1024 * 1024 &&
            map2.size < 32 &&
            arg27() >= value26 &&
            !map2.has(arg60) &&
            (map2.set(arg60, value50), (value23 += value50.size), fn11()),
          fn3());
      },
      close() {
        value25 = true;
        for (const value54 of set1) value54.abort();
        for (const value55 of map3.keys()) fn5(value55);
        (map1.clear(), map2.clear(), (value22 = value23 = 0), fn3());
      },
    };
  return object2;
}

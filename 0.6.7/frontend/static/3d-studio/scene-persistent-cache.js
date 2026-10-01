export const SCENE_PREPARATION_VERSION = "20260923-v1";
const f = "scenes",
  B = 8,
  C = 33554432,
  I = 8388608;
export function scenePreparationKey(arg1, arg2, arg3, arg4 = "") {
  return arg1 && arg2 && arg3
    ? JSON.stringify([SCENE_PREPARATION_VERSION, arg1, arg2, arg3, arg4])
    : "";
}
function K(arg5) {
  return (
    arg5?.schemaVersion === 7 &&
    Array.isArray(arg5.floors) &&
    arg5.floors.length > 0 &&
    arg5.floors.some((arg6) => arg6.id === arg5.activeFloorId) &&
    arg5.baseLighting &&
    arg5.combinedCameraSettings &&
    arg5.floors.every(
      (arg7) =>
        arg7.id &&
        arg7.scene?.settings &&
        ["walls", "items", "doors", "windows", "railings"].every((arg8) =>
          Array.isArray(arg7.scene[arg8]),
        ),
    )
  );
}
export function reusableScenePreparation(arg9, arg10) {
  return (
    !!arg9 &&
    arg9.version === SCENE_PREPARATION_VERSION &&
    typeof arg10?.syncKey == "string" &&
    !!arg10.syncKey &&
    arg9.syncKey === arg10.syncKey &&
    K(arg9.document)
  );
}
export function createScenePersistentCache({
  env: arg11 = globalThis,
  timeoutMs: arg12 = 120,
} = {}) {
  let value1,
    value2,
    value3 = false,
    value4 = Promise.resolve();
  const map1 = new Map(),
    map2 = new Map(),
    object1 = {
      hits: 0,
      writes: 0,
      fallbacks: 0,
    },
    value5 =
      new URLSearchParams(arg11.location?.search || "").get("performance-diagnostics") === "1",
    fn1 = (arg13) => {
      value5 &&
        arg11.console?.info(
          "[3D-scene-cache]",
          JSON.stringify({
            event: arg13,
            ...object1,
          }),
        );
    };
  function fn2(arg14, arg15 = arg12) {
    return new Promise((arg16) => {
      let value6 = false;
      const fn6 = (arg17) => {
          value6 || ((value6 = true), arg11.clearTimeout(value7), arg16(arg17));
        },
        value7 = arg11.setTimeout(() => {
          (object1.fallbacks++, fn6(null));
        }, arg15);
      try {
        arg14(fn6);
      } catch {
        fn6(null);
      }
    });
  }
  function fn3() {
    return value3
      ? Promise.resolve(null)
      : ((value1 ||= fn2((arg18) => {
          if (!arg11.indexedDB) {
            arg18(null);
            return;
          }
          const value8 = arg11.indexedDB.open("ha-bridge-3d-scenes", 1);
          let value9 = false;
          ((value8.onupgradeneeded = () =>
            value8.result.createObjectStore(f, {
              keyPath: "key",
            })),
            (value8.onerror = value8.onblocked =
              () => {
                ((value9 = true), arg18(null));
              }),
            (value8.onsuccess = () => {
              const value10 = value8.result;
              if (value3 || value9) {
                (value10.close(), arg18(null));
                return;
              }
              ((value2 = value10),
                (value10.onversionchange = () => {
                  ((value3 = true), value10.close());
                }),
                arg18(value10));
            }));
        }, 1500)),
        value1);
  }
  function fn4(arg19) {
    return !arg19 || value3
      ? Promise.resolve(null)
      : (map1.has(arg19) ||
          map1.set(
            arg19,
            fn2((arg20) => {
              fn3()
                .then((arg21) => {
                  if (!arg21 || value3) {
                    arg20(null);
                    return;
                  }
                  try {
                    const value11 = arg21.transaction(f, "readonly"),
                      value12 = value11.objectStore(f).get(arg19);
                    ((value12.onerror = value11.onabort = () => arg20(null)),
                      (value12.onsuccess = () => {
                        const value13 = value12.result;
                        !value3 &&
                        value13?.version === SCENE_PREPARATION_VERSION &&
                        Date.now() - value13.created < 7 * 86400000
                          ? (map2.set(arg19, value13),
                            object1.hits++,
                            fn1("restored"),
                            arg20(value13))
                          : arg20(null);
                      }));
                  } catch {
                    arg20(null);
                  }
                })
                .catch(() => arg20(null));
            }),
          ),
        map1.get(arg19));
  }
  function fn5(arg22, arg23, arg24) {
    if (!arg22 || value3 || !arg23?.syncKey || !K(arg24)) return;
    let value14;
    try {
      value14 = {
        key: arg22,
        version: SCENE_PREPARATION_VERSION,
        syncKey: arg23.syncKey,
        document: arg11.structuredClone(arg24),
        created: Date.now(),
      };
    } catch {
      return;
    }
    value4 = value4.then(
      () =>
        new Promise((arg25) => {
          const fn7 = async () => {
            try {
              const value15 = value2 || (await fn3());
              if (
                !value15 ||
                value3 ||
                ((value14.bytes = JSON.stringify(value14).length * 2), value14.bytes > 8388608)
              )
                return;
              (await fn2((arg26) => {
                const value16 = value15.transaction(f, "readwrite"),
                  value17 = value16.objectStore(f);
                ((value16.oncomplete = () => arg26(true)),
                  (value16.onerror = value16.onabort = () => arg26(false)),
                  value17.put(value14));
                const value18 = value17.getAll();
                value18.onsuccess = () => {
                  const value19 = value18.result.sort(
                    (arg27, arg28) => arg27.created - arg28.created,
                  );
                  let value20 = value19.reduce((arg29, arg30) => arg29 + (arg30.bytes || 0), 0),
                    value21 = value19.length;
                  for (const value22 of value19) {
                    if (value21 <= 8 && value20 <= 33554432) break;
                    (value17.delete(value22.key), value21--, (value20 -= value22.bytes || 0));
                  }
                };
              }, 1500)) && (object1.writes++, fn1("stored"));
            } catch {
              object1.fallbacks++;
            } finally {
              arg25();
            }
          };
          arg11.requestIdleCallback
            ? arg11.requestIdleCallback(fn7, {
                timeout: 3000,
              })
            : arg11.setTimeout(fn7, 250);
        }),
    );
  }
  return (
    arg11.addEventListener?.(
      "pagehide",
      () => {
        ((value3 = true), map2.clear(), value2?.close());
      },
      {
        once: true,
      },
    ),
    {
      preload: fn4,
      peek: (arg31) => map2.get(arg31) || null,
      schedule: fn5,
      whenIdle: () => value4,
      stats: () => ({
        ...object1,
      }),
    }
  );
}
export function prepareSceneDocument(arg32, arg33, arg34) {
  const value23 = reusableScenePreparation(arg33, arg32);
  return {
    document: value23 ? arg33.document : arg34(arg32.scene),
    reused: value23,
  };
}

import {
  packModelTemplate,
  unpackModelTemplate,
} from "./model-template-codec.js?v=20260923-prepared-v2";
const L = "ha-bridge-3d-templates",
  c = "templates",
  f = "metadata",
  X = 80,
  Y = 64 * 1024 * 1024,
  R = 8 * 1024 * 1024;
export function createModelPersistentCache({
  THREE: arg1,
  env: arg2 = globalThis,
  timeoutMs: arg3 = 1000,
} = {}) {
  let value1,
    value2,
    value3 = false,
    value4 = false,
    value5 = Promise.resolve();
  const object1 = {
      hits: 0,
      misses: 0,
      writes: 0,
      fallbacks: 0,
    },
    value6 =
      new URLSearchParams(arg2.location?.search || "").get("performance-diagnostics") === "1",
    fn1 = (arg4) => {
      value6 &&
        arg2.console?.info(
          "[3D-model-cache]",
          JSON.stringify({
            event: arg4,
            ...object1,
          }),
        );
    };
  function fn2() {
    (object1.fallbacks++, fn1("fallback"));
  }
  function fn3() {
    try {
      return !value4 && !!arg2.indexedDB && !!arg1.ObjectLoader;
    } catch {
      return false;
    }
  }
  function fn4(arg5, { duration: arg6 = arg3, disable: arg7 = true } = {}) {
    return new Promise((arg8) => {
      let value7 = false;
      const fn9 = (arg9) => {
          value7 || ((value7 = true), arg2.clearTimeout(value8), arg8(arg9));
        },
        value8 = arg2.setTimeout(() => {
          (arg7 && (value4 = true), fn2(), fn9(null));
        }, arg6);
      try {
        arg5(fn9);
      } catch {
        fn9(null);
      }
    });
  }
  function fn5() {
    return fn3()
      ? ((value1 ||= fn4(
          (arg10) => {
            const value9 = arg2.indexedDB.open(L, 2);
            ((value9.onupgradeneeded = () => {
              (value9.result.objectStoreNames.contains(c) ||
                value9.result.createObjectStore(c, {
                  keyPath: "key",
                }),
                value9.result.objectStoreNames.contains(f) ||
                  value9.result.createObjectStore(f, {
                    keyPath: "key",
                  }));
            }),
              (value9.onerror = value9.onblocked =
                () => {
                  ((value4 = true), fn2(), arg10(null));
                }),
              (value9.onsuccess = () => {
                const value10 = value9.result;
                if (value4) {
                  (value10.close(), arg10(null));
                  return;
                }
                ((value10.onversionchange = () => {
                  ((value4 = true), value10.close());
                }),
                  (value2 = value10),
                  arg10(value10));
              }));
          },
          {
            duration: Math.max(arg3, 1500),
          },
        )),
        value1)
      : Promise.resolve(null);
  }
  async function fn6(arg11) {
    if (!fn3() || (value3 && !value2)) return null;
    const value11 =
      value2 ||
      (await fn4(
        (arg12) => {
          fn5().then(arg12);
        },
        {
          disable: false,
          duration: Math.min(arg3, 150),
        },
      ));
    if ((value11 || (value3 = true), !value11 || value4)) return null;
    const value12 = await fn4((arg13) => {
      const value13 = value11.transaction(c, "readonly"),
        value14 = value13.objectStore(c).get(arg11);
      ((value14.onsuccess = () => arg13(value14.result)),
        (value14.onerror = value13.onabort = () => arg13(null)));
    });
    if (!value12) return (object1.misses++, fn1("miss"), null);
    try {
      const value15 = unpackModelTemplate(arg1, value12.template);
      return (object1.hits++, fn1("hit"), value15);
    } catch {
      fn2();
      try {
        const value16 = value11.transaction([c, f], "readwrite");
        ((value16.onerror = () => {}),
          value16.objectStore(c).delete(arg11),
          value16.objectStore(f).delete(arg11));
      } catch {}
      return null;
    }
  }
  async function fn7(arg14, arg15) {
    const value17 = await fn5();
    if (!value17 || value4) return;
    let value18;
    try {
      value18 = packModelTemplate(arg1, arg15);
    } catch {
      fn2();
      return;
    }
    if (value18.bytes > R) return;
    (await fn4((arg16) => {
      const value19 = value17.transaction([c, f], "readwrite"),
        value20 = value19.objectStore(c),
        value21 = value19.objectStore(f);
      ((value19.oncomplete = () => arg16(true)),
        (value19.onabort = value19.onerror = () => arg16(false)),
        value20.put({
          key: arg14,
          template: value18,
          bytes: value18.bytes,
          created: Date.now(),
        }),
        value21.put({
          key: arg14,
          bytes: value18.bytes,
          created: Date.now(),
        }));
      const value22 = value21.getAll();
      value22.onsuccess = () => {
        const value23 = value22.result;
        value23.sort((arg17, arg18) => arg17.created - arg18.created);
        let value24 = value23.reduce((arg19, arg20) => arg19 + (arg20.bytes || 0), 0),
          value25 = value23.length;
        for (const value26 of value23) {
          if (value25 <= X && value24 <= Y) break;
          (value20.delete(value26.key),
            value21.delete(value26.key),
            value25--,
            (value24 -= value26.bytes || 0));
        }
      };
    }))
      ? (object1.writes++, fn1("stored"))
      : ((value4 = true), fn2());
  }
  function fn8(arg21, arg22) {
    fn3() &&
      (value5 = value5.then(
        () =>
          new Promise((arg23) => {
            const fn10 = () => {
              fn7(arg21, arg22).catch(fn2).finally(arg23);
            };
            arg2.requestIdleCallback
              ? arg2.requestIdleCallback(fn10, {
                  timeout: 3000,
                })
              : arg2.setTimeout(fn10, 250);
          }),
      ));
  }
  return (
    fn1(fn3() ? "enabled" : "unavailable"),
    fn3() && fn5(),
    arg2.addEventListener?.(
      "pagehide",
      () => {
        ((value4 = true), value2?.close());
      },
      {
        once: true,
      },
    ),
    {
      restore: fn6,
      schedule: fn8,
      stats: () => ({
        ...object1,
      }),
      whenIdle: () => value5,
    }
  );
}

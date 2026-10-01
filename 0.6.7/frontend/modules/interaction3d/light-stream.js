export function createLightStream({
  onStates: arg1 = () => {},
  onPatch: arg2 = null,
  createSocket: arg3 = (arg7) => new window.WebSocket(arg7),
  socketURL: arg4 = () => {
    const uRL1 = new URL("/api/v1/ws/runtime", location.origin);
    return ((uRL1.protocol = uRL1.protocol === "https:" ? "wss:" : "ws:"), uRL1.href);
  },
  setTimer: arg5 = (arg8, arg9) => setTimeout(arg8, arg9),
  clearTimer: arg6 = (arg10) => clearTimeout(arg10),
} = {}) {
  let list1 = [],
    set1 = new Set(),
    map1 = new Map(),
    value1 = false,
    value2 = false,
    value3 = false,
    value4 = null,
    value5 = null,
    value6 = 0,
    value7 = 0,
    value8 = null,
    value9 = null;
  const fn1 = (arg11) => ({
      entityId: arg11,
      state: "unavailable",
      available: false,
      attributes: {},
    }),
    fn2 = () =>
      arg1(
        value3
          ? Object.fromEntries(
              list1.map((arg12) => [arg12, structuredClone(map1.get(arg12) || fn1(arg12))]),
            )
          : {},
      ),
    fn3 = (arg13) =>
      typeof arg2 == "function"
        ? arg2({
            [arg13]: structuredClone(map1.get(arg13) || fn1(arg13)),
          })
        : fn2();
  function fn4() {
    ((map1 = new Map()), (value3 = false), fn2());
  }
  function fn5() {
    (value8 !== null && arg6(value8), value9 !== null && arg6(value9), (value8 = value9 = null));
  }
  function fn6() {
    ((value6 += 1), fn5());
    const value10 = value4;
    ((value4 = null), value5?.(), (value5 = null));
    try {
      value10?.close();
    } catch {}
  }
  function fn7() {
    if (value2 || !value1 || !list1.length || value8 !== null) return;
    const value11 = Math.min(15000, 500 * 2 ** Math.min(value7++, 5));
    value8 = arg5(() => {
      ((value8 = null), fn8());
    }, value11);
  }
  function fn8() {
    if (value2 || !value1 || !list1.length || value4) return;
    const value12 = ++value6;
    let value13;
    try {
      value13 = arg3(typeof arg4 == "function" ? arg4() : arg4);
    } catch {
      (fn4(), fn7());
      return;
    }
    value4 = value13;
    const fn9 = () => !value2 && value1 && value12 === value6 && value4 === value13,
      fn10 = (arg14 = 0) => {
        fn9() && (fn6(), fn4(), [4400, 4401, 4403].includes(arg14) || fn7());
      };
    function fn11(arg15) {
      (value9 !== null && arg6(value9), (value9 = arg5(() => fn10(), arg15)));
    }
    const object1 = {
      open() {
        if (fn9())
          try {
            value13.send(
              JSON.stringify({
                type: "subscribe",
                entityIds: list1,
              }),
            );
          } catch {
            fn10();
          }
      },
      message(arg16) {
        if (!fn9()) return;
        let value14;
        try {
          value14 = JSON.parse(arg16.data);
        } catch {
          return;
        }
        if (!(!value14 || typeof value14 != "object")) {
          if (value14.type === "resync_required") {
            (fn6(), fn4(), fn8());
            return;
          }
          if (value14.type === "snapshot" && Array.isArray(value14.states)) {
            const map2 = new Map();
            for (const value15 of value14.states)
              set1.has(value15?.entityId) &&
                typeof value15.state == "string" &&
                map2.set(value15.entityId, structuredClone(value15));
            ((map1 = map2), (value3 = true), (value7 = 0), fn11(65000), fn2());
          } else
            value3 &&
            value14.type === "state_changed" &&
            set1.has(value14.entityId) &&
            typeof value14.state == "string"
              ? (map1.set(value14.entityId, structuredClone(value14)),
                fn11(65000),
                fn3(value14.entityId))
              : value3 && value14.type === "state_removed" && set1.has(value14.entityId)
                ? (map1.delete(value14.entityId), fn11(65000), fn3(value14.entityId))
                : value3 && value14.type === "ping" && fn11(65000);
        }
      },
      close(arg17) {
        fn10(arg17.code);
      },
      error() {
        fn10();
      },
    };
    for (const [value16, value17] of Object.entries(object1))
      value13.addEventListener(value16, value17);
    ((value5 = () => {
      for (const [value18, value19] of Object.entries(object1))
        value13.removeEventListener(value18, value19);
    }),
      fn11(12000));
  }
  return {
    configure(arg18 = [], { additionalEntityIds: arg19 = [] } = {}) {
      if (value2) return;
      const set2 = new Set(
          arg19.filter((arg20) => typeof arg20 == "string" && /^[a-z_]+\.[a-z0-9_]+$/.test(arg20)),
        ),
        value20 = [
          ...new Set(
            arg18.filter(
              (arg21) =>
                typeof arg21 == "string" &&
                (set2.has(arg21) ||
                  /^(light|switch|climate|cover|binary_sensor|event|input_boolean|sensor|media_player|vacuum|camera|image|script|button)\.[a-z0-9_]+$/.test(
                    arg21,
                  )),
            ),
          ),
        ].sort();
      (value20.length === list1.length &&
        value20.every((arg22, arg23) => arg22 === list1[arg23])) ||
        (fn6(), (list1 = value20), (set1 = new Set(list1)), (value7 = 0), fn4(), fn8());
    },
    setActive(arg24) {
      value2 ||
        value1 === (arg24 === true) ||
        ((value1 = arg24 === true), (value7 = 0), value1 ? fn8() : (fn6(), fn4()));
    },
    dispose() {
      value2 ||
        ((value2 = true), (value1 = false), fn6(), (list1 = []), set1.clear(), map1.clear());
    },
  };
}

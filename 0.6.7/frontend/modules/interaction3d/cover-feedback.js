export function createCoverFeedback({
  now: arg3 = () => performance.now(),
  smoothingTime: arg4 = 180,
  commandPreview: arg5 = false,
  travelTime: arg6 = 6000,
  storage: arg1,
  scope: arg2,
  wallNow: arg7 = () => Date.now(),
} = {}) {
  const map1 = new Map(),
    fn1 = (arg8) => Date.parse(arg8.raw?.last_updated ?? arg8.raw?.updatedAt ?? ""),
    fn2 = (arg9) => (arg2 ? "hb-cover-presentation:v1:" + arg2 + ":" + arg9 : null),
    fn3 = (arg10) => arg5 && arg10.actual.dream && arg10.actual.overallFeedbackAvailable === false;
  function fn4(arg11) {
    try {
      const value1 = fn2(arg11);
      value1 && arg1?.removeItem(value1);
    } catch {}
  }
  function fn5(arg12, arg13) {
    if (!fn3(arg13) || !arg13.estimated || arg13.position === null) return;
    const value2 = arg13.motion,
      object1 = {
        position: arg13.position,
        savedAt: arg7(),
        motion: value2
          ? {
              to: value2.to,
              duration: Math.max(0, value2.duration - (arg3() - value2.start)),
            }
          : null,
      };
    try {
      const value3 = fn2(arg12);
      value3 && arg1?.setItem(value3, JSON.stringify(object1));
    } catch {}
  }
  function fn6(arg14, arg15) {
    if (!fn3(arg15)) {
      fn4(arg14);
      return;
    }
    try {
      const value4 = fn2(arg14),
        value5 = value4 && JSON.parse(arg1?.getItem(value4) || "null"),
        fn18 = (arg16) =>
          typeof arg16 == "number" && Number.isFinite(arg16) && arg16 >= 0 && arg16 <= 100;
      if (!value5 || !fn18(value5.position) || !Number.isFinite(value5.savedAt)) return;
      const value6 = Math.max(0, arg7() - value5.savedAt),
        value7 = value5.motion;
      if (
        value7 &&
        (!fn18(value7.to) ||
          !Number.isFinite(value7.duration) ||
          value7.duration < 0 ||
          value7.duration > arg6)
      )
        return;
      if (((arg15.position = value5.position), value7)) {
        const value8 = value7.duration > 0 ? Math.min(1, value6 / value7.duration) : 1;
        ((arg15.position += (value7.to - arg15.position) * value8),
          value8 < 1 &&
            (arg15.motion = {
              from: arg15.position,
              to: value7.to,
              start: arg3(),
              duration: value7.duration - value6,
            }));
      }
      ((arg15.estimated = true), (arg15.railUnconfirmed = true));
    } catch {}
  }
  function fn7(arg17, arg18) {
    if (!arg17.motion) return false;
    const { from: value9, to: value10, start: value11, duration: value12 = arg4 } = arg17.motion,
      value13 = Math.max(0, Math.min(1, (arg18 - value11) / value12));
    return (
      (arg17.position = value9 + (value10 - value9) * value13),
      value13 === 1 && (arg17.motion = null),
      true
    );
  }
  function fn8(arg19, arg20) {
    const value14 = arg5 && arg19.actual.axis !== "blade";
    if (
      arg20 === null ||
      arg19.position === null ||
      arg4 <= 0 ||
      (!value14 && !arg19.actual.moving && arg19.actual.axis !== "blade")
    ) {
      ((arg19.position = arg20), (arg19.motion = null));
      return;
    }
    if (arg19.motion?.to === arg20) return;
    const value15 = Math.abs(arg20 - arg19.position),
      value16 =
        value14 && !arg19.actual.moving && arg19.intent?.service !== "stop_cover"
          ? Math.max(arg4, Math.min(1200, (value15 / 100) * arg6))
          : arg4;
    arg19.motion =
      value15 === 0
        ? null
        : {
            from: arg19.position,
            to: arg20,
            start: arg3(),
            duration: value16,
          };
  }
  function fn9(arg21, arg22) {
    let value17 = map1.get(arg21);
    if (!value17) {
      ((value17 = {
        actual: arg22,
        position: arg22.position,
        motion: null,
        intent: null,
        token: null,
        error: "",
        draft: null,
        bladeHold: null,
        railUnconfirmed: false,
        estimated: false,
        lastAvailable: arg22.available ? arg22 : null,
        lastTimestamp: fn1(arg22),
      }),
        fn6(arg21, value17),
        map1.set(arg21, value17));
      return;
    }
    const value18 = value17.actual;
    if (fn1(arg22) < value17.lastTimestamp) return;
    if (
      (Number.isFinite(fn1(arg22)) && (value17.lastTimestamp = fn1(arg22)),
      arg22.dream !== value18.dream ||
        arg22.overallFeedbackAvailable !== value18.overallFeedbackAvailable)
    ) {
      (map1.delete(arg21), fn9(arg21, arg22));
      return;
    }
    const value19 = arg22.position !== value18.position,
      value20 = arg22.state !== value18.state,
      value21 =
        !value17.lastAvailable ||
        arg22.position !== value17.lastAvailable.position ||
        arg22.state !== value17.lastAvailable.state;
    if (((value17.actual = arg22), fn7(value17, arg3()), !arg22.available)) {
      ((value17.motion = null),
        (value17.intent = null),
        (value17.draft = null),
        (value17.bladeHold = null),
        (value17.railUnconfirmed = !!arg22.dream),
        fn5(arg21, value17));
      return;
    }
    if (((value17.lastAvailable = arg22), value17.bladeHold !== null)) {
      if (arg22.position !== value17.bladeHold) return;
      ((value17.position = arg22.position),
        (value17.motion = null),
        (value17.estimated = false),
        (value17.bladeHold = null),
        (value17.intent = null));
      return;
    }
    const value22 = value17.intent?.direction;
    if (
      (arg5 &&
      !arg22.dream &&
      arg22.axis !== "blade" &&
      value17.intent?.target !== null &&
      ((value22 > 0 && arg22.opening) || (value22 < 0 && arg22.closing)) &&
      arg22.position !== null &&
      value17.position !== null &&
      (arg22.position - value17.position) * value22 < 0
        ? (value17.estimated = true)
        : (value19 ||
            (value17.estimated &&
              arg22.axis === "blade" &&
              !value17.intent &&
              fn1(arg22) > fn1(value18)) ||
            (value20 && !arg22.moving)) &&
          ((value17.estimated = false), fn8(value17, arg22.position)),
      value21 &&
        arg22.overallFeedbackAvailable !== false &&
        ((value17.railUnconfirmed = false), value17.intent))
    ) {
      const value23 = arg22.position !== null && arg22.position === value17.intent.target;
      (!arg22.moving &&
        (value23 || value17.intent.service === "stop_cover" || value17.intent.confirmed)) ||
      (value19 && !arg22.moving)
        ? (value17.intent = null)
        : arg22.moving && ((value17.intent.confirmed = true), (value17.intent.expires = Infinity));
    }
  }
  function fn10(arg23, arg24, { defer: arg25 = false } = {}) {
    const value24 = map1.get(arg23.entityId);
    if (!value24) return;
    (fn7(value24, arg3()), (value24.error = ""), (value24.token = arg24));
    const value25 = value24.draft;
    ((value24.draft = null), (value24.bladeHold = null));
    const value26 =
        arg23.service === "open_cover"
          ? 100
          : arg23.service === "close_cover"
            ? 0
            : arg23.service === "stop_cover"
              ? null
              : arg23.data.position,
      value27 =
        arg23.service === "open_cover"
          ? 1
          : arg23.service === "close_cover"
            ? -1
            : value26 === null
              ? 0
              : Math.sign(value26 - (value24.position ?? value24.actual.position ?? value26));
    (arg5 &&
      arg23.service === "set_cover_position" &&
      value25 !== null &&
      value25 === value26 &&
      ((value24.position = value25),
      (value24.motion = null),
      (value24.estimated = true),
      value24.actual.axis === "blade" && (value24.bladeHold = value26)),
      (arg23.service === "stop_cover" || arg25) && (value24.motion = null),
      (value24.intent = {
        service: arg23.service,
        target: value26,
        direction: value27,
        confirmed: false,
        expires: arg3() + 15000,
      }),
      arg5 && !arg25 && value26 !== null && fn11(arg23.entityId, arg24),
      value24.actual.dream &&
        ["open_cover", "close_cover", "stop_cover"].includes(arg23.service) &&
        (value24.railUnconfirmed =
          value24.railUnconfirmed ||
          arg23.service === "open_cover" ||
          !value24.actual.closedConfirmed),
      fn5(arg23.entityId, value24));
  }
  function fn11(arg26, arg27) {
    const value28 = map1.get(arg26);
    if (!arg5 || !value28?.intent || value28.token !== arg27 || value28.intent.target === null)
      return false;
    fn7(value28, arg3());
    const value29 = value28.position ?? 0,
      value30 = value28.intent.target;
    return (
      (value28.position = value29),
      (value28.estimated =
        value29 !== value30 || value28.actual.position !== value30 || value28.railUnconfirmed),
      (value28.motion =
        value29 === value30
          ? null
          : {
              from: value29,
              to: value30,
              start: arg3(),
              duration: Math.max(180, (Math.abs(value30 - value29) / 100) * arg6),
            }),
      fn5(arg26, value28),
      true
    );
  }
  function fn12(arg28, arg29, arg30) {
    const value31 = map1.get(arg28);
    return !value31 || value31.token !== arg29
      ? false
      : (fn7(value31, arg3()),
        (value31.motion = null),
        (value31.intent = null),
        (value31.draft = null),
        (value31.bladeHold = null),
        (value31.error = arg30),
        value31.actual.position !== null &&
          ((value31.position = value31.actual.position), (value31.estimated = false)),
        fn4(arg28),
        true);
  }
  function fn13(arg31, arg32) {
    const value32 = map1.get(arg31);
    if (!value32) return arg32;
    const value33 = !!(arg5 && value32.motion),
      value34 = value33 ? value32.motion.to > value32.motion.from : value32.actual.opening,
      value35 = value33 ? value32.motion.to < value32.motion.from : value32.actual.closing;
    return {
      ...value32.actual,
      position: (arg5 ? value32.draft : null) ?? value32.position,
      estimated: value32.estimated,
      dragging: !!(arg5 && value32.draft !== null),
      state: value33 ? (value34 ? "opening" : "closing") : value32.actual.state,
      opening: value34,
      closing: value35,
      moving: value34 || value35,
      on:
        value32.actual.available &&
        (fn3(value32) && value32.estimated ? value32.position > 0 : value32.actual.on),
      closedConfirmed: !!(
        value32.actual.closedConfirmed &&
        !value32.railUnconfirmed &&
        !value32.motion &&
        !value32.estimated
      ),
      awaitingArrival: value32.railUnconfirmed,
      targetPosition: value32.draft ?? value32.intent?.target ?? null,
      pendingService: value32.intent?.service || "",
      preview: !!value32.intent,
      error: value32.error,
    };
  }
  function fn14(arg33 = arg3()) {
    let value36 = false;
    for (const value37 of map1.values())
      (value37.intent?.expires <= arg33 &&
        ((value37.intent = null),
        (value36 = true),
        value37.actual.axis === "blade" &&
          ((value37.motion = null),
          (value37.position = value37.actual.position),
          (value37.estimated = false),
          (value37.bladeHold = null))),
        (value36 = fn7(value37, arg33) || value36));
    return value36;
  }
  function fn15(arg34 = arg3()) {
    let value38 = Infinity;
    for (const value39 of map1.values())
      value38 = Math.min(
        value38,
        value39.motion ? 1000 / 30 : Infinity,
        value39.intent ? Math.max(0, value39.intent.expires - arg34) : Infinity,
      );
    return value38;
  }
  function fn16(arg35) {
    const set1 = new Set(arg35);
    for (const value40 of map1.keys()) set1.has(value40) || map1.delete(value40);
  }
  function fn17(arg36, arg37) {
    const value41 = map1.get(arg36);
    value41 && (value41.draft = Number.isFinite(arg37) ? Math.max(0, Math.min(100, arg37)) : null);
  }
  return {
    sync: fn9,
    begin: fn10,
    startPreview: fn11,
    fail: fn12,
    read: fn13,
    tick: fn14,
    nextDelay: fn15,
    retain: fn16,
    preview: fn17,
    clear: () => map1.clear(),
  };
}

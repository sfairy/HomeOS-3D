import { lockState } from "./lock-state.js";
export function createLockMotion(arg1) {
  const map1 = new Map(),
    set1 = new Set(),
    fn1 = (arg2) => {
      arg2?.userData &&
        (arg2.userData.environmentOutlineRevision =
          (arg2.userData.environmentOutlineRevision || 0) + 1);
    },
    weakMap1 = new WeakMap();
  let value1 = arg1.modelRoot,
    value2 = null,
    value3,
    value4 = null;
  const fn2 = (arg3) => {
    for (let value5 = arg3; value5; value5 = value5.parent) if (value5 === value1) return true;
    return false;
  };
  function fn3(arg4, arg5) {
    arg4.position.y = arg5;
    const value6 = Number(
      arg4.userData?.doorRollerOpenTranslation ?? arg4.parent?.userData?.doorRollerOpenTranslation,
    );
    arg4.scale && value6 > 0 && (arg4.scale.y = Math.max(0.001, 1 - arg5 / value6));
  }
  function fn4() {
    for (const [value7, value8] of map1)
      (value8.kind === "slide"
        ? (value7.position.x = value8.rest)
        : value8.kind === "roller"
          ? fn3(value7, value8.rest)
          : (value7.rotation.y = value8.rest),
        fn1(value7.parent));
    for (const value9 of set1) delete value9.userData.environmentOutlineMoving;
    (set1.clear(), map1.clear(), (value2 = null), (value4 = null));
  }
  function fn5(arg6, arg7) {
    return arg7.find(
      (arg8) =>
        arg8.modelId === arg6?.userData?.environmentModelId &&
        arg8.floorId === arg6?.userData?.environmentFloorId,
    );
  }
  function fn6(arg9, arg10, arg11, arg12) {
    const value10 = arg10.userData?.doorAnimationType || "entry";
    if (value10 === "static") return null;
    const value11 = lockState(arg9, arg12).doorOpen;
    if (value11 === null) return null;
    if (value10 === "sliding") {
      if (Number.isFinite(arg11.userData?.doorSlideSide)) {
        const value17 = arg9.openDirection === -1 ? -1 : 1;
        return {
          kind: "slide",
          value:
            value11 && arg11.userData.doorSlideSide === -value17
              ? value17 * arg11.userData.doorSlideTravel
              : 0,
        };
      }
      const value15 = Number(arg10.userData?.doorSlideOpenTranslation),
        value16 = Number(arg10.userData?.doorSlideClosedTranslation ?? 0);
      return Number.isFinite(value15)
        ? {
            kind: "slide",
            value: value11 ? value15 * (arg9.openDirection ?? 1) : value16,
          }
        : null;
    }
    if (value10 === "roller") {
      const value18 = Number(
          arg10.userData?.doorRollerOpenTranslation ?? arg11.userData?.doorRollerOpenTranslation,
        ),
        value19 = Number(arg10.userData?.doorRollerClosedTranslation ?? 0);
      return Number.isFinite(value18)
        ? {
            kind: "roller",
            value: value11 ? value18 : value19,
          }
        : null;
    }
    const value12 = Number(arg11.userData?.doorOpenRotation ?? arg10.userData?.doorOpenRotation);
    if (Number.isFinite(value12)) {
      const value20 = Number(arg9.openAngle),
        value21 = Number.isFinite(value20)
          ? (Math.abs(value20) * Math.PI) / 180
          : Math.abs(value12);
      return {
        kind: "hinge",
        value: value11
          ? Math.sign(value12) * value21 * (arg9.openDirection ?? 1)
          : Number(arg10.userData?.doorClosedRotation ?? 0),
      };
    }
    const value13 = ((arg9.openAngle ?? 80) * Math.PI) / 180,
      value14 = arg9.hinge === "right" ? 1 : -1;
    return {
      kind: "hinge",
      value: value11
        ? value13 * (arg9.openDirection ?? 1) * value14
        : Number(arg10.userData?.doorClosedRotation ?? 0),
    };
  }
  function fn7(arg13, arg14, arg15, arg16 = false) {
    if (
      (value1 !== arg1.modelRoot && (fn4(), (value1 = arg1.modelRoot)), !arg14?.length && !arg16)
    ) {
      const value26 = map1.size > 0;
      return (fn4(), value26 && (arg1.invalidateReflections?.(), arg1.requestRender?.()), false);
    }
    const value22 = arg1.environmentRevision ?? arg1.sceneRevision;
    (!value4 || arg16 || value3 !== value22) &&
      ((value3 = value22),
      (value4 = []),
      value1?.traverse((arg17) => {
        (arg17.userData?.doorHingePivot ||
          arg17.userData?.entryDoorPivot ||
          arg17.userData?.doorSlidePivot ||
          arg17.userData?.doorRollerPivot) &&
          value4.push(arg17);
      }));
    const value23 =
      arg16 || value2 === null ? 0 : Math.min(0.1, Math.max(0, (arg13 - value2) / 1000));
    value2 = arg13;
    const set2 = new Set(),
      map2 = new Map();
    let value24 = false,
      value25 = false;
    ((value4 = value4.filter(fn2)),
      value4.forEach((arg18) => {
        const value27 = arg18.userData?.doorHingePivot || arg18.userData?.entryDoorPivot,
          value28 = arg18.userData?.doorSlidePivot,
          value29 = arg18.userData?.doorRollerPivot;
        if (!value27 && !value28 && !value29) return;
        const value30 = arg18.parent,
          value31 = fn5(value30, arg14 || []),
          value32 = weakMap1.get(arg18);
        if ((value32 && weakMap1.delete(arg18), !value30 || !value31)) {
          value32 &&
            (value32.kind === "slide"
              ? (arg18.position.x = value32.rest)
              : value32.kind === "roller"
                ? fn3(arg18, value32.rest)
                : (arg18.rotation.y = value32.rest),
            (value25 = true),
            fn1(value30));
          return;
        }
        set2.add(arg18);
        const list1 = [arg18.position?.x, arg18.position?.y, arg18.rotation?.y, arg18.scale?.y],
          value33 = fn6(value31, value30, arg18, arg15),
          value34 = value28 ? "slide" : value29 ? "roller" : "hinge";
        let value35 = map1.get(arg18);
        if (
          ((!value35 || value35.kind !== value34) &&
            ((value35 = {
              kind: value34,
              rest:
                value32?.rest ??
                (value34 === "slide"
                  ? Number(arg18.userData?.doorRestTranslation ?? arg18.position.x) || 0
                  : value34 === "roller"
                    ? Number(arg18.userData?.doorRestTranslation ?? arg18.position.y) || 0
                    : Number(arg18.userData?.doorRestRotation ?? arg18.rotation.y) || 0),
              target:
                value33?.value ??
                (value34 === "slide"
                  ? arg18.position.x
                  : value34 === "roller"
                    ? arg18.position.y
                    : arg18.rotation.y),
            }),
            map1.set(arg18, value35),
            value33 &&
              (value34 === "slide"
                ? (arg18.position.x = value33.value)
                : value34 === "roller"
                  ? fn3(arg18, value33.value)
                  : (arg18.rotation.y = value33.value),
              (value25 = true))),
          value27 && !arg18.userData?.doorFixedHinge)
        ) {
          const value41 = Number(
            value30.userData?.doorLeafWidth ?? value30.userData?.entryDoorLeafWidth ?? 0.8,
          );
          arg18.position.x = ((value31.hinge === "right" ? 1 : -1) * Math.abs(value41)) / 2;
        }
        value33 && (value35.target = value33.value);
        const value36 =
            value34 === "slide"
              ? arg18.position.x
              : value34 === "roller"
                ? arg18.position.y
                : arg18.rotation.y,
          value37 = value35.target - value36,
          value38 = Math.max(0.2, Number(value31.duration) || 0.7),
          value39 =
            (Math.max(
              value34 === "slide"
                ? Math.abs(Number(value30.userData?.doorSlideOpenTranslation) || 0)
                : value34 === "roller"
                  ? Math.abs(
                      Number(
                        value30.userData?.doorRollerOpenTranslation ??
                          arg18.userData?.doorRollerOpenTranslation,
                      ) || 0,
                    )
                  : (Math.abs(Number(value31.openAngle) || 80) * Math.PI) / 180,
              0.01,
            ) *
              value23) /
            value38;
        if (Math.abs(value37) > 0.0001) {
          const value42 = value36 + Math.sign(value37) * Math.min(Math.abs(value37), value39);
          (value34 === "slide"
            ? (arg18.position.x = value42)
            : value34 === "roller"
              ? fn3(arg18, value42)
              : (arg18.rotation.y = value42),
            (value24 = true),
            (value25 = true));
        }
        const list2 = [arg18.position?.x, arg18.position?.y, arg18.rotation?.y, arg18.scale?.y];
        list1.some((arg19, arg20) => arg19 !== list2[arg20]) && fn1(value30);
        const value40 =
          value34 === "slide"
            ? arg18.position.x
            : value34 === "roller"
              ? arg18.position.y
              : arg18.rotation.y;
        map2.set(value30, !!map2.get(value30) || Math.abs(value35.target - value40) > 0.0001);
      }));
    for (const [value43, value44] of map1)
      set2.has(value43) ||
        (fn5(value43.parent, arg14 || [])
          ? weakMap1.set(value43, {
              kind: value44.kind,
              rest: value44.rest,
            })
          : value44.kind === "slide"
            ? (value43.position.x = value44.rest)
            : value44.kind === "roller"
              ? fn3(value43, value44.rest)
              : (value43.rotation.y = value44.rest),
        fn1(value43.parent),
        map1.delete(value43),
        (value25 = true));
    for (const value45 of new Set([...set1, ...map2.keys()])) {
      const value46 = map2.get(value45) === true;
      (value45.userData.environmentOutlineMoving !== value46 && (value25 = true),
        (value45.userData.environmentOutlineMoving = value46));
    }
    set1.clear();
    for (const value47 of map2.keys()) set1.add(value47);
    return (value25 && (arg1.invalidateReflections?.(), arg1.requestRender?.()), value24);
  }
  return {
    tick: fn7,
    sync(arg21, arg22) {
      return fn7(null, arg21, arg22, true);
    },
    dispose: fn4,
  };
}

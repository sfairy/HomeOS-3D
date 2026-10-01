export function vacuumMapAvailable(arg1) {
  const value1 = arg1 && Object.hasOwn(arg1, "newState") ? arg1.newState : arg1;
  if (!value1 || ["unavailable", "unknown"].includes(String(value1.state || "").toLowerCase()))
    return false;
  const value2 = value1.attributes || {};
  if (value2.is_empty === true || value2.empty_map === true) return false;
  if (Object.hasOwn(value2, "calibration_points")) {
    const value3 = value2.calibration_points;
    if (!Array.isArray(value3) || value3.length < 3) return false;
    const [value4, value5, value6] = value3;
    for (const value7 of ["map", "vacuum"]) {
      if (
        ![value4, value5, value6].every(
          (arg2) => Number.isFinite(arg2?.[value7]?.x) && Number.isFinite(arg2?.[value7]?.y),
        )
      )
        return false;
      const value8 =
        (value5[value7].x - value4[value7].x) * (value6[value7].y - value4[value7].y) -
        (value5[value7].y - value4[value7].y) * (value6[value7].x - value4[value7].x);
      if (Math.abs(value8) < 1e-9) return false;
    }
  }
  return true;
}
export function vacuumMapSource(arg3, arg4 = Date.now()) {
  return /^(camera|image)\.[a-z0-9_]+$/.test(arg3 || "")
    ? "/api/" +
        (arg3.startsWith("camera.") ? "camera" : "image") +
        "_proxy/" +
        encodeURIComponent(arg3) +
        "?hb=" +
        encodeURIComponent(arg4) +
        "&hb_live=1"
    : "";
}
export function createVacuumMapImageLoader({
  entityId: arg5,
  getState: arg6,
  isActive: arg7,
  onFrame: arg8,
  onUnavailable: arg9,
}) {
  let value9 = false,
    value10 = false,
    value11 = null,
    value12 = null,
    value13 = null,
    value14 = 0,
    value15 = 0,
    text1 = "",
    value16 = -Infinity,
    value17 = false;
  const fn1 = () => {
      (value14++,
        clearTimeout(value12),
        clearTimeout(value13),
        (value12 = value13 = null),
        value11 &&
          ((value11.onload = value11.onerror = null), (value11.src = ""), (value11 = null)));
    },
    fn2 = () => !value9 && arg7() && vacuumMapAvailable(arg6()),
    fn3 = (arg10) => {
      (clearTimeout(value12),
        (value12 = setTimeout(() => {
          ((value12 = null), fn4());
        }, arg10)));
    };
  function fn4() {
    if (!fn2()) {
      fn5();
      return;
    }
    if (value11) {
      value17 = true;
      return;
    }
    ((value16 = Date.now()), (value17 = false));
    const image1 = new Image(),
      value18 = ++value14;
    value11 = image1;
    const fn6 = (arg11) => {
      if (!(value9 || value18 !== value14)) {
        if (
          (value14++,
          clearTimeout(value13),
          (value13 = null),
          (value11 = null),
          (image1.onload = image1.onerror = null),
          !fn2())
        ) {
          ((image1.src = ""), fn5());
          return;
        }
        (arg11 ? ((value15 = 0), arg8(image1)) : ((image1.src = ""), value15++, arg9()),
          fn3(
            value17
              ? Math.max(0, 1000 - (Date.now() - value16))
              : arg11
                ? 5000
                : Math.min(30000, 1000 * 2 ** Math.min(value15 - 1, 5)),
          ));
      }
    };
    ((image1.onload = () => fn6(true)),
      (image1.onerror = () => fn6(false)),
      (value13 = setTimeout(() => fn6(false), 15000)),
      (image1.src = vacuumMapSource(arg5, Date.now() + "-" + value18)));
  }
  function fn5() {
    if (value9) return;
    const value19 = fn2(),
      value20 = arg6(),
      value21 = value20?.newState || value20 || {},
      value22 = value21.attributes || {},
      value23 = JSON.stringify([
        value21.state,
        value21.updatedAt,
        value21.last_updated,
        value22.image_last_updated,
        value22.frame_id,
        value22.map_id,
        value22.calibration_points,
        value22.is_empty,
      ]);
    if (!value19) {
      (fn1(), (value10 = false), (text1 = value23), arg9());
      return;
    }
    const value24 = !value10,
      value25 = text1 !== value23;
    ((value10 = true),
      (text1 = value23),
      value24
        ? ((value15 = 0), fn4())
        : value25 &&
          (value11 ? (value17 = true) : fn3(Math.max(0, 1000 - (Date.now() - value16)))));
  }
  return {
    sync: fn5,
    dispose() {
      ((value9 = true), fn1(), arg9());
    },
  };
}
